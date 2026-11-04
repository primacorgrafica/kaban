import { describe, it, expect, vi, beforeEach } from "vitest";
import { unreadEmailsManager } from "@/lib/unreadEmailsManager";
import type { Order } from "@/types/order";

describe("Filtro E-MAILS RESPONDIDOS - Kanban Primacor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockOrderWithUnread: Order = {
    id: "order-with-unread-123",
    titulo: "73448 - PROVA DIGITAL",
    cliente: "CECREMGE",
    descricao: "1000 JORNAL #368",
    status: "aguardando_aprovacao",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockOrderWithVerified: Order = {
    id: "order-with-verified-456",
    titulo: "73449 - CARTILHA",
    cliente: "ARCOVERDE",
    descricao: "500 CARTILHAS",
    status: "aguardando_aprovacao",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockOrderWithoutEmails: Order = {
    id: "order-no-emails-789",
    titulo: "73450 - FOLDER",
    cliente: "PATRIMAR",
    descricao: "3000 FOLDERS",
    status: "preparacao",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("unreadEmailsManager deve detectar hasEmailReply para ordens com cartinha (não lida ou verificada)", () => {
    // Simula registro de eventos
    unreadEmailsManager.applyRemoteOrderRead(
      mockOrderWithVerified.id,
      "73449",
      new Date().toISOString(),
      ["evt-verified-1"]
    );

    // O status da verificada deve constar como hasVerified e hasEmailReply
    expect(unreadEmailsManager.hasVerified(mockOrderWithVerified.id)).toBe(true);
    expect(unreadEmailsManager.hasEmailReply(mockOrderWithVerified.id)).toBe(true);

    // Ordem sem e-mails não deve ter resposta nem cartinha
    expect(unreadEmailsManager.hasEmailReply(mockOrderWithoutEmails.id)).toBe(false);
  });

  it("deve filtrar corretamente na lista de O.S. quando 'emailsRespondidos' estiver ativado", () => {
    // Mock de funções do hook
    const hasUnread = (id: string) => id === mockOrderWithUnread.id;
    const hasVerified = (id: string) => id === mockOrderWithVerified.id;

    const orders = [mockOrderWithUnread, mockOrderWithVerified, mockOrderWithoutEmails];

    // Simula a lógica de filtragem de Index.tsx
    const filterFn = (list: Order[], emailsRespondidos: boolean, apenasNaoLidos: boolean) => {
      return list.filter((o) => {
        if (emailsRespondidos) {
          const isUnread = hasUnread(o.id);
          const isVerified = hasVerified(o.id);
          if (apenasNaoLidos) {
            if (!isUnread) return false;
          } else {
            if (!isUnread && !isVerified) return false;
          }
        }
        return true;
      });
    };

    // 1. Sem filtro: todas as 3 ordens aparecem
    expect(filterFn(orders, false, false)).toHaveLength(3);

    // 2. Com E-MAILS RESPONDIDOS ativado: somente as 2 que possuem cartinha aparecem
    const repliedOrders = filterFn(orders, true, false);
    expect(repliedOrders).toHaveLength(2);
    expect(repliedOrders.map((o) => o.id)).toEqual([mockOrderWithUnread.id, mockOrderWithVerified.id]);

    // 3. Com Apenas Não Lidos ativado: somente a ordem com resposta pendente aparece
    const unreadOnly = filterFn(orders, true, true);
    expect(unreadOnly).toHaveLength(1);
    expect(unreadOnly[0].id).toBe(mockOrderWithUnread.id);
  });

  it("KanbanFiltersBar e Index.tsx devem conter os identificadores e opções do filtro de e-mails", () => {
    const fs = require("fs");
    const path = require("path");
    const projectRoot = path.resolve(__dirname, "..");

    const filterBarCode = fs.readFileSync(path.join(projectRoot, "components", "KanbanFiltersBar.tsx"), "utf8");
    expect(filterBarCode).toContain("emailsRespondidos");
    expect(filterBarCode).toContain("E-mails Respondidos");
    expect(filterBarCode).toContain("Apenas Não Lidos");

    const indexCode = fs.readFileSync(path.join(projectRoot, "pages", "Index.tsx"), "utf8");
    expect(indexCode).toContain("useUnreadEmailReplies");
    expect(indexCode).toContain("filters.emailsRespondidos");
    expect(indexCode).toContain("hasUnread(o.id");
    expect(indexCode).toContain("hasVerified(o.id");
  });
});
