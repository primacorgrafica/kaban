import { describe, it, expect, vi, beforeEach } from "vitest";
import { runEmailSync } from "../lib/emailSyncEngine";
import * as outlookService from "../lib/outlookService";
import { supabase } from "@/integrations/supabase/client";
import type { GraphMessage } from "@/types/email";

// Mock do supabase client
vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "mock-user-uuid" } }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "mock-user-uuid" } } }, error: null }),
      },
    },
  };
});

// Mock do outlookService
vi.mock("../lib/outlookService", () => {
  return {
    fetchMailboxMessages: vi.fn(),
    fetchConversationMessages: vi.fn(),
    getEmailAccessToken: vi.fn().mockResolvedValue("mock_token"),
  };
});

describe("emailIntegration - Ciclos de Sincronização e Validação do Outlook", () => {
  const mockActiveOrders = [
    { id: "order-uuid-73210", titulo: "73210" },
    { id: "order-uuid-85000", titulo: "85000" },
  ];

  let mockExistingEvents: any[] = [];
  let mockInsertedEvents: any[] = [];
  let mockInsertedAvisos: any[] = [];
  let mockUpdatedOrders: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistingEvents = [];
    mockInsertedEvents = [];
    mockInsertedAvisos = [];
    mockUpdatedOrders = [];

    // Mock do Supabase queries
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "orders") {
        const createChainable = (resolvedData: any = mockActiveOrders) => {
          const builder: any = {
            data: resolvedData,
            error: null,
            neq: vi.fn().mockImplementation(() => builder),
            eq: vi.fn().mockImplementation(() => builder),
            limit: vi.fn().mockImplementation(() => builder),
            maybeSingle: vi.fn().mockResolvedValue({ data: resolvedData[0] || null, error: null }),
            single: vi.fn().mockResolvedValue({ data: resolvedData[0] || null, error: null }),
            then: vi.fn().mockImplementation((cb) =>
              Promise.resolve(cb ? cb({ data: resolvedData, error: null }) : { data: resolvedData, error: null })
            ),
          };
          return builder;
        };

        return {
          select: vi.fn().mockImplementation(() => createChainable(mockActiveOrders)),
          update: vi.fn().mockImplementation((updateData: any) => ({
            eq: vi.fn().mockImplementation((col: string, val: string) => ({
              neq: vi.fn().mockImplementation(() => {
                mockUpdatedOrders.push({ id: val, ...updateData });
                return Promise.resolve({ error: null });
              }),
              then: vi.fn().mockImplementation((cb) => {
                mockUpdatedOrders.push({ id: val, ...updateData });
                return Promise.resolve(cb ? cb({ error: null }) : { error: null });
              }),
            })),
          })),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      if (table === "order_email_events") {
        const createEventsQuery = (dataToReturn: any) => {
          const builder: any = {
            data: dataToReturn,
            error: null,
            eq: vi.fn().mockImplementation(() => builder),
            gte: vi.fn().mockImplementation(() => builder),
            then: vi.fn().mockImplementation((cb) =>
              Promise.resolve(cb ? cb({ data: dataToReturn, error: null }) : { data: dataToReturn, error: null })
            ),
          };
          return builder;
        };

        return {
          select: vi.fn().mockImplementation(() => createEventsQuery(mockExistingEvents)),
          insert: vi.fn().mockImplementation((data: any) => {
            mockInsertedEvents.push(data);
            return Promise.resolve({ error: null });
          }),
          update: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockReturnValue({
              ilike: vi.fn().mockReturnValue({
                then: vi.fn().mockImplementation((cb) => Promise.resolve(cb ? cb() : null)),
                catch: vi.fn().mockResolvedValue(null),
              }),
            }),
          })),
        };
      }

      if (table === "avisos") {
        const createAvisosQuery = (dataToReturn: any) => {
          const builder: any = {
            data: dataToReturn,
            error: null,
            gte: vi.fn().mockImplementation(() => builder),
            then: vi.fn().mockImplementation((cb) =>
              Promise.resolve(cb ? cb({ data: dataToReturn, error: null }) : { data: dataToReturn, error: null })
            ),
          };
          return builder;
        };

        return {
          select: vi.fn().mockImplementation(() => createAvisosQuery(mockInsertedAvisos)),
          insert: vi.fn().mockImplementation((aviso: any) => {
            mockInsertedAvisos.push(aviso);
            return Promise.resolve({ error: null });
          }),
        };
      }

      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });
  });

  it("1. Envio de e-mail contendo uma O.S.: deve identificar e gravar evento com direção 'enviado'", async () => {
    const sentMessage: GraphMessage = {
      id: "msg-sent-001",
      subject: "Envio de Prova Digital - OS 73210",
      bodyPreview: "Prezado cliente, segue layout da OS 73210 para validação.",
      from: { emailAddress: { name: "Pré-Impressão", address: "preimpressao@primacorgrafica.com.br" } },
      toRecipients: [{ emailAddress: { name: "Cliente Alpha", address: "cliente@alpha.com.br" } }],
      sentDateTime: "2026-10-20T10:00:00Z",
      receivedDateTime: "2026-10-20T10:00:00Z",
      conversationId: "conv-thread-100",
    };

    vi.mocked(outlookService.fetchMailboxMessages).mockImplementation(
      async (mailbox, folder) => {
        if (mailbox === "preimpressao@primacorgrafica.com.br" && folder === "sentitems") {
          return [sentMessage];
        }
        return [];
      }
    );

    const result = await runEmailSync();

    expect(result.newEvents).toBe(1);
    expect(mockInsertedEvents).toHaveLength(1);
    expect(mockInsertedEvents[0]).toMatchObject({
      order_id: "order-uuid-73210",
      os_number: "73210",
      direction: "enviado",
      mailbox: "preimpressao@primacorgrafica.com.br",
      message_id: "msg-sent-001",
      conversation_id: "conv-thread-100",
      subject: "Envio de Prova Digital - OS 73210",
      sender: "preimpressao@primacorgrafica.com.br",
      recipients: "cliente@alpha.com.br",
    });

    // Valida que ao enviar o e-mail de prova, o CARD é automaticamente movido para AGUARDANDO APROVAÇÃO
    expect(mockUpdatedOrders).toHaveLength(1);
    expect(mockUpdatedOrders[0]).toMatchObject({
      id: "order-uuid-73210",
      status: "aguardando_aprovacao",
    });
  });

  it("2. Recebimento de resposta do cliente: deve registrar aviso de e-mail respondido e NÃO mover CARD para SAÍDA", async () => {
    const receivedReply: GraphMessage = {
      id: "msg-reply-002",
      subject: "Re: Envio de Prova Digital - OS 73210",
      bodyPreview: "Aprovado! Pode rodar a produção.",
      from: { emailAddress: { name: "Cliente Alpha", address: "cliente@alpha.com.br" } },
      toRecipients: [{ emailAddress: { name: "Pré-Impressão", address: "preimpressao@primacorgrafica.com.br" } }],
      sentDateTime: "2026-10-20T10:30:00Z",
      receivedDateTime: "2026-10-20T10:30:00Z",
      conversationId: "conv-thread-100",
    };

    vi.mocked(outlookService.fetchMailboxMessages).mockImplementation(
      async (mailbox, folder) => {
        if (mailbox === "preimpressao@primacorgrafica.com.br" && folder === "inbox") {
          return [receivedReply];
        }
        return [];
      }
    );

    const result = await runEmailSync();

    expect(result.newEvents).toBe(1);
    expect(mockInsertedEvents[0]).toMatchObject({
      order_id: "order-uuid-73210",
      os_number: "73210",
      direction: "recebido",
      message_id: "msg-reply-002",
      sender: "cliente@alpha.com.br",
    });

    // Verifica que gerou aviso de e-mail respondido
    expect(mockInsertedAvisos).toHaveLength(1);
    expect(mockInsertedAvisos[0].titulo).toContain("E-mail Respondido");

    // Valida que o CARD NÃO foi movido para SAÍDA (permanece na coluna atual)
    expect(mockUpdatedOrders.some(o => o.status === "arquivo_liberado")).toBe(false);
  });

  it("3. Resposta sem número explícito, mas vinculada à conversa original: deve associar via conversationId", async () => {
    // Simula evento pré-existente no banco de dados com a conversa vinculada à OS 73210
    mockExistingEvents = [
      {
        message_id: "msg-sent-001",
        conversation_id: "conv-thread-100",
        order_id: "order-uuid-73210",
        os_number: "73210",
      },
    ];

    // Nova resposta do cliente sem mencionar o número 73210 no assunto nem no corpo!
    const replyWithoutNumber: GraphMessage = {
      id: "msg-reply-003",
      subject: "Re: Prova do material", // Sem número de O.S.!
      bodyPreview: "Bom dia, conferi o arquivo e está tudo certo, pode rodar.", // Sem número de O.S.!
      from: { emailAddress: { name: "Cliente Alpha", address: "cliente@alpha.com.br" } },
      toRecipients: [{ emailAddress: { name: "Embalagens", address: "embalagens@primacorgrafica.com.br" } }],
      sentDateTime: "2026-10-20T11:00:00Z",
      receivedDateTime: "2026-10-20T11:00:00Z",
      conversationId: "conv-thread-100", // Vinculada à thread da OS 73210!
    };

    vi.mocked(outlookService.fetchMailboxMessages).mockImplementation(
      async (mailbox, folder) => {
        if (mailbox === "embalagens@primacorgrafica.com.br" && folder === "inbox") {
          return [replyWithoutNumber];
        }
        return [];
      }
    );

    const result = await runEmailSync();

    expect(result.newEvents).toBe(1);
    expect(mockInsertedEvents[0]).toMatchObject({
      order_id: "order-uuid-73210",
      os_number: "73210",
      direction: "recebido",
      message_id: "msg-reply-003",
      conversation_id: "conv-thread-100",
    });
  });

  it("4. Mensagens com números semelhantes: não deve associar a O.S. inexistente ou incorreta", async () => {
    // E-mail cita o número 7321 (4 dígitos, mas O.S. ativa é 73210)
    const messageWithSimilarNumber: GraphMessage = {
      id: "msg-similar-004",
      subject: "Dúvida sobre pedido 7321",
      bodyPreview: "Olá, gostaria de saber o status da NF 7321.",
      from: { emailAddress: { name: "Outro Cliente", address: "outro@cliente.com" } },
      toRecipients: [{ emailAddress: { name: "Pré-Impressão", address: "preimpressao@primacorgrafica.com.br" } }],
      sentDateTime: "2026-10-20T12:00:00Z",
      receivedDateTime: "2026-10-20T12:00:00Z",
      conversationId: "conv-similar-999",
    };

    vi.mocked(outlookService.fetchMailboxMessages).mockResolvedValue([messageWithSimilarNumber]);

    const result = await runEmailSync();

    // Como 7321 não existe nas O.S. ativas ("73210" e "85000"), não deve registrar evento
    expect(result.newEvents).toBe(0);
    expect(mockInsertedEvents).toHaveLength(0);
  });

  it("5. Prevenção de eventos duplicados: não deve gravar mensagem com message_id já existente", async () => {
    // Mensagem já gravada previamente no banco
    mockExistingEvents = [
      {
        message_id: "msg-sent-001",
        conversation_id: "conv-thread-100",
        order_id: "order-uuid-73210",
        os_number: "73210",
      },
    ];

    // Graph retorna a mesma mensagem novamente na listagem
    const duplicateMessage: GraphMessage = {
      id: "msg-sent-001", // Mesmo ID
      subject: "Envio de Prova Digital - OS 73210",
      bodyPreview: "Prezado cliente, segue layout...",
      from: { emailAddress: { name: "Pré-Impressão", address: "preimpressao@primacorgrafica.com.br" } },
      toRecipients: [{ emailAddress: { name: "Cliente Alpha", address: "cliente@alpha.com.br" } }],
      sentDateTime: "2026-10-20T10:00:00Z",
      receivedDateTime: "2026-10-20T10:00:00Z",
      conversationId: "conv-thread-100",
    };

    vi.mocked(outlookService.fetchMailboxMessages).mockResolvedValue([duplicateMessage]);

    const result = await runEmailSync();

    expect(result.newEvents).toBe(0);
    expect(mockInsertedEvents).toHaveLength(0);
  });

  it("6. Recuperação após falhas temporárias: erro em uma caixa não interrompe a sincronização de outras", async () => {
    const validMessage: GraphMessage = {
      id: "msg-embalagens-005",
      subject: "OS 85000 - Layout Aprovado",
      bodyPreview: "Segue aprovação da OS 85000.",
      from: { emailAddress: { name: "Cliente Beta", address: "beta@empresa.com" } },
      toRecipients: [{ emailAddress: { name: "Embalagens", address: "embalagens@primacorgrafica.com.br" } }],
      sentDateTime: "2026-10-20T13:00:00Z",
      receivedDateTime: "2026-10-20T13:00:00Z",
      conversationId: "conv-beta-200",
    };

    // Preimpressao falha temporariamente com erro 503 / timeout, mas Embalagens responde com sucesso
    vi.mocked(outlookService.fetchMailboxMessages).mockImplementation(
      async (mailbox, folder) => {
        if (mailbox === "preimpressao@primacorgrafica.com.br") {
          throw new Error("Service Unavailable (503): Timeout ao contactar o servidor Exchange");
        }
        if (mailbox === "embalagens@primacorgrafica.com.br" && folder === "inbox") {
          return [validMessage];
        }
        return [];
      }
    );

    const result = await runEmailSync();

    // Registra os erros mas continua e processa com sucesso a caixa embalagens!
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("503");
    expect(result.newEvents).toBe(1);
    expect(mockInsertedEvents[0]).toMatchObject({
      order_id: "order-uuid-85000",
      os_number: "85000",
      message_id: "msg-embalagens-005",
    });
  });
});
