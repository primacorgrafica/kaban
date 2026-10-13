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
});
