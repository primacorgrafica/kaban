import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ChatConversation,
  ChatMessage,
  ChatUser,
  TypingPayload,
} from "@/types/chat";
import {
  fetchChatUsers,
  fetchUserConversations,
  getOrCreateConversation,
  fetchConversationMessages,
  sendMessage,
  markConversationAsRead,
  editMessage,
  deleteMessageForMe,
  deleteMessageForAll,
  hideConversationForUser,
  clearConversationHistoryForUser,
  toggleMessageReaction,
  setLocalConversationHidden,
} from "@/lib/chatService";
import { toast } from "sonner";
import { setActiveChatConversationId, notifyConversationViewed } from "@/components/chat/GlobalChatNotifier";

export function useChat() {
  const { user, onlineUserIds: authRealtimeOnlineIds } = useAuth();
  const currentUserId = user?.id || null;

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [availableUsers, setAvailableUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({}); // convId -> userNames
  const [dbOnlineIds, setDbOnlineIds] = useState<Set<string>>(new Set());

  const knownUsersMapRef = useRef<Record<string, ChatUser>>({});
  const activeConvRef = useRef<ChatConversation | null>(null);
  activeConvRef.current = activeConversation;
  const conversationsRef = useRef<ChatConversation[]>([]);
  conversationsRef.current = conversations;

  // União dos usuários detectados online via WebSocket (gerenciado centralmente no AuthProvider) e fallback de banco
  const allOnlineUserIds = useMemo(() => {
    const combined = new Set<string>(authRealtimeOnlineIds || []);
    dbOnlineIds.forEach((id) => combined.add(id));
    return combined;
  }, [authRealtimeOnlineIds, dbOnlineIds]);

  // Carregar lista de usuários do sistema (estável per user)
  const loadUsers = useCallback(async () => {
    if (!currentUserId) return;
    const users = await fetchChatUsers(currentUserId);
    setAvailableUsers(users);

    const map: Record<string, ChatUser> = {};
    users.forEach((u) => {
      map[u.id] = u;
    });
    knownUsersMapRef.current = map;
  }, [currentUserId]);

  // Carregar conversas do usuário
  const loadConversations = useCallback(async (showLoading = true) => {
    if (!currentUserId) return;
    if (showLoading) setLoading(true);
    try {
      const list = await fetchUserConversations(currentUserId, knownUsersMapRef.current);
      setConversations(list);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [currentUserId]);

  // Carregar mensagens da conversa ativa
  const loadMessages = useCallback(async (conv: ChatConversation) => {
    if (!currentUserId) return;
    setMessagesLoading(true);
    try {
      const msgs = await fetchConversationMessages(
        conv.id,
        currentUserId,
        conv.cleared_until
      );
      setMessages(msgs);

      // Marca conversa como lida e notifica globalmente para sumir com notificações do topo
      await markConversationAsRead(conv.id, currentUserId);
      void notifyConversationViewed(conv.id);

      // Zera contador local
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c))
      );
    } finally {
      setMessagesLoading(false);
    }
  }, [currentUserId]);

  // Selecionar conversa
  const selectConversation = useCallback(
    (conv: ChatConversation | null) => {
      setActiveConversation(conv);
      setActiveChatConversationId(conv?.id || null);
      if (conv) {
        void loadMessages(conv);
        void notifyConversationViewed(conv.id);
      } else {
        setMessages([]);
      }
    },
    [loadMessages]
  );

  useEffect(() => {
    return () => {
      setActiveChatConversationId(null);
    };
  }, []);

  // Iniciar conversa com um usuário específico
  const startConversationWithUser = useCallback(
    async (targetUser: ChatUser) => {
      if (!currentUserId) return null;
      setLoading(true);
      try {
        const conv = await getOrCreateConversation(
          currentUserId,
          targetUser.id,
          targetUser
        );
        if (conv) {
          // Atualiza lista se não existir
          setConversations((prev) => {
            const exists = prev.some((c) => c.id === conv.id);
            if (exists) {
              return prev.map((c) => (c.id === conv.id ? conv : c));
            }
            return [conv, ...prev];
          });
          selectConversation(conv);
          return conv;
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [currentUserId, selectConversation]
  );

  // Enviar mensagem (com atualização otimista)
  const sendTextMessage = useCallback(
    async (content: string, replyToId?: string | null) => {
      if (!currentUserId || !activeConversation || !content.trim()) return;

      const convId = activeConversation.id;
      const tempId = "temp-" + Date.now();
      const optimisticMsg: ChatMessage = {
        id: tempId,
        conversation_id: convId,
        sender_id: currentUserId,
        content: content.trim(),
        is_edited: false,
        is_deleted: false,
        deleted_for_users: [],
        reply_to_id: replyToId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: "sending",
        reactions: [],
      };

      // Adiciona mensagem otimista
      setMessages((prev) => [...prev, optimisticMsg]);

      // Atualiza preview na lista de conversas
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                last_message_at: optimisticMsg.created_at,
                last_message_preview: optimisticMsg.content.slice(0, 80),
                last_message_sender_id: currentUserId,
              }
            : c
        )
      );

      const confirmed = await sendMessage(
        convId,
        currentUserId,
        content,
        replyToId
      );

      if (confirmed) {
        setMessages((prev) => {
          // Se a mensagem com o ID real já foi adicionada (ex: Realtime chegou antes)
          const alreadyExists = prev.some((m) => m.id === confirmed.id);
          if (alreadyExists) {
            // Apenas remove a temporária para não duplicar
            return prev.filter((m) => m.id !== tempId);
          }
          // Caso contrário, substitui a temporária pelos dados confirmados
          return prev.map((m) =>
            m.id === tempId ? { ...confirmed, status: "sent" } : m
          );
        });
      } else {
        // Marca como erro
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "error" } : m))
        );
        toast.error("Falha ao enviar mensagem. Tente novamente.");
      }
    },
    [currentUserId, activeConversation]
  );

  // Editar mensagem
  const editExistingMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!currentUserId) return;
      const success = await editMessage(messageId, currentUserId, newContent);
      if (success) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, content: newContent, is_edited: true, updated_at: new Date().toISOString() }
              : m
          )
        );
        toast.success("Mensagem editada");
      } else {
        toast.error("Erro ao editar mensagem");
      }
    },
    [currentUserId]
  );

  // Excluir mensagem
  const deleteMessage = useCallback(
    async (messageId: string, mode: "for_me" | "for_all") => {
      if (!currentUserId) return;
      const target = messages.find((m) => m.id === messageId);
      if (!target) return;

      if (mode === "for_me") {
        const success = await deleteMessageForMe(
          messageId,
          currentUserId,
          target.deleted_for_users
        );
        if (success) {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
          toast.success("Mensagem apagada para você");
        }
      } else {
        const success = await deleteMessageForAll(messageId, currentUserId);
        if (success) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, is_deleted: true, content: "Esta mensagem foi apagada" }
                : m
            )
          );
          toast.success("Mensagem apagada para todos");
        }
      }
    },
    [currentUserId, messages]
  );

  // Ocultar conversa ("Excluir para mim")
  const hideConversation = useCallback(
    async (conversationId: string) => {
      if (!currentUserId) return;
      const targetConv = conversations.find((c) => c.id === conversationId);
      const otherUserId = targetConv?.otherUser.id;

      // Remoção otimista imediata da lista e da seleção ativa
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversation?.id === conversationId) {
        setActiveConversation(null);
        setActiveChatConversationId(null);
        setMessages([]);
      }

      const success = await hideConversationForUser(conversationId, currentUserId, otherUserId);
      if (success) {
        toast.success("Conversa excluída para você");
      } else {
        toast.error("Erro ao excluir conversa");
      }
    },
    [currentUserId, activeConversation, conversations]
  );

  // Limpar histórico para si
  const clearHistory = useCallback(
    async (conversationId: string) => {
      if (!currentUserId) return;
      const success = await clearConversationHistoryForUser(conversationId, currentUserId);
      if (success) {
        if (activeConversation?.id === conversationId) {
          setMessages([]);
        }
        toast.success("Histórico da conversa limpo");
      }
    },
    [currentUserId, activeConversation]
  );

  // Reagir com emoji
  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserId) return;
      const success = await toggleMessageReaction(messageId, currentUserId, emoji);
      if (success) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const current = m.reactions || [];
            const exists = current.some(
              (r) => r.user_id === currentUserId && r.emoji === emoji
            );
            const updated = exists
              ? current.filter(
                  (r) => !(r.user_id === currentUserId && r.emoji === emoji)
                )
              : [
                  ...current,
                  {
                    id: "temp-" + Date.now(),
                    message_id: messageId,
                    user_id: currentUserId,
                    emoji,
                    created_at: new Date().toISOString(),
                  },
                ];
            return { ...m, reactions: updated };
          })
        );
      }
    },
    [currentUserId]
  );

  // Indicador de digitação via Broadcast Realtime
  const sendTypingSignal = useCallback(
    (isTyping: boolean) => {
      if (!currentUserId || !activeConversation || !user) return;
      const channel = supabase.channel(`typing_${activeConversation.id}`);
      void channel.send({
        type: "broadcast",
        event: "typing",
        payload: {
          conversationId: activeConversation.id,
          userId: currentUserId,
          userName: user.email?.split("@")[0] || "Usuário",
          isTyping,
        } as TypingPayload,
      });
    },
    [currentUserId, activeConversation, user]
  );

  // Inicialização e Realtime listeners
  useEffect(() => {
    if (!currentUserId) return;

    void loadUsers().then(() => {
      void loadConversations();
    });

    // Subscrição em mensagens gerais e conversas
    const channel = supabase
      .channel(`chat_global_${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload: any) => {
          const newMsg = payload.new;
          if (!newMsg) return;

          // Se a mensagem for da conversa ativa, acrescenta à lista
          if (activeConvRef.current && activeConvRef.current.id === newMsg.conversation_id) {
            setMessages((prev) => {
              // 1. Evita duplicata se já existir exatamente com o ID real
              if (prev.some((m) => m.id === newMsg.id)) return prev;

              // 2. Se for mensagem enviada por nós mesmos, substitui a temporária correspondente
              if (newMsg.sender_id === currentUserId) {
                const tempIndex = prev.findIndex(
                  (m) =>
                    m.id.startsWith("temp-") &&
                    m.sender_id === currentUserId &&
                    m.content.trim() === newMsg.content.trim()
                );
                if (tempIndex !== -1) {
                  const updated = [...prev];
                  updated[tempIndex] = {
                    ...newMsg,
                    status: "sent",
                    reactions: prev[tempIndex].reactions || [],
                  };
                  return updated;
                }
              }

              // 3. Caso contrário, adiciona ao final
              const nextList = [
                ...prev,
                {
                  ...newMsg,
                  status: "sent",
                  reactions: [],
                },
              ];

              // Deduplicação defensiva por ID
              const seen = new Set<string>();
              return nextList.filter((m) => {
                if (seen.has(m.id)) return false;
                seen.add(m.id);
                return true;
              });
            });

            // Marca como lida imediatamente e remove notificação no topo
            void markConversationAsRead(newMsg.conversation_id, currentUserId);
            void notifyConversationViewed(newMsg.conversation_id);
          } else {
            // Se for de outra conversa e enviada por outro usuário, só processa se o usuário atual for participante
            if (newMsg.sender_id !== currentUserId) {
              const knownConv = conversationsRef.current.find((c) => c.id === newMsg.conversation_id);
              if (knownConv) {
                setLocalConversationHidden(currentUserId, newMsg.conversation_id, false);
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === newMsg.conversation_id
                      ? {
                          ...c,
                          unreadCount: c.unreadCount + 1,
                          last_message_at: newMsg.created_at,
                          last_message_preview: newMsg.content.slice(0, 80),
                        }
                      : c
                  )
                );
              } else {
                // Pode ser uma conversa oculta recebendo nova mensagem do outro colega:
                // valida se o usuário atual é realmente participante antes de carregar
                void supabase
                  .from("chat_conversations" as any)
                  .select("id")
                  .eq("id", newMsg.conversation_id)
                  .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
                  .maybeSingle()
                  .then(({ data: validConv }) => {
                    if (validConv) {
                      setLocalConversationHidden(currentUserId, newMsg.conversation_id, false);
                      void loadConversations(false);
                    }
                  });
              }
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
        },
        (payload: any) => {
          const updated = payload.new;
          if (!updated) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_conversations",
        },
        (payload: any) => {
          const newConv = payload.new;
          if (newConv && (newConv.user1_id === currentUserId || newConv.user2_id === currentUserId)) {
            void loadConversations(false);
          }
        }
      )
      .subscribe();

    // Listener para novas conversas despachadas pelo Notifier global
    const handleConvUpdated = () => {
      void loadConversations(false);
    };
    window.addEventListener("primacor:chat_conversations_updated", handleConvUpdated);

    // Polling de presença do banco a cada 15 segundos (fallback)
    const checkDbPresence = async () => {
      try {
        const { data } = await supabase
          .from("user_presence")
          .select("user_id, last_seen");
        if (data) {
          const now = Date.now();
          const nextSet = new Set<string>();
          data.forEach((row: any) => {
            if (row.user_id !== currentUserId && row.last_seen) {
              const diff = now - new Date(row.last_seen).getTime();
              if (diff < 3 * 60 * 1000) {
                nextSet.add(row.user_id);
              }
            }
          });
          setDbOnlineIds(nextSet);
        }
      } catch {
        // silencioso
      }
    };

    void checkDbPresence();
    const presencePollInterval = setInterval(checkDbPresence, 15000);

    return () => {
      clearInterval(presencePollInterval);
      window.removeEventListener("primacor:chat_conversations_updated", handleConvUpdated);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, loadUsers, loadConversations]);

  // Listener de digitação para a conversa ativa
  useEffect(() => {
    if (!activeConversation) return;

    const convId = activeConversation.id;
    const typingChannel = supabase.channel(`typing_${convId}`);

    typingChannel
      .on("broadcast", { event: "typing" }, (event: { payload: TypingPayload }) => {
        const { userId, userName, isTyping } = event.payload;
        if (userId === currentUserId) return;

        setTypingUsers((prev) => {
          const current = prev[convId] || [];
          if (isTyping) {
            if (!current.includes(userName)) {
              return { ...prev, [convId]: [...current, userName] };
            }
          } else {
            return {
              ...prev,
              [convId]: current.filter((u) => u !== userName),
            };
          }
          return prev;
        });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(typingChannel);
    };
  }, [activeConversation, currentUserId]);

  // Usuários disponíveis com status de presença em tempo real
  const mappedAvailableUsers = useMemo(() => {
    return availableUsers.map((u) => ({
      ...u,
      online: allOnlineUserIds.has(u.id),
    }));
  }, [availableUsers, allOnlineUserIds]);

  // Conversas com status atualizado dos outros usuários
  const mappedConversations = useMemo(() => {
    return conversations.map((c) => ({
      ...c,
      otherUser: {
        ...c.otherUser,
        online: allOnlineUserIds.has(c.otherUser.id),
      },
    }));
  }, [conversations, allOnlineUserIds]);

  // Conversa ativa com status de presença atualizado
  const currentActiveConv = useMemo(() => {
    if (!activeConversation) return null;
    return {
      ...activeConversation,
      otherUser: {
        ...activeConversation.otherUser,
        online: allOnlineUserIds.has(activeConversation.otherUser.id),
      },
    };
  }, [activeConversation, allOnlineUserIds]);

  // Usuários online no momento
  const onlineUsers = useMemo(() => {
    return mappedAvailableUsers.filter((u) => u.online);
  }, [mappedAvailableUsers]);

  // Total de mensagens não lidas no sistema
  const totalUnreadCount = mappedConversations.reduce(
    (acc, c) => acc + (c.unreadCount || 0),
    0
  );

  return {
    conversations: mappedConversations,
    activeConversation: currentActiveConv,
    messages,
    availableUsers: mappedAvailableUsers,
    onlineUsers,
    allOnlineUserIds,
    loading,
    messagesLoading,
    totalUnreadCount,
    typingUsers: activeConversation ? typingUsers[activeConversation.id] || [] : [],
    selectConversation,
    startConversationWithUser,
    sendTextMessage,
    editExistingMessage,
    deleteMessage,
    hideConversation,
    clearHistory,
    reactToMessage,
    sendTypingSignal,
    refreshConversations: loadConversations,
  };
}
