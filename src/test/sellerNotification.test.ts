import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isValidEmail,
  resolveSellerEmail,
  buildApprovalNotificationEmail,
  triggerSellerApprovalNotification,
  retrySellerNotification,
} from "../lib/sellerNotificationService";
import { supabase } from "@/integrations/supabase/client";
import * as sellerNotificationService from "../lib/sellerNotificationService";
import * as outlookService from "../lib/outlookService";

// Mock do supabase
vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-123" } } }, error: null }),
      },
      rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    },
  };
});

// Mock do outlookService
vi.mock("../lib/outlookService", () => {
  return {
    getEmailAccessToken: vi.fn().mockResolvedValue("mock_access_token"),
    fetchMailboxMessages: vi.fn(),
    fetchConversationMessages: vi.fn(),
  };
});

// Mock do msalClient
vi.mock("../lib/msalClient", () => {
  return {
    getMsalInstance: vi.fn().mockResolvedValue({
      getActiveAccount: vi.fn().mockReturnValue({ username: "preimpressao@primacorgrafica.com.br" }),
    }),
    SHAREPOINT_SCOPES: ["User.Read", "Sites.ReadWrite.All", "Mail.Read.Shared", "Mail.Send", "Mail.Send.Shared"],
  };
});

describe("Validação de E-mail de Usuários e Vendedores", () => {
  it("deve validar corretamente formatos válidos de e-mail corporativo", () => {
    expect(isValidEmail("carlos@primacorgrafica.com.br")).toBe(true);
    expect(isValidEmail("deborah.silva@primacorgrafica.com.br")).toBe(true);
    expect(isValidEmail("  vendedor@empresa.com.br  ")).toBe(true);
  });

  it("deve rejeitar e-mails inválidos, vazios ou malformatados", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail("carlos")).toBe(false);
    expect(isValidEmail("carlos@")).toBe(false);
    expect(isValidEmail("@primacorgrafica.com.br")).toBe(false);
    expect(isValidEmail("carlos@primacor")).toBe(false);
  });
});

describe("Identificação Automática e Resolução do Vendedor Vinculado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve identificar o vendedor por correspondência exata em profiles", async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { nome: "Carlos", email: "carlos@primacorgrafica.com.br", user_id: "uid-carlos" },
            error: null,
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const res = await resolveSellerEmail("Carlos");
    expect(res.email).toBe("carlos@primacorgrafica.com.br");
    expect(res.name).toBe("Carlos");
    expect(res.source).toBe("profiles");
  });

  it("deve identificar o vendedor na tabela vendedores se não encontrar em profiles", async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === "vendedores") {
        return {
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { nome: "Deborah", email: "deborah@primacorgrafica.com.br", user_id: "uid-deb" },
            error: null,
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const res = await resolveSellerEmail("Deborah");
    expect(res.email).toBe("deborah@primacorgrafica.com.br");
    expect(res.name).toBe("Deborah");
    expect(res.source).toBe("vendedores");
  });

  it("deve utilizar o criador da OS como fallback se o vendedor não for informado", async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { nome: "Admin Primacor", email: "admin@primacorgrafica.com.br" },
            error: null,
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const res = await resolveSellerEmail(null, "user-creator-123");
    expect(res.email).toBe("admin@primacorgrafica.com.br");
    expect(res.source).toBe("creator");
  });
});

describe("Montagem da Mensagem de Notificação (O.S., Cliente, Status e Link)", () => {
  it("deve incluir na mensagem a identificação da O.S., cliente, status e o link para acessar o card", () => {
    const template = buildApprovalNotificationEmail({
      osNumber: "73210",
      cliente: "ALIMENTOS BRASIL S/A",
      descricao: "Caixa Acoplada 250g",
      vendedorNome: "Carlos Vendedor",
      baseUrl: "https://kaban.primacor.com.br",
    });

    // Assunto
    expect(template.subject).toContain("O.S. #73210");
    expect(template.subject).toContain("ALIMENTOS BRASIL S/A");
    expect(template.subject).toContain("Aguardando Aprovação");

    // Link
    expect(template.link).toBe("https://kaban.primacor.com.br/?os=73210");

    // Corpo HTML
    expect(template.html).toContain("#73210");
    expect(template.html).toContain("ALIMENTOS BRASIL S/A");
    expect(template.html).toContain("Caixa Acoplada 250g");
    expect(template.html).toContain("Aguardando Aprovação");
    expect(template.html).toContain("Carlos Vendedor");
    expect(template.html).toContain("https://kaban.primacor.com.br/?os=73210");
    expect(template.html).toContain("Abrir O.S. no Kaban");
  });
});

