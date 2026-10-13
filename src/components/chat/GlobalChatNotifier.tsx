import { useEffect, useRef, useState, createContext, useContext, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Sincronização da conversa ativa para saber se o usuário já está visualizando
let activeChatConversationId: string | null = null;

export function setActiveChatConversationId(id: string | null) {
  activeChatConversationId = id;
}

export function getActiveChatConversationId(): string | null {
  return activeChatConversationId;
}

// Chime sintetizado via Web Audio API (alta fidelidade e sem dependência de assets externos)
export function playChatChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Tom de notificação moderno D5 -> A5 (587.33Hz -> 880Hz)
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Silencioso em caso de restrição do navegador
  }
}

interface ChatNotificationContextType {
  unreadChatCount: number;
  refreshUnreadCount: () => Promise<void>;
}

const ChatNotificationContext = createContext<ChatNotificationContextType>({
  unreadChatCount: 0,
  refreshUnreadCount: async () => {},
});

export function useChatNotification() {
  return useContext(ChatNotificationContext);
}

export function GlobalChatNotifier({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const currentUserId = user?.id || null;
  const navigate = useNavigate();
  const location = useLocation();

  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const profilesCache = useRef<Record<string, { nome: string; setor?: string }>>({});

  // Atualiza contagem total de mensagens não lidas
  const refreshUnreadCount = async () => {
    if (!currentUserId) {
      setUnreadChatCount(0);
      return;
    }

    try {
      // 1. Busca conversas do usuário
      const { data: convs } = await supabase
        .from("chat_conversations" as any)
        .select("id")
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`);

      if (!convs || convs.length === 0) {
        setUnreadChatCount(0);
        return;
      }

      const convIds = convs.map((c: any) => c.id);

      // 2. Busca settings de cada conversa para saber o last_read_at
      const { data: settings } = await supabase
        .from("chat_conversation_settings" as any)
        .select("conversation_id, last_read_at, is_hidden")
        .eq("user_id", currentUserId);

      const settingsMap: Record<string, any> = {};
      if (settings) {
        settings.forEach((s: any) => {
          settingsMap[s.conversation_id] = s;
        });
      }

      // 3. Conta mensagens não lidas
      let total = 0;
      for (const convId of convIds) {
        const s = settingsMap[convId];
        if (s?.is_hidden) continue;
        const lastRead = s?.last_read_at || "1970-01-01T00:00:00Z";

        const { count } = await supabase
          .from("chat_messages" as any)
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", convId)
          .neq("sender_id", currentUserId)
          .gt("created_at", lastRead);

        total += count || 0;
      }

      setUnreadChatCount(total);
    } catch {
      // silencioso
    }
  };

  // Solicita permissão nativa de notificação do navegador no primeiro clique do usuário
  useEffect(() => {
    const handleFirstClick = () => {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      window.removeEventListener("click", handleFirstClick);
    };
    window.addEventListener("click", handleFirstClick, { once: true });
    return () => window.removeEventListener("click", handleFirstClick);
  }, []);

  // Monitoramento global de mensagens via Realtime
  useEffect(() => {
    if (!currentUserId) return;

    void refreshUnreadCount();

    const channel = supabase
      .channel(`global_chat_notifier_${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        async (payload: any) => {
          const newMsg = payload.new;
          if (!newMsg) return;

          // Se a mensagem foi enviada pelo próprio usuário, não notifica
          if (newMsg.sender_id === currentUserId) return;

          // Se o usuário já está ativo exatamente nessa conversa na tela de chat e com a aba visível
          const activeId = getActiveChatConversationId();
          const isActivelyViewing =
            location.pathname === "/chat" &&
            activeId === newMsg.conversation_id &&
            document.visibilityState === "visible";

          // Atualiza contagem global
          if (!isActivelyViewing) {
            setUnreadChatCount((prev) => prev + 1);
          }

          // Se o usuário NÃO estiver ativamente nessa conversa, SUBIR NOTIFICAÇÃO com áudio!
          if (!isActivelyViewing) {
            playChatChime();

            // Busca nome do remetente
            let senderName = profilesCache.current[newMsg.sender_id]?.nome;
            if (!senderName) {
              try {
                const { data } = await supabase
                  .from("profiles")
                  .select("nome, setor_vinculado")
                  .eq("user_id", newMsg.sender_id)
                  .maybeSingle();

                if (data?.nome) {
                  senderName = data.nome;
                  profilesCache.current[newMsg.sender_id] = {
                    nome: data.nome,
                    setor: (data as any).setor_vinculado,
                  };
                } else {
                  senderName = "Colega de Trabalho";
                }
              } catch {
                senderName = "Colega de Trabalho";
              }
            }

            // 1. Toast interativo e chamativo via Sonner
            toast.custom(
              (t) => (
                <div
                  className="flex items-center gap-3 p-3.5 bg-card text-card-foreground border-2 border-cyan-500/40 shadow-2xl rounded-2xl cursor-pointer hover:border-cyan-500 transition-all w-full max-w-sm pointer-events-auto backdrop-blur-md"
                  onClick={() => {
                    toast.dismiss(t);
                    navigate(`/chat?conv=${newMsg.conversation_id}`);
                  }}
                >
                  <div className="relative">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-md">
                      {senderName.charAt(0).toUpperCase()}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs text-foreground truncate">{senderName}</span>
                      <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono-tech bg-cyan-500/10 px-1.5 py-0.5 rounded-md shrink-0">
                        Chat
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5 leading-snug">
                      {newMsg.content}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 px-2.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg shrink-0 shadow-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.dismiss(t);
                      navigate(`/chat?conv=${newMsg.conversation_id}`);
                    }}
                  >
                    Responder
                  </Button>
                </div>
              ),
              {
                duration: 7000,
                position: "top-right",
              }
            );

            // 2. Notificação nativa do sistema operacional / navegador (caso o app esteja em segundo plano)
            if (
              typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              try {
                const notif = new Notification(`${senderName} te chamou no Chat`, {
                  body: newMsg.content.slice(0, 100),
                  icon: "/favicon.ico",
                  tag: `chat-${newMsg.conversation_id}`,
                });
                notif.onclick = () => {
                  window.focus();
                  navigate(`/chat?conv=${newMsg.conversation_id}`);
                };
              } catch {
                // silencioso
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, location.pathname, navigate]);

  return (
    <ChatNotificationContext.Provider value={{ unreadChatCount, refreshUnreadCount }}>
      {children}
    </ChatNotificationContext.Provider>
  );
}
