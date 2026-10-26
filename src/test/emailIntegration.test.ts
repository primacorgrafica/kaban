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
          update: vi.fn().mockImplementation(() => {
            const updateBuilder: any = {
              eq: vi.fn().mockImplementation(() => updateBuilder),
              or: vi.fn().mockImplementation(() => updateBuilder),
              ilike: vi.fn().mockImplementation(() => updateBuilder),
              then: vi.fn().mockImplementation((cb) => Promise.resolve(cb ? cb() : null)),
              catch: vi.fn().mockResolvedValue(null),
            };
            return updateBuilder;
          }),
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

      const createFallbackChainable = () => {
        const fallbackBuilder: any = {
          data: null,
          error: null,
          eq: vi.fn().mockImplementation(() => fallbackBuilder),
          neq: vi.fn().mockImplementation(() => fallbackBuilder),
          gte: vi.fn().mockImplementation(() => fallbackBuilder),
          lte: vi.fn().mockImplementation(() => fallbackBuilder),
          ilike: vi.fn().mockImplementation(() => fallbackBuilder),
          not: vi.fn().mockImplementation(() => fallbackBuilder),
          limit: vi.fn().mockImplementation(() => fallbackBuilder),
          single: vi.fn().mockResolvedValue({ data: { id: "mock-notif-fallback-id" }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          then: vi.fn().mockImplementation((cb) =>
            Promise.resolve(cb ? cb({ data: [], error: null }) : { data: [], error: null })
          ),
        };
        return fallbackBuilder;
      };

      return {
        select: vi.fn().mockImplementation(() => createFallbackChainable()),
        insert: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockImplementation(() => createFallbackChainable()),
          then: vi.fn().mockImplementation((cb) => Promise.resolve(cb ? cb({ error: null }) : { error: null })),
        })),
        update: vi.fn().mockImplementation(() => createFallbackChainable()),
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

  it("2. Recebimento de resposta do cliente: deve registrar aviso 'Nova resposta do cliente' e NÃO alterar status do CARD", async () => {
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

    // Verifica que gerou aviso interno padronizado de resposta recebida (NUNCA aprovação automática)
    expect(mockInsertedAvisos).toHaveLength(1);
    expect(mockInsertedAvisos[0].titulo).toBe("Nova resposta do cliente — O.S. 73210");
    expect(mockInsertedAvisos[0].mensagem).toContain("A O.S. 73210 recebeu uma resposta por e-mail. Acesse o CARD para consultar a mensagem.");
    expect(mockInsertedAvisos[0].tipo).toBe("info");

    // Valida que o CARD NÃO foi movido nem teve status alterado por conta da resposta
    expect(mockUpdatedOrders.some(o => o.status === "arquivo_liberado")).toBe(false);
  });

  it("3. Resposta sem número de O.S. no assunto: NÃO deve ser associada nem gerar notificação de resposta", async () => {
    // Resposta de cliente onde o assunto não possui o número da O.S.
    const replyWithoutNumberInSubject: GraphMessage = {
      id: "msg-reply-003",
      subject: "Re: Prova do material", // Sem número de O.S. no assunto!
      bodyPreview: "Bom dia, conferi o arquivo da OS 73210 e está tudo certo.",
      from: { emailAddress: { name: "Cliente Alpha", address: "cliente@alpha.com.br" } },
      toRecipients: [{ emailAddress: { name: "Pré-Impressão", address: "preimpressao@primacorgrafica.com.br" } }],
      sentDateTime: "2026-10-20T11:00:00Z",
      receivedDateTime: "2026-10-20T11:00:00Z",
    };

    vi.mocked(outlookService.fetchMailboxMessages).mockImplementation(
      async (mailbox, folder) => {
        if (mailbox === "preimpressao@primacorgrafica.com.br" && folder === "inbox") {
          return [replyWithoutNumberInSubject];
        }
        return [];
      }
    );

    const result = await runEmailSync();

    // Como o assunto não tem o número da O.S., não deve processar como resposta
    expect(result.newEvents).toBe(0);
    expect(mockInsertedEvents).toHaveLength(0);
    expect(mockInsertedAvisos).toHaveLength(0);
  });

  it("3b. Resposta com diferentes formatos de assunto da O.S.: deve identificar e notificar corretamente", async () => {
    const variations = [
      { subject: "73210", expectedOs: "73210" },
      { subject: "RE: 73210", expectedOs: "73210" },
      { subject: "RES: O.S. 73210", expectedOs: "73210" },
      { subject: "Re: Orçamento - 73210", expectedOs: "73210" },
    ];

    for (let i = 0; i < variations.length; i++) {
      const v = variations[i];
      mockInsertedEvents = [];
      mockInsertedAvisos = [];

      const msg: GraphMessage = {
        id: `msg-var-${i}`,
        subject: v.subject,
        bodyPreview: "Por favor alterar a quantidade para 1.000 unidades.", // Sem nenhuma palavra de aprovação!
        from: { emailAddress: { name: "Cliente Teste", address: "cliente@empresa.com" } },
        toRecipients: [{ emailAddress: { name: "Pré-Impressão", address: "preimpressao@primacorgrafica.com.br" } }],
        sentDateTime: "2026-10-26T14:00:00Z",
        receivedDateTime: "2026-10-26T14:00:00Z",
      };

      vi.mocked(outlookService.fetchMailboxMessages).mockImplementation(
        async (mailbox, folder) => {
          if (mailbox === "preimpressao@primacorgrafica.com.br" && folder === "inbox") {
            return [msg];
          }
          return [];
        }
      );

      const result = await runEmailSync();

      expect(result.newEvents).toBe(1);
      expect(mockInsertedAvisos).toHaveLength(1);
      expect(mockInsertedAvisos[0].titulo).toBe(`Nova resposta do cliente — O.S. ${v.expectedOs}`);
      expect(mockInsertedAvisos[0].tipo).toBe("info");
      // Não altera status do card
      expect(mockUpdatedOrders.some(o => o.status === "arquivo_liberado")).toBe(false);
    }
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

  it("6. Recuperação após falhas temporárias: erro em uma pasta não interrompe a sincronização de outras", async () => {
    const validMessage: GraphMessage = {
      id: "msg-preimp-005",
      subject: "OS 85000 - Layout Aprovado",
      bodyPreview: "Segue aprovação da OS 85000.",
      from: { emailAddress: { name: "Cliente Beta", address: "beta@empresa.com" } },
      toRecipients: [{ emailAddress: { name: "Pré-Impressão", address: "preimpressao@primacorgrafica.com.br" } }],
      sentDateTime: "2026-10-20T13:00:00Z",
      receivedDateTime: "2026-10-20T13:00:00Z",
      conversationId: "conv-beta-200",
    };

    // Sentitems falha temporariamente com erro 503 / timeout, mas Inbox responde com sucesso
    vi.mocked(outlookService.fetchMailboxMessages).mockImplementation(
      async (_mailbox, folder) => {
        if (folder === "sentitems") {
          throw new Error("Service Unavailable (503): Timeout ao contactar o servidor Exchange");
        }
        if (folder === "inbox") {
          return [validMessage];
        }
        return [];
      }
    );

    const result = await runEmailSync();

    // Registra os erros mas continua e processa com sucesso a pasta inbox!
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("503");
    expect(result.newEvents).toBe(1);
    expect(mockInsertedEvents[0]).toMatchObject({
      order_id: "order-uuid-85000",
      os_number: "85000",
      message_id: "msg-preimp-005",
    });
  });

  it("7. Notificação interna do sistema enviada para vendedor NÃO deve ser tratada como resposta de cliente", async () => {
    const notificationMessage: GraphMessage = {
      id: "msg-notif-seller-001",
      subject: "O.S. 73210 - Aguardando Aprovação (CIA INDUSTRIAL)",
      bodyPreview: "Notificação de Ordem de Serviço\nA O.S. 73210 mudou para Aguardando Aprovação.\nAcessar Card no Kaban",
      from: { emailAddress: { name: "Pré-Impressão", address: "preimpressao@primacorgrafica.com.br" } },
      toRecipients: [{ emailAddress: { name: "Vendedor Teste", address: "vendedor@primacorgrafica.com.br" } }],
      sentDateTime: "2026-10-26T15:10:00Z",
      receivedDateTime: "2026-10-26T15:10:00Z",
    };

    vi.mocked(outlookService.fetchMailboxMessages).mockImplementation(
      async (_mailbox, folder) => {
        if (folder === "sentitems") {
          return [notificationMessage];
        }
        return [];
      }
    );

    const result = await runEmailSync();

    // Não deve gerar avisos de cliente respondeu nem novos eventos de resposta
    expect(mockInsertedAvisos).toHaveLength(0);
    expect(result.newReceivedReplies).toHaveLength(0);

    // Deve mover a ordem para aguardando_aprovacao
    expect(mockUpdatedOrders.length).toBeGreaterThan(0);
    expect(mockUpdatedOrders[0]).toMatchObject({
      id: "order-uuid-73210",
      status: "aguardando_aprovacao",
    });
  });
});
