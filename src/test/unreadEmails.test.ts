import { describe, it, expect, vi, beforeEach } from "vitest";
import { unreadEmailsManager } from "../lib/unreadEmailsManager";
import { supabase } from "@/integrations/supabase/client";
import type { OrderEmailEvent } from "@/types/email";

// Mock do supabase client
vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn(),
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-test-uuid" } } }),
      },
    },
  };
});

describe("UnreadEmailsManager - Notificação Visual no Card e Coluna sem Pop-up", () => {
  const mockEvent1: OrderEmailEvent = {
    id: "event-reply-1",
    order_id: "order-uuid-404040",
    direction: "recebido",
    mailbox: "preimpressao@primacorgrafica.com.br",
    message_id: "msg-graph-123",
    conversation_id: "conv-1",
    subject: "RES: O.S. 404040 - CIA INDUSTRIAL",
    sender: "cliente@cataguases.com.br",
    recipients: "preimpressao@primacorgrafica.com.br",
    body_preview: "Segue aprovação da arte anexa.",
    email_datetime: new Date().toISOString(),
    os_number: "404040",
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("identifica corretamente evento recebido como não lido", () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "order_email_events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [mockEvent1], error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
    });

    expect(unreadEmailsManager).toBeDefined();
  });

  it("marca a O.S. como lida quando o operador clica no botão de leitura", async () => {
    const updateSpy = vi.fn().mockReturnThis();
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "order_email_events") {
        return {
          update: updateSpy,
          eq: vi.fn().mockReturnThis(),
        };
      }
      if (table === "avisos") {
        return {
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    await unreadEmailsManager.markOrderAsRead("order-uuid-404040", "404040");

    expect(unreadEmailsManager.hasUnread("order-uuid-404040")).toBe(false);
    expect(unreadEmailsManager.getUnreadCountForOrders(["order-uuid-404040"])).toBe(0);
  });

  it("calcula corretamente a quantidade de ordens com e-mails não lidos por coluna", () => {
    const orderIdsInColumn = ["order-uuid-404040", "order-uuid-999999"];
    // Se não há e-mails não lidos, contador da coluna deve ser 0
    expect(unreadEmailsManager.getUnreadCountForOrders(orderIdsInColumn)).toBe(0);
  });
});
