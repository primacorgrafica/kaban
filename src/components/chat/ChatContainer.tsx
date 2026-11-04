import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useChat } from "@/hooks/useChat";
import { useAuth } from "@/hooks/useAuth";
import { ChatConversationItem } from "./ChatConversationItem";
import { ChatMessageItem } from "./ChatMessageItem";
import { EmojiPickerPopover } from "./EmojiPickerPopover";
import { NewConversationDialog } from "./NewConversationDialog";
import { AvatarSelectorDialog } from "./AvatarSelectorDialog";
import { notifyConversationViewed } from "./GlobalChatNotifier";
import { getLocalHiddenOtherUsers } from "@/lib/chatService";
import { supabase } from "@/integrations/supabase/client";
import {
  ChatConversation,
  ChatMessage,
  ChatUser,
} from "@/types/chat";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Plus,
  Send,
  MoreVertical,
  ArrowLeft,
  Trash2,
  Eraser,
  MessageSquare,
  Users,
  Shield,
  Clock,
  Sparkles,
  ChevronDown,
  X,
  CheckCheck,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ChatContainerProps {
  onClose?: () => void;
  isModal?: boolean;
}

const QUICK_PROMPTS = [
  "Olá, tudo bem?",
  "Pode verificar essa O.S.?",
  "Arquivo aprovado!",
  "Já conferi a chapa no CTP.",
];

