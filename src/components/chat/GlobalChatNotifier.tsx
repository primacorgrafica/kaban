import { useEffect, useRef, useState, createContext, useContext, ReactNode, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { markConversationAsRead, getLocalHiddenConversations, setLocalConversationHidden, setLocalHiddenOtherUser } from "@/lib/chatService";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Sincronização da conversa ativa para saber se o usuário já está visualizando
let activeChatConversationId: string | null = null;
let isChatModalOpenFlag = false;
let globalMarkConversationAsViewed: ((conversationId: string) => Promise<void>) | null = null;
let globalRefreshUnreadCount: (() => Promise<void>) | null = null;

export function setActiveChatConversationId(id: string | null) {
  activeChatConversationId = id;
}

export function getActiveChatConversationId(): string | null {
  return activeChatConversationId;
}

export function setChatModalOpen(open: boolean) {
  isChatModalOpenFlag = open;
}

export function isChatModalOpen(): boolean {
  return isChatModalOpenFlag;
}

/**
 * Função global chamada quando o usuário visualiza uma conversa no chat.
 * Dispensa a notificação no topo instantaneamente e sincroniza o status de lida.
 */
export async function notifyConversationViewed(conversationId: string) {
  if (globalMarkConversationAsViewed) {
    await globalMarkConversationAsViewed(conversationId);
  }
}

/**
 * Força atualização global da contagem de mensagens não lidas.
 */
export async function notifyRefreshUnread() {
  if (globalRefreshUnreadCount) {
    await globalRefreshUnreadCount();
  }
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
  unreadByConversation: Record<string, number>;
  refreshUnreadCount: () => Promise<void>;
  markConversationAsViewed: (conversationId: string) => Promise<void>;
}

const ChatNotificationContext = createContext<ChatNotificationContextType>({
  unreadChatCount: 0,
  unreadByConversation: {},
  refreshUnreadCount: async () => {},
  markConversationAsViewed: async () => {},
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
  const [unreadByConversation, setUnreadByConversation] = useState<Record<string, number>>({});
  const profilesCache = useRef<Record<string, { nome: string; setor?: string }>>({});
  const myConvIdsRef = useRef<Set<string>>(new Set());

  // Atualiza contagem de mensagens não lidas (geral e por conversa)
  const refreshUnreadCount = useCallback(async () => {
    if (!currentUserId) {
      setUnreadChatCount(0);
      setUnreadByConversation({});
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
        setUnreadByConversation({});
        return;
      }

      const convIds = convs.map((c: any) => c.id);
      myConvIdsRef.current = new Set(convIds);

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

      // 3. Conta mensagens não lidas em paralelo para máxima velocidade
      const byConv: Record<string, number> = {};
      let total = 0;
      const localHidden = getLocalHiddenConversations(currentUserId);

      await Promise.all(
        convIds.map(async (convId: string) => {
          if (localHidden.has(convId)) return;
          const s = settingsMap[convId];
          if (s?.is_hidden) return;
          const lastRead = s?.last_read_at || "1970-01-01T00:00:00Z";

          const { count } = await supabase
            .from("chat_messages" as any)
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", convId)
            .neq("sender_id", currentUserId)
            .gt("created_at", lastRead);

          const unread = count || 0;
          if (unread > 0) {
            byConv[convId] = unread;
            total += unread;
          }
        })
      );

      setUnreadByConversation(byConv);
      setUnreadChatCount(total);

      // Se zerou tudo, garante que toasts de chat sejam fechados
      if (total === 0) {
        convIds.forEach((id: string) => toast.dismiss(`chat-notif-${id}`));
      }
    } catch {
      // silencioso
    }
  }, [currentUserId]);

  // Marca conversa como visualizada: remove imediatamente a notificação no topo
  const markConversationAsViewed = useCallback(
    async (conversationId: string) => {
      if (!conversationId) return;

      // 1. Imediatamente dispensa toast de notificação da conversa no topo
      toast.dismiss(`chat-notif-${conversationId}`);

      // 2. Atualização de estado local imediata para resposta instantânea na UI (badge do topo some na hora)
      setUnreadByConversation((prev) => {
        if (!prev[conversationId]) return prev;
        const next = { ...prev };
        delete next[conversationId];
        const newTotal = Object.values(next).reduce((acc, c) => acc + c, 0);
        setUnreadChatCount(newTotal);
        if (newTotal === 0) {
          toast.dismiss();
        }
        return next;
      });

      // 3. Atualiza no Supabase persistindo o last_read_at
      if (currentUserId) {
        await markConversationAsRead(conversationId, currentUserId);
      }
    },
    [currentUserId]
  );

  // Registra os handlers globais
  useEffect(() => {
    globalMarkConversationAsViewed = markConversationAsViewed;
    globalRefreshUnreadCount = refreshUnreadCount;
    return () => {
      globalMarkConversationAsViewed = null;
      globalRefreshUnreadCount = null;
    };
  }, [markConversationAsViewed, refreshUnreadCount]);

  // Ao focar a janela ou voltar a visibilidade, se estiver em uma conversa ativa, marca como lida
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        const activeId = getActiveChatConversationId();
        const isViewing = location.pathname === "/chat" || isChatModalOpen();
        if (activeId && isViewing) {
          void markConversationAsViewed(activeId);
        } else {
          void refreshUnreadCount();
        }
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [location.pathname, markConversationAsViewed, refreshUnreadCount]);

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

  // Monitoramento global de mensagens, novas conversas e leitura via Realtime
  useEffect(() => {
    if (!currentUserId) return;

    void refreshUnreadCount();

    const channel = supabase
      .channel(`global_chat_notifier_${currentUserId}`)
      // 1. Novas Mensagens
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

          // Verifica se a conversa pertence a este usuário antes de notificar ou desocultar
          let isMyConv = myConvIdsRef.current.has(newMsg.conversation_id);
          if (!isMyConv) {
            const { data: convCheck } = await supabase
              .from("chat_conversations" as any)
              .select("id")
              .eq("id", newMsg.conversation_id)
              .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
              .maybeSingle();

            if (!convCheck) {
              // Mensagem entre outros usuários: ignorar completamente
              return;
            }
            myConvIdsRef.current.add(newMsg.conversation_id);
          }

          // Se recebeu nova mensagem de outra pessoa nesta conversa, desoculta conversa e contato
          setLocalConversationHidden(currentUserId, newMsg.conversation_id, false);
          setLocalHiddenOtherUser(currentUserId, newMsg.sender_id, false);

          // Se o usuário já está ativo exatamente nessa conversa e com a aba visível
          const activeId = getActiveChatConversationId();
          const isActivelyViewing =
            (location.pathname === "/chat" || isChatModalOpen()) &&
            activeId === newMsg.conversation_id &&
            document.visibilityState === "visible";

          // Se estiver visualizando ativamente, marca como lida na hora e NÃO sobe notificação
          if (isActivelyViewing) {
            void markConversationAsViewed(newMsg.conversation_id);
            return;
          }

          // Se o usuário NÃO estiver ativamente visualizando essa conversa, INCREMENTA NOTIFICAÇÃO
          setUnreadByConversation((prev) => {
            const next = {
              ...prev,
              [newMsg.conversation_id]: (prev[newMsg.conversation_id] || 0) + 1,
            };
            const newTotal = Object.values(next).reduce((acc, c) => acc + c, 0);
            setUnreadChatCount(newTotal);
            return next;
          });

          // Reproduz sinal sonoro
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

          // Toast no topo direito
          toast.custom(
            (t) => (
              <div
                className="flex items-center gap-3 p-3.5 bg-card text-card-foreground border border-[#4A5C6A] shadow-2xl rounded-2xl cursor-pointer hover:border-[#CCD0CF] transition-all w-full max-w-sm pointer-events-auto backdrop-blur-md"
                onClick={() => {
                  toast.dismiss(t);
                  void markConversationAsViewed(newMsg.conversation_id);
                  navigate(`/chat?conv=${newMsg.conversation_id}`);
                }}
              >
                <div className="relative">
                  <div className="h-10 w-10 rounded-xl bg-[#253745] border border-[#4A5C6A]/60 text-[#CCD0CF] font-black text-sm flex items-center justify-center shrink-0 shadow-md">
                    {senderName.charAt(0).toUpperCase()}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-xs text-foreground truncate">{senderName}</span>
                    <span className="text-[10px] text-[#CCD0CF] font-mono-tech bg-[#253745] border border-[#4A5C6A]/60 px-1.5 py-0.5 rounded-md shrink-0">
                      Chat Privado
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
                    void markConversationAsViewed(newMsg.conversation_id);
                    navigate(`/chat?conv=${newMsg.conversation_id}`);
                  }}
                >
                  Responder
                </Button>
              </div>
            ),
            {
              id: `chat-notif-${newMsg.conversation_id}`,
              duration: 8000,
              position: "top-right",
            }
          );

          // Notificação nativa do sistema operacional / navegador
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
                void markConversationAsViewed(newMsg.conversation_id);
                navigate(`/chat?conv=${newMsg.conversation_id}`);
              };
            } catch {
              // silencioso
            }
          }
        }
      )
      // 2. Novas conversas criadas
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_conversations",
        },
        async (payload: any) => {
          const newConv = payload.new;
          if (!newConv) return;
          if (newConv.user1_id === currentUserId || newConv.user2_id === currentUserId) {
            void refreshUnreadCount();
            window.dispatchEvent(new CustomEvent("primacor:chat_conversations_updated", { detail: newConv }));
          }
        }
      )
      // 3. Atualizações de leitura (ex: lido em outra aba/dispositivo)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_conversation_settings",
        },
        (payload: any) => {
          const setting = payload.new;
          if (!setting) return;
          if (setting.user_id === currentUserId) {
            void refreshUnreadCount();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, location.pathname, markConversationAsViewed, navigate, refreshUnreadCount]);

  return (
    <ChatNotificationContext.Provider
      value={{
        unreadChatCount,
        unreadByConversation,
        refreshUnreadCount,
        markConversationAsViewed,
      }}
    >
      {children}
    </ChatNotificationContext.Provider>
  );
}
