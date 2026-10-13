import { supabase } from "@/integrations/supabase/client";
import {
  ChatConversation,
  ChatMessage,
  ChatReaction,
  ChatUser,
  ChatConversationSettings,
} from "@/types/chat";

/**
 * Ordena dois UUIDs canonicamente para garantir uma única conversa por par
 */
export function getCanonicalPair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

/**
 * Busca todos os usuários do sistema disponíveis para conversa
 */
export async function fetchChatUsers(
  currentUserId: string,
  realtimeOnlineIds?: Set<string>
): Promise<ChatUser[]> {
  try {
    const [{ data: profiles }, { data: roles }, { data: presence }] = await Promise.all([
      supabase.from("profiles").select("user_id, nome, setor_vinculado" as any),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_presence").select("user_id, last_seen"),
    ]);

    const roleMap: Record<string, string> = {};
    if (roles) {
      roles.forEach((r: { user_id: string; role: string }) => {
        roleMap[r.user_id] = r.role;
      });
    }

    const presenceMap: Record<string, string | null> = {};
    if (presence) {
      presence.forEach((p: { user_id: string; last_seen: string | null }) => {
        presenceMap[p.user_id] = p.last_seen;
      });
    }

    const users: ChatUser[] = [];
    if (profiles && profiles.length > 0) {
      profiles.forEach((p: any) => {
        if (p.user_id !== currentUserId) {
          const lastSeen = presenceMap[p.user_id] || null;
          const isRealtime = realtimeOnlineIds ? realtimeOnlineIds.has(p.user_id) : false;
          const isRecentHeartbeat = lastSeen
            ? Date.now() - new Date(lastSeen).getTime() < 3 * 60 * 1000
            : false;
          const isOnline = isRealtime || isRecentHeartbeat;

          users.push({
            id: p.user_id,
            nome: p.nome || "Usuário",
            role: roleMap[p.user_id] || null,
            setor: p.setor_vinculado || null,
            online: isOnline,
            last_seen: lastSeen,
          });
        }
      });
    }

    return users.sort((a, b) => a.nome.localeCompare(b.nome));
  } catch (error) {
    console.error("Erro ao buscar usuários para chat:", error);
    return [];
  }
}

/**
 * Busca conversas do usuário atual
 */
export async function fetchUserConversations(
  currentUserId: string,
  knownUsers: Record<string, ChatUser> = {}
): Promise<ChatConversation[]> {
  try {
    const [{ data: convs, error: convError }, { data: settings }] = await Promise.all([
      supabase
        .from("chat_conversations" as any)
        .select("*")
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .order("last_message_at", { ascending: false }),
      supabase
        .from("chat_conversation_settings" as any)
        .select("*")
        .eq("user_id", currentUserId),
    ]);

    if (convError || !convs) {
      return [];
    }

    const settingsMap: Record<string, ChatConversationSettings> = {};
    if (settings) {
      settings.forEach((s: any) => {
        settingsMap[s.conversation_id] = s;
      });
    }

    const visibleConvs = (convs as any[]).filter((raw) => {
      const convSetting = settingsMap[raw.id];
      return !(convSetting && convSetting.is_hidden);
    });

    const result = await Promise.all(
      visibleConvs.map(async (raw) => {
        const convSetting = settingsMap[raw.id];
        const otherUserId = raw.user1_id === currentUserId ? raw.user2_id : raw.user1_id;
        const otherUser = knownUsers[otherUserId] || {
          id: otherUserId,
          nome: "Colega de Trabalho",
        };

        let unreadCount = 0;
        const lastRead = convSetting?.last_read_at || raw.created_at;

        try {
          const { count } = await supabase
            .from("chat_messages" as any)
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", raw.id)
            .neq("sender_id", currentUserId)
            .gt("created_at", lastRead);

          unreadCount = count || 0;
        } catch {
          unreadCount = 0;
        }

        return {
          id: raw.id,
          user1_id: raw.user1_id,
          user2_id: raw.user2_id,
          last_message_at: raw.last_message_at || raw.created_at,
          last_message_preview: raw.last_message_preview,
          last_message_sender_id: raw.last_message_sender_id,
          created_at: raw.created_at,
          updated_at: raw.updated_at,
          otherUser,
          unreadCount,
          is_hidden: convSetting?.is_hidden || false,
          cleared_until: convSetting?.cleared_until || null,
          settings: convSetting || null,
        } as ChatConversation;
      })
    );

    return result;
  } catch (error) {
    console.error("Erro ao carregar conversas de chat:", error);
    return [];
  }
}

/**
 * Obtém ou inicia uma conversa privada única entre dois usuários
 */