export function ChatContainer({ onClose, isModal = false }: ChatContainerProps) {
  const { user, avatarUrl } = useAuth();
  const currentUserId = user?.id || "";

  const {
    conversations,
    activeConversation,
    messages,
    availableUsers,
    loading,
    messagesLoading,
    totalUnreadCount,
    typingUsers,
    selectConversation,
    startConversationWithUser,
    sendTextMessage,
    editExistingMessage,
    deleteMessage,
    hideConversation,
    clearHistory,
    reactToMessage,
    sendTypingSignal,
  } = useChat();

  const [searchConvTerm, setSearchConvTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "online">("all");
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [showScrollBottomPill, setShowScrollBottomPill] = useState(false);

  // Diálogos de confirmação
  const [confirmHideConvId, setConfirmHideConvId] = useState<string | null>(null);
  const [confirmClearConvId, setConfirmClearConvId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const convParam = searchParams.get("conv");

  // Se houver um parâmetro ?conv=id na URL (ex: ao clicar na notificação), seleciona automaticamente essa conversa
  useEffect(() => {
    if (!convParam) return;

    const target = conversations.find((c) => c.id === convParam);
    if (target) {
      if (activeConversation?.id !== target.id) {
        selectConversation(target);
        setMobileView("chat");
      }
      void notifyConversationViewed(target.id);
      return;
    }

    let isCancelled = false;
    const fetchAndOpenConv = async () => {
      try {
        const { data: convData } = await supabase
          .from("chat_conversations" as any)
          .select("*")
          .eq("id", convParam)
          .maybeSingle();

        if (convData && !isCancelled) {
          const otherUserId = convData.user1_id === currentUserId ? convData.user2_id : convData.user1_id;
          let otherUserMeta = availableUsers.find((u) => u.id === otherUserId);
          if (!otherUserMeta) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("user_id, nome, setor_vinculado")
              .eq("user_id", otherUserId)
              .maybeSingle();
            if (prof) {
              otherUserMeta = {
                id: prof.user_id,
                nome: prof.nome || "Colega",
                setor: (prof as any).setor_vinculado,
                online: true,
              };
            }
          }

          const convObj: ChatConversation = {
            id: convData.id,
            user1_id: convData.user1_id,
            user2_id: convData.user2_id,
            last_message_at: convData.last_message_at || convData.created_at,
            last_message_preview: convData.last_message_preview,
            last_message_sender_id: convData.last_message_sender_id,
            created_at: convData.created_at,
            updated_at: convData.updated_at,
            otherUser: otherUserMeta || { id: otherUserId, nome: "Colega de Trabalho", online: true },
            unreadCount: 0,
          };

          selectConversation(convObj);
          setMobileView("chat");
          void notifyConversationViewed(convObj.id);
        }
      } catch (err) {
        console.error("Erro ao carregar conversa da URL:", err);
      }
    };

    void fetchAndOpenConv();
    return () => {
      isCancelled = true;
    };
  }, [convParam, conversations, activeConversation?.id, selectConversation, currentUserId, availableUsers]);

  // Se a conversa ativa atual possui mensagens não lidas, notifica para limpar a notificação do topo
  useEffect(() => {
    if (activeConversation && activeConversation.unreadCount > 0) {
      void notifyConversationViewed(activeConversation.id);
    }
  }, [activeConversation]);

  // Auto-scroll para a última mensagem
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setShowScrollBottomPill(false);
  };

  useEffect(() => {
    if (!showScrollBottomPill) {
      scrollToBottom("auto");
    }
  }, [messages]);

  // Monitorar scroll do container da thread
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollBottomPill(distanceToBottom > 160);
  };

  // Alterna visualização no mobile ao selecionar conversa
  const handleSelectConv = (conv: ChatConversation) => {
    selectConversation(conv);
    void notifyConversationViewed(conv.id);
    setMobileView("chat");
  };

  const handleBackToList = () => {
    setMobileView("list");
  };

  // Envio de mensagem
  const handleSend = () => {
    if (!inputText.trim() || !activeConversation) return;
    sendTextMessage(inputText);
    setInputText("");
    sendTypingSignal(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  // Tratamento de teclas no textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      sendTypingSignal(true);
    }
  };

  // Ajuste dinâmico de altura do textarea
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  // Inserção de emoji
  const handleSelectEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Preencher prompt rápido
  const handleQuickPrompt = (prompt: string) => {
    setInputText(prompt);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Usuários online que ainda não possuem conversa no histórico
  const existingOtherUserIds = useMemo(() => {
    return new Set(conversations.map((c) => c.otherUser.id));
  }, [conversations]);

  const hiddenUsers = useMemo(() => {
    return currentUserId ? getLocalHiddenOtherUsers(currentUserId) : new Set<string>();
  }, [currentUserId]);

  const onlineUsersWithoutConversation = useMemo(() => {
    return availableUsers.filter(
      (u) => u.online && !existingOtherUserIds.has(u.id) && !hiddenUsers.has(u.id)
    );
  }, [availableUsers, existingOtherUserIds, hiddenUsers]);

  // Usuários offline que ainda não possuem conversa no histórico (todos os outros usuários do sistema)
  const offlineUsersWithoutConversation = useMemo(() => {
    return availableUsers.filter(
      (u) => !u.online && !existingOtherUserIds.has(u.id) && !hiddenUsers.has(u.id)
    );
  }, [availableUsers, existingOtherUserIds, hiddenUsers]);

  // Lista de todos os usuários online no momento
  const allOnlineUsersList = useMemo(() => {
    return availableUsers.filter((u) => u.online);
  }, [availableUsers]);

  // Filtragem de conversas existentes
  const filteredConversations = useMemo(() => {
    const term = searchConvTerm.toLowerCase().trim();
    return conversations.filter((c) => {
      if (filterMode === "online" && !c.otherUser.online) return false;
      if (!term) return true;
      return (
        c.otherUser.nome.toLowerCase().includes(term) ||
        (c.otherUser.role && c.otherUser.role.toLowerCase().includes(term)) ||
        (c.otherUser.setor && c.otherUser.setor.toLowerCase().includes(term)) ||
        (c.last_message_preview && c.last_message_preview.toLowerCase().includes(term))
      );
    });
  }, [conversations, searchConvTerm, filterMode]);

  // Usuários online sem conversa prévia filtrados por busca
  const filteredOnlineWithoutConv = useMemo(() => {
    const term = searchConvTerm.toLowerCase().trim();
    return onlineUsersWithoutConversation.filter((u) => {
      if (!term) return true;
      return (
        u.nome.toLowerCase().includes(term) ||
        (u.role && u.role.toLowerCase().includes(term)) ||
        (u.setor && u.setor.toLowerCase().includes(term))
      );
    });
  }, [onlineUsersWithoutConversation, searchConvTerm]);

  // Usuários offline sem conversa prévia filtrados por busca
  const filteredOfflineWithoutConv = useMemo(() => {
    if (filterMode === "online") return [];
    const term = searchConvTerm.toLowerCase().trim();
    return offlineUsersWithoutConversation.filter((u) => {
      if (!term) return true;
      return (
        u.nome.toLowerCase().includes(term) ||
        (u.role && u.role.toLowerCase().includes(term)) ||
        (u.setor && u.setor.toLowerCase().includes(term))
      );
    });
  }, [offlineUsersWithoutConversation, searchConvTerm, filterMode]);

  // Iniciar conversa com um usuário diretamente (seja online ou offline)
  const handleStartWithUser = async (targetUser: ChatUser) => {
    const existing = conversations.find((c) => c.otherUser.id === targetUser.id);
    if (existing) {
      handleSelectConv(existing);
      return;
    }
    const conv = await startConversationWithUser(targetUser);
    if (conv) {
      void notifyConversationViewed(conv.id);
      setMobileView("chat");
    }
  };

  // Agrupamento de mensagens por data
  const messagesWithDateDividers = useMemo(() => {
    const list: { type: "date" | "message"; date?: string; msg?: ChatMessage }[] = [];
    let lastDateStr = "";

    messages.forEach((msg) => {
      const msgDate = new Date(msg.created_at);
      let dateLabel = "";
      if (isToday(msgDate)) {
        dateLabel = "Hoje";
      } else if (isYesterday(msgDate)) {
        dateLabel = "Ontem";
      } else {
        dateLabel = format(msgDate, "dd 'de' MMMM", { locale: ptBR });
      }

      if (dateLabel !== lastDateStr) {
        lastDateStr = dateLabel;
        list.push({ type: "date", date: dateLabel });
      }
      list.push({ type: "message", msg });
    });

    return list;
  }, [messages]);

  return (
    <div className="flex h-full w-full bg-card text-foreground overflow-hidden rounded-2xl border border-border/80 shadow-2xl relative select-none">
      {/* ── PAINEL ESQUERDO: LISTA DE CONVERSAS & USUÁRIOS ONLINE ── */}
      <div
        className={`w-full md:w-80 lg:w-96 flex flex-col border-r border-border/80 bg-card/95 backdrop-blur-xl shrink-0 transition-all ${
          mobileView === "chat" ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Header da lista de conversas */}
        <div className="p-3.5 border-b border-border/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#253745] border border-[#4A5C6A]/50 text-[#CCD0CF] shadow-xs">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
                Chat Corporativo
                {totalUnreadCount > 0 && (
                  <Badge className="bg-[#CCD0CF] text-[#06141B] text-[10px] font-bold px-1.5 py-0 rounded-full font-mono-tech shadow-xs">
                    {totalUnreadCount}
                  </Badge>
                )}
              </h2>
              <span className="text-[10px] text-muted-foreground font-mono-tech">
                Primacor Kaban
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAvatarDialogOpen(true)}
              className="h-8 px-2.5 border-border/80 hover:bg-accent text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all text-foreground"
              title="Personalizar meu avatar"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Meu Avatar"
                  className="w-5 h-5 rounded-lg object-cover border border-sky-400"
                />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-sky-400" />
              )}
              <span className="hidden sm:inline text-[11px]">Avatar</span>
            </Button>

            <Button
              size="sm"
              onClick={() => setNewConvOpen(true)}
              className="h-8 px-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#CCD0CF] dark:hover:bg-white dark:text-[#06141B] text-xs font-bold rounded-xl shadow-xs font-mono-tech flex items-center gap-1.5 transition-all"
              title="Nova conversa privada"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Novo</span>
            </Button>

            {isModal && onClose && (
              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
                className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl md:hidden"
                title="Fechar chat"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Busca nas conversas */}
        <div className="px-3 py-2 border-b border-border/60">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar conversa ou colaborador..."
              value={searchConvTerm}
              onChange={(e) => setSearchConvTerm(e.target.value)}
              className="pl-8 pr-7 h-8 text-xs bg-muted/40 border-input text-foreground placeholder:text-muted-foreground rounded-xl focus-visible:ring-1 focus-visible:ring-primary/40"
            />
            {searchConvTerm && (
              <button
                type="button"
                onClick={() => setSearchConvTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Faixa Rápida de Usuários Online Agora */}
        {allOnlineUsersList.length > 0 && (
          <div className="px-3 py-2 border-b border-border/60 bg-muted/20 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono-tech">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#34d399]" />
                <span>ONLINE AGORA ({allOnlineUsersList.length})</span>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {allOnlineUsersList.map((onlineUser) => (
                <button
                  key={onlineUser.id}
                  type="button"
                  onClick={() => handleStartWithUser(onlineUser)}
                  className="flex flex-col items-center gap-1 shrink-0 p-1 rounded-xl hover:bg-accent/80 transition-all group max-w-[58px]"
                  title={`${onlineUser.nome} (${onlineUser.role || onlineUser.setor || "Colaborador"}) — Online agora. Clique para conversar.`}
                >
                  <div className="relative">
                    {onlineUser.avatar_url ? (
                      <img
                        src={onlineUser.avatar_url}
                        alt={onlineUser.nome}
                        className="w-9 h-9 rounded-xl object-cover border border-[#4A5C6A]/60 group-hover:scale-105 transition-transform shadow-xs bg-muted"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-[#253745] border border-[#4A5C6A]/60 flex items-center justify-center font-bold text-xs text-[#CCD0CF] group-hover:scale-105 transition-transform shadow-xs">
                        {onlineUser.nome.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-card shadow-[0_0_6px_#34d399]" />
                  </div>
                  <span className="text-[10px] text-foreground truncate w-full text-center group-hover:text-primary font-medium">
                    {onlineUser.nome.split(" ")[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filtro: Todas vs Apenas Online */}
        <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-border/60 bg-muted/20 text-xs font-mono-tech shrink-0">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              filterMode === "all"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Todas ({conversations.length + onlineUsersWithoutConversation.length + offlineUsersWithoutConversation.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("online")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              filterMode === "online"
                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 font-semibold"
                : "text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#34d399]" />
            Online ({allOnlineUsersList.length})
          </button>
        </div>

        {/* Lista de conversas e colaboradores */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
          {loading ? (
            /* Skeleton Loader idêntico à geometria dos itens */
            <div className="space-y-1.5 p-1 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2.5 rounded-2xl bg-muted/30 border border-border/40"
                >
                  <div className="w-11 h-11 rounded-2xl bg-muted/60 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <div className="h-3.5 bg-muted/60 rounded w-28" />
                      <div className="h-2.5 bg-muted/40 rounded w-10" />
                    </div>
                    <div className="h-3 bg-muted/40 rounded w-44" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredConversations.length === 0 &&
            filteredOnlineWithoutConv.length === 0 &&
            filteredOfflineWithoutConv.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-4 text-muted-foreground text-xs">
              <Users className="h-8 w-8 mb-2 opacity-50" />
              <span>
                {filterMode === "online"
                  ? "Nenhum outro colaborador online no momento."
                  : "Nenhum colaborador ou conversa encontrada."}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewConvOpen(true)}
                className="mt-3 text-primary hover:bg-accent text-xs rounded-xl"
              >
                Iniciar uma conversa
              </Button>
            </div>
          ) : (
            <>
              {/* Conversas Ativas / Histórico */}
              {filteredConversations.map((conv) => (
                <ChatConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={activeConversation?.id === conv.id}
                  onClick={() => handleSelectConv(conv)}
                  onHide={() => setConfirmHideConvId(conv.id)}
                  onClearHistory={() => setConfirmClearConvId(conv.id)}
                />
              ))}

              {/* Colaboradores Online que ainda não têm conversa iniciada */}
              {filteredOnlineWithoutConv.length > 0 && (
                <div className="pt-2">
                  <div className="px-2 py-1 text-[10px] font-mono-tech font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_#34d399]" />
                    <span>Disponíveis Online ({filteredOnlineWithoutConv.length})</span>
                  </div>
                  <div className="space-y-1 mt-1">
                    {filteredOnlineWithoutConv.map((u) => {
                      const isSelected = activeConversation?.otherUser.id === u.id;
                      return (
                        <div
                          key={u.id}
                          onClick={() => handleStartWithUser(u)}
                          className={`group flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all border ${
                            isSelected
                              ? "bg-[#253745] border-[#4A5C6A]/70 shadow-xs"
                              : "hover:bg-accent/80 border-transparent hover:border-border/60"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="relative shrink-0">
                              {u.avatar_url ? (
                                <img
                                  src={u.avatar_url}
                                  alt={u.nome}
                                  className="w-10 h-10 rounded-2xl object-cover border border-[#4A5C6A]/60 shadow-xs group-hover:scale-105 transition-transform bg-muted"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#253745] to-[#11212D] border border-[#4A5C6A]/50 flex items-center justify-center font-bold text-sm text-[#CCD0CF] shadow-xs group-hover:scale-105 transition-transform">
                                  {u.nome.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-card shadow-[0_0_6px_#34d399]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <span className="text-xs font-semibold truncate text-foreground group-hover:text-primary transition-colors">
                                  {u.nome}
                                </span>
                                {u.role && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-muted/80 text-muted-foreground font-mono-tech uppercase border border-border/60 shrink-0">
                                    {u.role}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 truncate flex items-center gap-1 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                Online agora · Clique para conversar
                              </p>
                            </div>
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                            <span className="p-1.5 rounded-xl bg-accent text-foreground text-xs flex items-center gap-1 shadow-xs">
                              <MessageSquare className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Colaboradores Offline (todos os usuários cadastrados exibindo seus avatares) */}
              {filteredOfflineWithoutConv.length > 0 && filterMode === "all" && (
                <div className="pt-2">
                  <div className="px-2 py-1 text-[10px] font-mono-tech font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                    <span>Colaboradores Offline ({filteredOfflineWithoutConv.length})</span>
                  </div>
                  <div className="space-y-1 mt-1">
                    {filteredOfflineWithoutConv.map((u) => {
                      const isSelected = activeConversation?.otherUser.id === u.id;
                      return (
                        <div
                          key={u.id}
                          onClick={() => handleStartWithUser(u)}
                          className={`group flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all border ${
                            isSelected
                              ? "bg-[#253745] border-[#4A5C6A]/70 shadow-xs"
                              : "hover:bg-accent/80 border-transparent hover:border-border/60 opacity-85 hover:opacity-100"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="relative shrink-0">
                              {u.avatar_url ? (
                                <img
                                  src={u.avatar_url}
                                  alt={u.nome}
                                  className="w-10 h-10 rounded-2xl object-cover border border-border/80 shadow-xs group-hover:scale-105 transition-transform bg-muted"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-2xl bg-muted border border-border/80 flex items-center justify-center font-bold text-sm text-muted-foreground shadow-xs group-hover:scale-105 transition-transform">
                                  {u.nome.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-muted-foreground/30 ring-2 ring-card" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <span className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                                  {u.nome}
                                </span>
                                {u.role && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-muted/60 text-muted-foreground font-mono-tech uppercase border border-border/50 shrink-0">
                                    {u.role}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                                <span className="truncate">
                                  {u.setor ? u.setor : "Primacor"}
                                </span>
                                <span className="text-[10px] text-muted-foreground/70 font-mono-tech shrink-0">
                                  offline
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                            <span className="p-1.5 rounded-xl bg-muted text-foreground text-xs flex items-center gap-1 shadow-xs">
                              <MessageSquare className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── PAINEL DIREITO: CONVERSA ATIVA ── */}
      <div
        className={`flex-1 flex flex-col bg-background transition-all min-w-0 ${
          mobileView === "list" ? "hidden md:flex" : "flex"
        }`}
      >
        {activeConversation ? (
          <>
            {/* Header da conversa ativa (Linear / Telegram SaaS Glass) */}
            <div className="h-15 px-4 border-b border-border/80 bg-card/85 backdrop-blur-xl flex items-center justify-between shrink-0 sticky top-0 z-10 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                {/* Botão voltar no mobile */}
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="md:hidden p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                {/* Avatar com status */}
                <div className="relative">
                  {activeConversation.otherUser.avatar_url ? (
                    <img
                      src={activeConversation.otherUser.avatar_url}
                      alt={activeConversation.otherUser.nome}
                      className="w-10 h-10 rounded-2xl object-cover border border-[#4A5C6A]/70 shadow-sm bg-muted"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-[#253745] border border-[#4A5C6A]/70 flex items-center justify-center font-bold text-sm text-[#CCD0CF] shadow-sm">
                      {activeConversation.otherUser.nome.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {activeConversation.otherUser.online ? (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-card shadow-[0_0_6px_#34d399]" />
                  ) : (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-muted-foreground/40 ring-2 ring-card" />
                  )}
                </div>

                {/* Informações do usuário */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground truncate">
                      {activeConversation.otherUser.nome}
                    </span>
                    {activeConversation.otherUser.role && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-muted/80 text-muted-foreground font-mono-tech uppercase border border-border/60">
                        {activeConversation.otherUser.role}
                      </span>
                    )}
                  </div>

                  {/* Status / Digitando */}
                  <div className="text-[11px] text-muted-foreground font-mono-tech truncate">
                    {typingUsers.length > 0 ? (
                      <span className="text-primary font-semibold flex items-center gap-1 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        {typingUsers.join(", ")} digitando...
                      </span>
                    ) : activeConversation.otherUser.online ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Online agora
                      </span>
                    ) : (
                      <span>Offline</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Opções da conversa */}
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl"
                      title="Opções da conversa"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="bg-popover border-border text-popover-foreground min-w-[190px] p-1.5 rounded-xl shadow-xl z-50 backdrop-blur-md"
                  >
                    <DropdownMenuItem
                      onClick={() => setConfirmClearConvId(activeConversation.id)}
                      className="text-xs hover:bg-accent cursor-pointer text-foreground"
                    >
                      <Eraser className="h-3.5 w-3.5 mr-2 text-amber-500" /> Limpar meu histórico
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem
                      onClick={() => setConfirmHideConvId(activeConversation.id)}
                      className="text-xs hover:bg-rose-500/10 text-rose-500 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir conversa para mim
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {isModal && onClose && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={onClose}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl hidden md:flex"
                    title="Fechar chat"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Thread de mensagens */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5 scrollbar-thin relative"
            >
              {messagesLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-xs">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span>Carregando mensagens...</span>
                </div>
              ) : messages.length === 0 ? (
                /* Empty state com prompts rápidos */
                <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8 text-muted-foreground">
                  <div className="w-14 h-14 rounded-2xl bg-muted/50 border border-border/80 flex items-center justify-center text-primary mb-3 shadow-sm">
                    {activeConversation.otherUser.avatar_url ? (
                      <img
                        src={activeConversation.otherUser.avatar_url}
                        alt={activeConversation.otherUser.nome}
                        className="w-12 h-12 rounded-xl object-cover"
                      />
                    ) : (
                      <Sparkles className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <h4 className="font-bold text-sm text-foreground">
                    Inicie a conversa com {activeConversation.otherUser.nome}!
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
                    Esta é uma conversa direta e segura. Envie uma mensagem rápida para iniciar o contato:
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-md">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleQuickPrompt(prompt)}
                        className="px-3 py-1.5 rounded-xl bg-card border border-border/80 hover:border-primary/50 text-xs text-foreground hover:text-primary transition-all shadow-xs"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messagesWithDateDividers.map((item, idx) => {
                  if (item.type === "date") {
                    return (
                      <div key={`date-${idx}`} className="flex items-center justify-center my-4 relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-border/50" />
                        </div>
                        <span className="relative px-3 py-0.5 rounded-full bg-card/90 border border-border/80 text-[10px] text-muted-foreground font-mono-tech shadow-xs backdrop-blur-sm">
                          {item.date}
                        </span>
                      </div>
                    );
                  }
                  if (item.msg) {
                    // Determinar se é mensagem consecutiva do mesmo remetente
                    let isConsecutive = false;
                    if (idx > 0) {
                      const prevItem = messagesWithDateDividers[idx - 1];
                      if (prevItem.type === "message" && prevItem.msg) {
                        const isSameSender = prevItem.msg.sender_id === item.msg.sender_id;
                        const timeDiff =
                          new Date(item.msg.created_at).getTime() -
                          new Date(prevItem.msg.created_at).getTime();
                        if (isSameSender && timeDiff < 5 * 60 * 1000) {
                          isConsecutive = true;
                        }
                      }
                    }

                    return (
                      <ChatMessageItem
                        key={item.msg.id}
                        message={item.msg}
                        isMe={item.msg.sender_id === currentUserId}
                        onEdit={editExistingMessage}
                        onDelete={deleteMessage}
                        onReact={reactToMessage}
                        currentUserId={currentUserId}
                        senderAvatarUrl={activeConversation.otherUser.avatar_url}
                        senderName={activeConversation.otherUser.nome}
                        isConsecutive={isConsecutive}
                      />
                    );
                  }
                  return null;
                })
              )}
              <div ref={messagesEndRef} />

              {/* Botão flutuante: Rolar para o fim quando o usuário rola para cima */}
              {showScrollBottomPill && (
                <button
                  type="button"
                  onClick={() => scrollToBottom("smooth")}
                  className="fixed bottom-24 right-8 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#253745] hover:bg-[#11212D] text-[#CCD0CF] border border-[#4A5C6A] shadow-xl text-xs font-mono-tech transition-all animate-in fade-in zoom-in-95"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span>Rolar para o fim</span>
                </button>
              )}
            </div>

            {/* Compositor de mensagem (Linear / Slack Box) */}
            <div className="p-3 border-t border-border/80 bg-card/85 backdrop-blur-xl shrink-0">
              <div className="flex items-end gap-2 bg-background/90 border border-border/90 rounded-2xl p-2 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-xs">
                {/* Emoji Picker Popover */}
                <EmojiPickerPopover onSelectEmoji={handleSelectEmoji} />

                {/* Input de texto */}
                <Textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={handleTextChange}
                  onKeyDown={handleKeyDown}
                  placeholder={`Mensagem para ${activeConversation.otherUser.nome}... (Enter para enviar)`}
                  rows={1}
                  className="flex-1 min-h-[36px] max-h-[120px] resize-none text-[13px] bg-transparent border-0 text-foreground placeholder:text-muted-foreground focus-visible:ring-0 p-1.5 scrollbar-none"
                />

                {/* Botão de Envio */}
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  className="h-8 w-8 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#CCD0CF] dark:hover:bg-white dark:text-[#06141B] disabled:opacity-30 disabled:pointer-events-none shadow-xs transition-all shrink-0 hover:scale-105 active:scale-95"
                  title="Enviar mensagem"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center justify-between px-2 pt-1 text-[9px] text-muted-foreground font-mono-tech">
                <span>Enter para enviar • Shift + Enter para quebra de linha</span>
                <span className="flex items-center gap-1">
                  <Shield className="h-2.5 w-2.5 text-muted-foreground" /> Chat Corporativo Primacor
                </span>
              </div>
            </div>
          </>
        ) : (
          /* Estado sem conversa selecionada */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-[#253745] border border-[#4A5C6A]/60 flex items-center justify-center text-[#CCD0CF] mb-4 shadow-lg">
              <MessageSquare className="h-8 w-8" />
            </div>
            <h3 className="text-base font-bold text-foreground mb-1">
              Chat Corporativo Primacor
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mb-4 leading-relaxed">
              Selecione uma conversa ao lado ou inicie um novo bate-papo privado com qualquer operador ou gestor cadastrado.
            </p>
            <Button
              onClick={() => setNewConvOpen(true)}
              className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#CCD0CF] dark:hover:bg-white dark:text-[#06141B] text-xs font-bold rounded-xl shadow-xs font-mono-tech transition-all hover:scale-105 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Iniciar Nova Conversa
            </Button>
          </div>
        )}
      </div>

      {/* ── MODAL: NOVA CONVERSA ── */}
      <NewConversationDialog
        open={newConvOpen}
        onOpenChange={setNewConvOpen}
        users={availableUsers}
        onSelectUser={startConversationWithUser}
      />

      {/* ── DIÁLOGO: CONFIRMAR EXCLUSÃO DA CONVERSA PARA MIM ── */}
      <AlertDialog
        open={!!confirmHideConvId}
        onOpenChange={(open) => !open && setConfirmHideConvId(null)}
      >
        <AlertDialogContent className="bg-card border-border text-foreground rounded-2xl shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa para você?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-xs leading-relaxed">
              Esta conversa será removida da sua lista. O outro participante ainda manterá as mensagens visíveis na conta dele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setConfirmHideConvId(null)}
              className="border-border text-foreground hover:bg-accent rounded-xl text-xs"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmHideConvId) {
                  hideConversation(confirmHideConvId);
                  if (convParam === confirmHideConvId) {
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev);
                      next.delete("conv");
                      return next;
                    });
                  }
                  setMobileView("list");
                }
                setConfirmHideConvId(null);
              }}
              className="bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold"
            >
              Excluir para mim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── DIÁLOGO: CONFIRMAR LIMPEZA DE HISTÓRICO PARA MIM ── */}
      <AlertDialog
        open={!!confirmClearConvId}
        onOpenChange={(open) => !open && setConfirmClearConvId(null)}
      >
        <AlertDialogContent className="bg-card border-border text-foreground rounded-2xl shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar histórico desta conversa?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-xs leading-relaxed">
              Todas as mensagens enviadas até agora serão ocultadas apenas para você. Novas mensagens futuras continuarão aparecendo normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setConfirmClearConvId(null)}
              className="border-border text-foreground hover:bg-accent rounded-xl text-xs"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmClearConvId) clearHistory(confirmClearConvId);
                setConfirmClearConvId(null);
              }}
              className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold"
            >
              Limpar histórico
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── DIÁLOGO: SELETOR DE AVATAR DO USUÁRIO ── */}
      <AvatarSelectorDialog
        open={avatarDialogOpen}
        onOpenChange={setAvatarDialogOpen}
      />
    </div>
  );
}