describe("Anti-Duplicação e Disparo de Notificações", () => {
  let mockNotificationsTable: any[] = [];
  let mockAvisosTable: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificationsTable = [];
    mockAvisosTable = [];
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 202,
        json: async () => ({}),
        text: async () => "",
      } as Response)
    );
  });

  it("deve evitar notificações duplicadas para a mesma mudança de status se já houver notificação recente", async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "order_seller_notifications") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "notif-existente-uuid", sent_status: "sent" },
            error: null,
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const result = await triggerSellerApprovalNotification("order-uuid-1");
    expect(result.success).toBe(true);
    expect(result.skippedDuplicate).toBe(true);
    expect(result.notificationId).toBe("notif-existente-uuid");
  });

  it("deve registrar falha diagnosticada quando o vendedor vinculado não possuir e-mail cadastrado", async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "order_seller_notifications") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockImplementation((payload) => {
            mockNotificationsTable.push(payload);
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: "notif-failed-id" }, error: null }),
            };
          }),
        };
      }
      if (table === "avisos") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockImplementation((payload) => {
            mockAvisosTable.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === "orders") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "order-sem-email",
              titulo: "73210",
              cliente: "PRIMACOR TESTE",
              vendedor: "VendedorSemEmail",
              status: "aguardando_aprovacao",
            },
            error: null,
          }),
        };
      }
      if (table === "profiles" || table === "vendedores") {
        return {
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const result = await triggerSellerApprovalNotification("order-sem-email");
    expect(result.success).toBe(false);
    expect(result.error).toContain("não possui e-mail cadastrado");
    expect(mockNotificationsTable.length).toBe(1);
    expect(mockNotificationsTable[0].sent_status).toBe("failed");

    // Valida que aviso interno de falha foi gerado no Kaban
    expect(mockAvisosTable).toHaveLength(1);
    expect(mockAvisosTable[0].titulo).toContain("⚠️ Falha no envio ao Vendedor — O.S. #73210");
    expect(mockAvisosTable[0].tipo).toBe("urgente");
  });

  it("deve registrar e disparar notificação com sucesso quando o vendedor tiver e-mail válido", async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "order_seller_notifications") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockImplementation((payload) => {
            mockNotificationsTable.push(payload);
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: "notif-success-id" }, error: null }),
            };
          }),
          update: vi.fn().mockImplementation((updatePayload) => {
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }
      if (table === "avisos") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockImplementation((payload) => {
            mockAvisosTable.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === "orders") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "order-ok-123",
              titulo: "99100",
              cliente: "NESTLE BRASIL",
              vendedor: "Carlos",
              status: "aguardando_aprovacao",
            },
            error: null,
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { nome: "Carlos", email: "carlos@primacorgrafica.com.br" },
            error: null,
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const result = await triggerSellerApprovalNotification("order-ok-123");
    expect(result.success).toBe(true);
    expect(result.sent).toBe(true);
    expect(result.notificationId).toBe("notif-success-id");

    // Valida que aviso interno de sucesso foi gerado no Kaban
    expect(mockAvisosTable).toHaveLength(1);
    expect(mockAvisosTable[0].titulo).toContain("📧 Notificação enviada ao Vendedor — O.S. #99100");
    expect(mockAvisosTable[0].tipo).toBe("info");
  });
});

describe("Integração Microsoft Graph API (sendEmailViaGraph)", () => {
  it("deve enviar e-mail com sucesso via /me/sendMail", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({}),
    });

    const res = await sellerNotificationService.sendEmailViaGraph({
      to: "carlos@primacorgrafica.com.br",
      subject: "🔔 [KABAN] O.S. #73210 — Aguardando Aprovação",
      htmlContent: "<p>Conteúdo de teste</p>",
    });

    expect(res.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me/sendMail",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("deve tentar fallback para /users/{sender}/sendMail caso /me retorne erro", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: "Access denied" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({}),
      });

    const res = await sellerNotificationService.sendEmailViaGraph({
      to: "carlos@primacorgrafica.com.br",
      subject: "🔔 [KABAN] O.S. #73210 — Aguardando Aprovação",
      htmlContent: "<p>Conteúdo de teste</p>",
    });

    expect(res.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("Tratamento de Falhas e Retentativa (Retry)", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 202,
        json: async () => ({}),
        text: async () => "",
      } as Response)
    );
  });

  it("deve retentar o envio de uma notificação falha e atualizar o status para sent", async () => {
    let updatedPayload: any = null;
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "order_seller_notifications") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "notif-retry-1",
              vendedor_email: "deborah@primacorgrafica.com.br",
              subject: "🔔 [KABAN] O.S. #73210 — Teste",
              body_html: "<p>Conteudo</p>",
              attempts: 1,
            },
            error: null,
          }),
          update: vi.fn().mockImplementation((payload) => {
            updatedPayload = payload;
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const ok = await retrySellerNotification("notif-retry-1");
    expect(ok).toBe(true);
    expect(updatedPayload).not.toBeNull();
    expect(updatedPayload.sent_status).toBe("sent");
    expect(updatedPayload.attempts).toBe(2);
  });
});