export async function getOrCreateConversation(
  currentUserId: string,
  targetUserId: string,
  otherUserMeta?: ChatUser
): Promise<ChatConversation | null> {
  if (currentUserId === targetUserId) return null;
  const [u1, u2] = getCanonicalPair(currentUserId, targetUserId);

  try {
    // 1. Tentar encontrar existente
    const { data: existing, error: findError } = await supabase
      .from("chat_conversations" as any)
      .select("*")
      .eq("user1_id", u1)
      .eq("user2_id", u2)
      .maybeSingle();

    if (existing) {
      // Reativar visibilidade caso estivesse oculta
      await supabase
        .from("chat_conversation_settings" as any)
        .upsert(
          {
            conversation_id: (existing as any).id,
            user_id: currentUserId,
            is_hidden: false,
          },
          { onConflict: "conversation_id,user_id" }
        );

      return {
        id: (existing as any).id,
        user1_id: (existing as any).user1_id,
        user2_id: (existing as any).user2_id,
        last_message_at: (existing as any).last_message_at,
        last_message_preview: (existing as any).last_message_preview,
        last_message_sender_id: (existing as any).last_message_sender_id,
        created_at: (existing as any).created_at,
        updated_at: (existing as any).updated_at,
        otherUser: otherUserMeta || { id: targetUserId, nome: "Usuário" },
        unreadCount: 0,
      };
    }

    // 2. Criar nova conversa
    const { data: created, error: createError } = await supabase
      .from("chat_conversations" as any)
      .insert({
        user1_id: u1,
        user2_id: u2,
      })
      .select()
      .single();

    if (createError || !created) {
      console.error("Erro ao criar conversa:", createError);
      return null;
    }

    // Inicializar settings para ambos
    await Promise.all([
      supabase.from("chat_conversation_settings" as any).insert({
        conversation_id: (created as any).id,
        user_id: currentUserId,
        is_hidden: false,
        last_read_at: new Date().toISOString(),
      }),
      supabase.from("chat_conversation_settings" as any).insert({
        conversation_id: (created as any).id,
        user_id: targetUserId,
        is_hidden: false,
        last_read_at: new Date().toISOString(),
      }),
    ]);

    return {
      id: (created as any).id,
      user1_id: (created as any).user1_id,
      user2_id: (created as any).user2_id,
      last_message_at: (created as any).created_at,
      created_at: (created as any).created_at,
      updated_at: (created as any).updated_at,
      otherUser: otherUserMeta || { id: targetUserId, nome: "Usuário" },
      unreadCount: 0,
    };
  } catch (error) {
    console.error("Erro em getOrCreateConversation:", error);
    return null;
  }
}

/**
 * Busca histórico de mensagens de uma conversa com paginação
 */
export async function fetchConversationMessages(
  conversationId: string,
  currentUserId: string,
  clearedUntil?: string | null,
  limit: number = 50,
  beforeTimestamp?: string
): Promise<ChatMessage[]> {
  try {
    let query = supabase
      .from("chat_messages" as any)
      .select("*, reactions:chat_message_reactions(*)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (clearedUntil) {
      query = query.gt("created_at", clearedUntil);
    }

    if (beforeTimestamp) {
      query = query.lt("created_at", beforeTimestamp);
    }

    const { data, error } = await query;
    if (error || !data) {
      return [];
    }

    // Filtrar mensagens apagadas para o usuário atual
    const filtered = (data as any[]).filter((msg) => {
      if (msg.deleted_for_users && msg.deleted_for_users.includes(currentUserId)) {
        return false;
      }
      return true;
    });

    return filtered.map((m) => ({
      id: m.id,
      conversation_id: m.conversation_id,
      sender_id: m.sender_id,
      content: m.is_deleted ? "Esta mensagem foi apagada" : m.content,
      is_edited: m.is_edited,
      is_deleted: m.is_deleted,
      deleted_for_users: m.deleted_for_users || [],
      reply_to_id: m.reply_to_id,
      created_at: m.created_at,
      updated_at: m.updated_at,
      status: "sent",
      reactions: m.reactions || [],
    }));
  } catch (error) {
    console.error("Erro ao buscar mensagens:", error);
    return [];
  }
}

