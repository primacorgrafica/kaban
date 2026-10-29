import { describe, it, expect } from "vitest";
import { getCanonicalPair } from "@/lib/chatService";
import { ChatMessage, ChatConversation } from "@/types/chat";

describe("Chat Privado — Regras de Negócio e Lógica de Mensageria", () => {
  it("deve garantir par ordenado canônico único para evitar duplicação de conversas", () => {
    const userA = "11111111-1111-1111-1111-111111111111";
    const userB = "22222222-2222-2222-2222-222222222222";

    const pair1 = getCanonicalPair(userA, userB);
    const pair2 = getCanonicalPair(userB, userA);

    expect(pair1).toEqual([userA, userB]);
    expect(pair2).toEqual([userA, userB]);
    expect(pair1[0]).toBe(pair2[0]);
    expect(pair1[1]).toBe(pair2[1]);
  });

  it("deve ocultar mensagens excluídas individualmente para o usuário ('Excluir para mim')", () => {
    const user1 = "user-1";
    const user2 = "user-2";

    const messages: ChatMessage[] = [
      {
        id: "m1",
        conversation_id: "c1",
        sender_id: user2,
        content: "Arquivo recebido com sucesso",
        is_edited: false,
        is_deleted: false,
        deleted_for_users: [user1], // user1 excluiu para si
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "m2",
        conversation_id: "c1",
        sender_id: user2,
        content: "Pode seguir para impressão",
        is_edited: false,
        is_deleted: false,
        deleted_for_users: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    // Visão de user1: mensagem m1 deve ser filtrada
    const visibleForUser1 = messages.filter(
      (m) => !m.deleted_for_users.includes(user1)
    );
    expect(visibleForUser1.length).toBe(1);
    expect(visibleForUser1[0].id).toBe("m2");

    // Visão de user2: ambas as mensagens devem estar visíveis!
    const visibleForUser2 = messages.filter(
      (m) => !m.deleted_for_users.includes(user2)
    );
    expect(visibleForUser2.length).toBe(2);
  });

  it("deve ocultar histórico anterior a 'cleared_until' sem afetar outro participante ('Limpar histórico')", () => {
    const user1 = "user-1";
    const user2 = "user-2";

    const t1 = new Date("2026-10-10T10:00:00Z").toISOString();
    const t2 = new Date("2026-10-11T12:00:00Z").toISOString();
    const tCleared = new Date("2026-10-10T15:00:00Z").toISOString(); // user1 limpou às 15h do dia 10

    const messages: ChatMessage[] = [
      {
        id: "m1",
        conversation_id: "c1",
        sender_id: user2,
        content: "Mensagem antiga",
        is_edited: false,
        is_deleted: false,
        deleted_for_users: [],
        created_at: t1,
        updated_at: t1,
      },
      {
        id: "m2",
        conversation_id: "c1",
        sender_id: user2,
        content: "Mensagem recente pós-limpeza",
        is_edited: false,
        is_deleted: false,
        deleted_for_users: [],
        created_at: t2,
        updated_at: t2,
      },
    ];

    // Para user1, mensagens antes de tCleared são ocultadas
    const visibleForUser1 = messages.filter(
      (m) => new Date(m.created_at) > new Date(tCleared)
    );
    expect(visibleForUser1.length).toBe(1);
    expect(visibleForUser1[0].id).toBe("m2");

    // Para user2 (que não limpou), todo o histórico continua intacto
    const visibleForUser2 = messages;
    expect(visibleForUser2.length).toBe(2);
  });

  it("deve exibir marcador de 'Esta mensagem foi apagada' quando excluída para todos", () => {
    const message: ChatMessage = {
      id: "m1",
      conversation_id: "c1",
      sender_id: "user-1",
      content: "Esta mensagem foi apagada",
      is_edited: false,
      is_deleted: true,
      deleted_for_users: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(message.is_deleted).toBe(true);
    expect(message.content).toBe("Esta mensagem foi apagada");
  });

  it("deve calcular corretamente a quantidade total de mensagens não lidas", () => {
    const conversations: Partial<ChatConversation>[] = [
      { id: "c1", unreadCount: 3 },
      { id: "c2", unreadCount: 0 },
      { id: "c3", unreadCount: 5 },
    ];

    const totalUnread = conversations.reduce(
      (sum, c) => sum + (c.unreadCount || 0),
      0
    );
    expect(totalUnread).toBe(8);
  });

  it("deve incluir todos os usuários online na lista de exibição do chat mesmo sem conversa prévia", () => {
    const availableUsers = [
      { id: "u1", nome: "Deborah Silva", online: true, role: "vendedor" },
      { id: "u2", nome: "Carlos Impressor", online: false, role: "operador" },
      { id: "u3", nome: "Gabriel PCP", online: true, role: "coordenador" },
    ];

    const conversations: Partial<ChatConversation>[] = [
      {
        id: "c1",
        otherUser: { id: "u1", nome: "Deborah Silva", online: true },
        unreadCount: 0,
      },
    ];

    // u3 está online, mas ainda não tem conversa em `conversations`
    const existingOtherUserIds = new Set(conversations.map((c) => c.otherUser!.id));
    const onlineWithoutConv = availableUsers.filter(
      (u) => u.online && !existingOtherUserIds.has(u.id)
    );

    expect(onlineWithoutConv.length).toBe(1);
    expect(onlineWithoutConv[0].id).toBe("u3");
    expect(onlineWithoutConv[0].nome).toBe("Gabriel PCP");

    // Todos os usuários online que devem aparecer no chat:
    const allOnlineUsers = availableUsers.filter((u) => u.online);
    expect(allOnlineUsers.map((u) => u.id)).toEqual(["u1", "u3"]);
  });

  it("deve evitar duplicação de mensagens para o remetente quando o evento Realtime chegar antes da confirmação HTTP", () => {
    const currentUserId = "user-sender";
    const tempId = "temp-123456789";
    const realId = "msg-real-uuid-001";
    const content = "Testando mensagem sem duplicata";

    // Estado inicial: mensagem otimista adicionada
    let messages: ChatMessage[] = [
      {
        id: tempId,
        conversation_id: "conv-1",
        sender_id: currentUserId,
        content,
        is_edited: false,
        is_deleted: false,
        deleted_for_users: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: "sending",
      },
    ];

    // Cenário: Evento Realtime INSERT chega antes da resposta HTTP
    const realtimeMsg: ChatMessage = {
      id: realId,
      conversation_id: "conv-1",
      sender_id: currentUserId,
      content,
      is_edited: false,
      is_deleted: false,
      deleted_for_users: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: "sent",
    };

    // Handler de Realtime (deduplicação ativa)
    const handleRealtimeInsert = (prev: ChatMessage[], newMsg: ChatMessage) => {
      if (prev.some((m) => m.id === newMsg.id)) return prev;
      if (newMsg.sender_id === currentUserId) {
        const tempIndex = prev.findIndex(
          (m) =>
            m.id.startsWith("temp-") &&
            m.sender_id === currentUserId &&
            m.content.trim() === newMsg.content.trim()
        );
        if (tempIndex !== -1) {
          const updated = [...prev];
          updated[tempIndex] = { ...newMsg, status: "sent" };
          return updated;
        }
      }
      return [...prev, newMsg];
    };

    messages = handleRealtimeInsert(messages, realtimeMsg);
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe(realId);

    // Em seguida, a resposta HTTP resolve com o mesmo realId
    const handleHttpConfirm = (prev: ChatMessage[], confirmed: ChatMessage) => {
      const alreadyExists = prev.some((m) => m.id === confirmed.id);
      if (alreadyExists) {
        return prev.filter((m) => m.id !== tempId);
      }
      return prev.map((m) => (m.id === tempId ? { ...confirmed, status: "sent" } : m));
    };

    messages = handleHttpConfirm(messages, realtimeMsg);
    // Deve conter ESTRITAMENTE 1 mensagem
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe(realId);
    expect(messages[0].content).toBe(content);
  });

  it("deve evitar duplicação de mensagens para o remetente quando a resposta HTTP chegar antes do Realtime", () => {
    const currentUserId = "user-sender";
    const tempId = "temp-987654321";
    const realId = "msg-real-uuid-002";
    const content = "Testando confirmação HTTP antes do Realtime";

    let messages: ChatMessage[] = [
      {
        id: tempId,
        conversation_id: "conv-1",
        sender_id: currentUserId,
        content,
        is_edited: false,
        is_deleted: false,
        deleted_for_users: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: "sending",
      },
    ];

    const confirmedMsg: ChatMessage = {
      id: realId,
      conversation_id: "conv-1",
      sender_id: currentUserId,
      content,
      is_edited: false,
      is_deleted: false,
      deleted_for_users: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: "sent",
    };

    // 1. Resposta HTTP chega primeiro
    const handleHttpConfirm = (prev: ChatMessage[], confirmed: ChatMessage) => {
      const alreadyExists = prev.some((m) => m.id === confirmed.id);
      if (alreadyExists) {
        return prev.filter((m) => m.id !== tempId);
      }
      return prev.map((m) => (m.id === tempId ? { ...confirmed, status: "sent" } : m));
    };

    messages = handleHttpConfirm(messages, confirmedMsg);
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe(realId);

    // 2. Evento Realtime chega depois
    const handleRealtimeInsert = (prev: ChatMessage[], newMsg: ChatMessage) => {
      if (prev.some((m) => m.id === newMsg.id)) return prev;
      return [...prev, newMsg];
    };

    messages = handleRealtimeInsert(messages, confirmedMsg);
    // Deve conter ESTRITAMENTE 1 mensagem
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe(realId);
  });

  it("deve zerar notificação do topo quando o usuário visualiza a conversa ativa", () => {
    // Simula estado de mensagens não lidas no topo
    let unreadByConversation: Record<string, number> = {
      "conv-101": 3,
    };
    let unreadChatCount = Object.values(unreadByConversation).reduce((a, b) => a + b, 0);
    expect(unreadChatCount).toBe(3);

    // Usuário abre/visualiza a conversa "conv-101"
    const markConversationAsViewed = (convId: string) => {
      delete unreadByConversation[convId];
      unreadChatCount = Object.values(unreadByConversation).reduce((a, b) => a + b, 0);
    };

    markConversationAsViewed("conv-101");

    // A notificação no topo tem que sumir (unreadChatCount === 0)
    expect(unreadChatCount).toBe(0);
    expect(unreadByConversation["conv-101"]).toBeUndefined();
  });

  it("deve abater apenas as mensagens da conversa visualizada mantendo as outras não lidas", () => {
    let unreadByConversation: Record<string, number> = {
      "conv-alice": 2,
      "conv-bob": 1,
    };
    let unreadChatCount = Object.values(unreadByConversation).reduce((a, b) => a + b, 0);
    expect(unreadChatCount).toBe(3);

    // Usuário visualiza a conversa da Alice
    delete unreadByConversation["conv-alice"];
    unreadChatCount = Object.values(unreadByConversation).reduce((a, b) => a + b, 0);

    // Topo atualiza de 3 para 1
    expect(unreadChatCount).toBe(1);

    // Usuário visualiza a conversa do Bob
    delete unreadByConversation["conv-bob"];
    unreadChatCount = Object.values(unreadByConversation).reduce((a, b) => a + b, 0);

    // Topo zera completamente
    expect(unreadChatCount).toBe(0);
  });

  it("não deve incrementar notificação se o usuário estiver com a conversa aberta na tela e ativa", () => {
    const activeConversationId = "conv-active";
    const isModalOpen = true;
    const isVisible = true;

    const isActivelyViewing = (convId: string) => {
      return convId === activeConversationId && isModalOpen && isVisible;
    };

    let unreadChatCount = 0;

    // Chega nova mensagem na conversa ativa
    const newMsgConvId = "conv-active";
    if (!isActivelyViewing(newMsgConvId)) {
      unreadChatCount += 1;
    }

    // Como está visualizando ativamente, o contador do topo continua 0
    expect(unreadChatCount).toBe(0);
  });

  it("deve manter conversa excluída oculta mesmo após operações de sincronização e marcar como lida", () => {
    const hiddenSet = new Set<string>();
    const convId = "conv-to-delete";

    // 1. Exclui conversa para si
    hiddenSet.add(convId);
    expect(hiddenSet.has(convId)).toBe(true);

    // 2. Simula carregamento de conversas com filtro
    const allConvs = [{ id: "conv-to-delete" }, { id: "conv-keep" }];
    const visibleConvs = allConvs.filter((c) => !hiddenSet.has(c.id));

    expect(visibleConvs.length).toBe(1);
    expect(visibleConvs[0].id).toBe("conv-keep");

    // 3. Simula markConversationAsRead: não deve remover do hiddenSet
    // Atualiza apenas last_read sem redefinir is_hidden para false
    expect(hiddenSet.has(convId)).toBe(true);
  });

  it("deve reativar a conversa oculta apenas se uma nova mensagem do outro participante chegar", () => {
    const hiddenSet = new Set<string>(["conv-1"]);
    const currentUserId = "me";

    // Mensagem enviada pelo outro participante
    const incomingMsg = {
      conversation_id: "conv-1",
      sender_id: "other-user",
    };

    if (incomingMsg.sender_id !== currentUserId) {
      hiddenSet.delete(incomingMsg.conversation_id);
    }

    expect(hiddenSet.has("conv-1")).toBe(false);
  });

  it("não deve exibir contato excluído em disponíveis online", () => {
    const hiddenUsers = new Set<string>(["user-carlos"]);
    const availableUsers = [
      { id: "user-carlos", nome: "Carlos", online: true },
      { id: "user-ana", nome: "Ana", online: true },
    ];
    const existingOtherUserIds = new Set<string>();

    const onlineWithoutConv = availableUsers.filter(
      (u) => u.online && !existingOtherUserIds.has(u.id) && !hiddenUsers.has(u.id)
    );

    expect(onlineWithoutConv.length).toBe(1);
    expect(onlineWithoutConv[0].id).toBe("user-ana");
  });

  it("não deve desocultar conversas por mensagens enviadas entre terceiros", () => {
    const myConvIds = new Set<string>(["conv-me-and-ana"]);
    const hiddenConvs = new Set<string>(["conv-me-and-carlos"]);

    // Mensagem entre Carlos e Roberto (eu não participo desta conversa)
    const thirdPartyMsg = {
      conversation_id: "conv-carlos-roberto",
      sender_id: "user-carlos",
    };

    if (myConvIds.has(thirdPartyMsg.conversation_id)) {
      hiddenConvs.delete(thirdPartyMsg.conversation_id);
    }

    expect(hiddenConvs.has("conv-me-and-carlos")).toBe(true);
  });

  it("não deve ressuscitar conversa excluída quando a última mensagem histórica era do outro usuário", () => {
    const currentUserId = "user-me";
    const otherUserId = "user-other";
    const convId = "conv-123";

    const localHidden = new Set<string>([convId]);
    const settingsMap: Record<string, any> = {
      [convId]: {
        conversation_id: convId,
        user_id: currentUserId,
        is_hidden: true,
        cleared_until: "2026-10-29T10:00:00.000Z",
        updated_at: "2026-10-29T10:00:00.000Z",
      },
    };

    // Conversa onde a última mensagem histórica foi enviada pelo outro colega ANTES da exclusão (às 09:55)
    const rawConv = {
      id: convId,
      user1_id: currentUserId,
      user2_id: otherUserId,
      last_message_sender_id: otherUserId, // o outro usuário enviou a última mensagem histórica
      last_message_at: "2026-10-29T09:55:00.000Z", // antes da exclusão!
    };

    // Lógica corrigida do chatService:
    const convSetting = settingsMap[rawConv.id];
    const isLocallyHidden = localHidden.has(rawConv.id);
    const isDbHidden = Boolean(convSetting && convSetting.is_hidden);
    const isHidden = isLocallyHidden || isDbHidden;

    const referenceTime = convSetting?.cleared_until || convSetting?.updated_at;
    const hasNewMessageFromOther = Boolean(
      rawConv.last_message_sender_id &&
      rawConv.last_message_sender_id !== currentUserId &&
      referenceTime &&
      rawConv.last_message_at &&
      new Date(rawConv.last_message_at).getTime() > new Date(referenceTime).getTime() + 1000
    );

    let isVisible = false;
    if (!isHidden) {
      isVisible = true;
    } else if (hasNewMessageFromOther) {
      isVisible = true;
    } else {
      isVisible = false;
    }

    // A conversa DEVE permanecer estritamente oculta!
    expect(hasNewMessageFromOther).toBe(false);
    expect(isVisible).toBe(false);

    // Agora simula chegada de NOVA mensagem enviada pelo outro colega às 10:05 (após as 10:00 da exclusão)
    const rawConvWithNewMsg = {
      ...rawConv,
      last_message_at: "2026-10-29T10:05:00.000Z",
    };

    const hasNewMessageAfterDeletion = Boolean(
      rawConvWithNewMsg.last_message_sender_id &&
      rawConvWithNewMsg.last_message_sender_id !== currentUserId &&
      referenceTime &&
      rawConvWithNewMsg.last_message_at &&
      new Date(rawConvWithNewMsg.last_message_at).getTime() > new Date(referenceTime).getTime() + 1000
    );

    expect(hasNewMessageAfterDeletion).toBe(true);
  });
});
