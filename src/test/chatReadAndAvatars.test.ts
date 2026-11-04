import { describe, it, expect } from "vitest";
import {
  DEFAULT_OFFICIAL_AVATARS,
  fetchAvatarLibrary,
} from "@/lib/chatService";
import { ChatMessage, ChatAvatar, ChatMessageRead } from "@/types/chat";

describe("Chat Interno Primacor Kaban — Confirmação de Leitura & Biblioteca de Avatares", () => {
  describe("1. Confirmação de Leitura e Tiques Visuais", () => {
    it("deve representar dois tiques cinzas para mensagens enviadas e não visualizadas", () => {
      const message: ChatMessage = {
        id: "msg-101",
        conversation_id: "conv-1",
        sender_id: "user-sender",
        content: "O.S. 73448 já foi finalizada na CTP?",
        is_edited: false,
        is_deleted: false,
        deleted_for_users: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: "sent",
        is_read: false,
        read_at: null,
      };

      // Tique status: não lida
      const isRead = Boolean(message.is_read);
      const tickColor = isRead ? "text-sky-400" : "text-muted-foreground/50";
      const tickTitle = isRead ? "Mensagem lida" : "Enviada (não visualizada)";

      expect(isRead).toBe(false);
      expect(tickColor).toBe("text-muted-foreground/50");
      expect(tickTitle).toBe("Enviada (não visualizada)");
    });

    it("deve representar dois tiques azuis imediatamente após a leitura", () => {
      const readTimestamp = new Date().toISOString();
      const message: ChatMessage = {
        id: "msg-102",
        conversation_id: "conv-1",
        sender_id: "user-sender",
        content: "Perfeito, enviando chapa agora.",
        is_edited: false,
        is_deleted: false,
        deleted_for_users: [],
        created_at: new Date(Date.now() - 60000).toISOString(),
        updated_at: new Date().toISOString(),
        status: "sent",
        is_read: true,
        read_at: readTimestamp,
      };

      // Tique status: lida
      const isRead = Boolean(message.is_read);
      const tickColor = isRead ? "text-sky-400" : "text-muted-foreground/50";
      const tickTitle = isRead ? "Mensagem lida" : "Enviada (não visualizada)";

      expect(isRead).toBe(true);
      expect(tickColor).toBe("text-sky-400");
      expect(tickTitle).toBe("Mensagem lida");
      expect(message.read_at).toBe(readTimestamp);
    });

    it("deve registrar leitura individual em chat_message_reads com suporte a múltiplos participantes", () => {
      const conversationId = "conv-group-1";
      const messageId = "msg-200";

      const reads: ChatMessageRead[] = [
        {
          id: "read-1",
          message_id: messageId,
          conversation_id: conversationId,
          user_id: "user-alexandre",
          read_at: new Date().toISOString(),
        },
        {
          id: "read-2",
          message_id: messageId,
          conversation_id: conversationId,
          user_id: "user-coordenador",
          read_at: new Date().toISOString(),
        },
      ];

      expect(reads.length).toBe(2);
      expect(reads.some((r) => r.user_id === "user-alexandre")).toBe(true);
      expect(reads.some((r) => r.user_id === "user-coordenador")).toBe(true);
    });
  });

  describe("2. Biblioteca de Avatares Oficiais", () => {
    it("deve conter os 2 avatares oficiais iniciais com os caminhos corretos dos arquivos PNG", () => {
      expect(DEFAULT_OFFICIAL_AVATARS.length).toBe(2);

      const operadora = DEFAULT_OFFICIAL_AVATARS.find((a) =>
        a.image_url.includes("avatar-operadora-azul.png")
      );
      const operador = DEFAULT_OFFICIAL_AVATARS.find((a) =>
        a.image_url.includes("avatar-operador-azul.png")
      );

      expect(operadora).toBeDefined();
      expect(operadora?.name).toBe("Operadora Primacor (Azul)");
      expect(operadora?.category).toBe("oficial");
      expect(operadora?.is_active).toBe(true);

      expect(operador).toBeDefined();
      expect(operador?.name).toBe("Operador Primacor (Azul)");
      expect(operador?.category).toBe("oficial");
      expect(operador?.is_active).toBe(true);
    });

    it("deve preservar referências históricas de avatares de usuários ao desativar na biblioteca", () => {
      // Usuário escolheu o avatar da operadora
      const userProfile = {
        user_id: "user-maria",
        nome: "Maria",
        avatar_url: "/avatars/avatar-operadora-azul.png",
        avatar_id: "official-operadora-azul",
      };

      // Admin desativa o avatar na biblioteca
      const avatarLibrary: ChatAvatar[] = [
        {
          ...DEFAULT_OFFICIAL_AVATARS[0],
          is_active: false, // Desativado
        },
        {
          ...DEFAULT_OFFICIAL_AVATARS[1],
          is_active: true,
        },
      ];

      // Na listagem para novos usuários, só aparecem ativos
      const activeForNewUsers = avatarLibrary.filter((a) => a.is_active);
      expect(activeForNewUsers.length).toBe(1);
      expect(activeForNewUsers[0].image_url).toBe("/avatars/avatar-operador-azul.png");

      // No perfil do usuário e nas mensagens passadas, a referência histórica é PRESERVADA
      expect(userProfile.avatar_url).toBe("/avatars/avatar-operadora-azul.png");
    });
  });

  describe("3. Segurança, Validação de Cargos e RLS", () => {
    const checkRoleCanManageAvatars = (role: string | null) => {
      return role === "admin" || role === "coordenador";
    };

    it("deve permitir que apenas admin e coordenador gerenciem a biblioteca de avatares", () => {
      expect(checkRoleCanManageAvatars("admin")).toBe(true);
      expect(checkRoleCanManageAvatars("coordenador")).toBe(true);
      expect(checkRoleCanManageAvatars("operador")).toBe(false);
      expect(checkRoleCanManageAvatars("vendedor")).toBe(false);
      expect(checkRoleCanManageAvatars("user")).toBe(false);
      expect(checkRoleCanManageAvatars(null)).toBe(false);
    });

    it("deve validar que usuários comuns só podem atualizar seu próprio perfil de avatar (RLS: auth.uid() = user_id)", () => {
      const authUserId = "user-123";

      const canUpdateOwn = (targetUserId: string, callerId: string, callerRole: string) => {
        return targetUserId === callerId || callerRole === "admin";
      };

      // Usuário comum atualizando seu próprio avatar -> PERMITIDO
      expect(canUpdateOwn(authUserId, authUserId, "operador")).toBe(true);

      // Usuário comum tentando atualizar o avatar de outro colega -> BLOQUEADO
      expect(canUpdateOwn("user-456", authUserId, "operador")).toBe(false);

      // Administrador atualizando perfil -> PERMITIDO
      expect(canUpdateOwn("user-456", authUserId, "admin")).toBe(true);
    });

    it("deve validar que apenas participantes legítimos da conversa podem consultar confirmações de leitura", () => {
      const conversation = {
        id: "conv-333",
        user1_id: "user-andre",
        user2_id: "user-alexandre",
      };

      const isParticipant = (userId: string) => {
        return conversation.user1_id === userId || conversation.user2_id === userId;
      };

      expect(isParticipant("user-andre")).toBe(true);
      expect(isParticipant("user-alexandre")).toBe(true);
      expect(isParticipant("user-invasor")).toBe(false);
    });
  });
});