/**
 * Envia uma mensagem
 */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  replyToId?: string | null
): Promise<ChatMessage | null> {
  const trimmed = content.trim();
  if (!trimmed) return null;

  try {
    const now = new Date().toISOString();

    const { data: created, error } = await supabase
      .from("chat_messages" as any)
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content: trimmed,
        reply_to_id: replyToId || null,
        created_at: now,
        updated_at: now,
      })
      .select("*, reactions:chat_message_reactions(*)")
      .single();

    if (error || !created) {
      console.error("Erro ao enviar mensagem:", error);
      return null;
    }

    // Atualiza conversa
    await supabase
      .from("chat_conversations" as any)
      .update({
        last_message_at: now,
        last_message_preview: trimmed.slice(0, 80),
        last_message_sender_id: senderId,
      })
      .eq("id", conversationId);

    // Marca como lida para quem enviou
    await supabase
      .from("chat_conversation_settings" as any)
      .upsert(
        {
          conversation_id: conversationId,
          user_id: senderId,
          last_read_at: now,
          is_hidden: false,
        },
        { onConflict: "conversation_id,user_id" }
      );

    return {
      id: (created as any).id,
      conversation_id: (created as any).conversation_id,
      sender_id: (created as any).sender_id,
      content: (created as any).content,
      is_edited: (created as any).is_edited,
      is_deleted: (created as any).is_deleted,
      deleted_for_users: (created as any).deleted_for_users || [],
      reply_to_id: (created as any).reply_to_id,
      created_at: (created as any).created_at,
      updated_at: (created as any).updated_at,
      status: "sent",
      reactions: (created as any).reactions || [],
    };
  } catch (error) {
    console.error("Erro ao enviar mensagem no service:", error);
    return null;
  }
}

/**
 * Marca uma conversa como lida pelo usuário
 */
export async function markConversationAsRead(
  conversationId: string,
  userId: string
): Promise<void> {
  try {
    await supabase.from("chat_conversation_settings" as any).upsert(
      {
        conversation_id: conversationId,
        user_id: userId,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id,user_id" }
    );
  } catch (error) {
    console.error("Erro ao marcar como lida:", error);
  }
}

/**
 * Edita uma mensagem própria
 */
export async function editMessage(
  messageId: string,
  userId: string,
  newContent: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("chat_messages" as any)
      .update({
        content: newContent.trim(),
        is_edited: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", messageId)
      .eq("sender_id", userId);

    return !error;
  } catch (error) {
    console.error("Erro ao editar mensagem:", error);
    return false;
  }
}

/**
 * Exclui uma mensagem para si ("Excluir para mim")
 */
export async function deleteMessageForMe(
  messageId: string,
  userId: string,
  currentDeletedUsers: string[]
): Promise<boolean> {
  try {
    const updated = Array.from(new Set([...currentDeletedUsers, userId]));
    const { error } = await supabase
      .from("chat_messages" as any)
      .update({ deleted_for_users: updated })
      .eq("id", messageId);

    return !error;
  } catch (error) {
    console.error("Erro ao excluir mensagem para mim:", error);
    return false;
  }
}

/**
 * Exclui uma mensagem para todos (apenas autor)
 */
export async function deleteMessageForAll(
  messageId: string,
  userId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("chat_messages" as any)
      .update({
        is_deleted: true,
        content: "Esta mensagem foi apagada",
        updated_at: new Date().toISOString(),
      })
      .eq("id", messageId)
      .eq("sender_id", userId);

    return !error;
  } catch (error) {
    console.error("Erro ao excluir mensagem para todos:", error);
    return false;
  }
}

/**
 * Exclui a conversa para o usuário atual ("Excluir conversa para mim")
 * Oculta a conversa da lista sem apagar mensagens do outro participante
 */
export async function hideConversationForUser(
  conversationId: string,
  userId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("chat_conversation_settings" as any)
      .upsert(
        {
          conversation_id: conversationId,
          user_id: userId,
          is_hidden: true,
        },
        { onConflict: "conversation_id,user_id" }
      );

    return !error;
  } catch (error) {
    console.error("Erro ao ocultar conversa:", error);
    return false;
  }
}

/**
 * Limpa o histórico visível de uma conversa para o usuário atual
 */
export async function clearConversationHistoryForUser(
  conversationId: string,
  userId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("chat_conversation_settings" as any)
      .upsert(
        {
          conversation_id: conversationId,
          user_id: userId,
          cleared_until: new Date().toISOString(),
        },
        { onConflict: "conversation_id,user_id" }
      );

    return !error;
  } catch (error) {
    console.error("Erro ao limpar histórico da conversa:", error);
    return false;
  }
}

/**
 * Adiciona ou remove reação de emoji em mensagem
 */
export async function toggleMessageReaction(
  messageId: string,
  userId: string,
  emoji: string
): Promise<boolean> {
  try {
    // Verificar se já reagiu
    const { data: existing } = await supabase
      .from("chat_message_reactions" as any)
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("emoji", emoji)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("chat_message_reactions" as any)
        .delete()
        .eq("id", (existing as any).id);
    } else {
      await supabase.from("chat_message_reactions" as any).insert({
        message_id: messageId,
        user_id: userId,
        emoji,
      });
    }

    return true;
  } catch (error) {
    console.error("Erro ao reagir à mensagem:", error);
    return false;
  }
}
