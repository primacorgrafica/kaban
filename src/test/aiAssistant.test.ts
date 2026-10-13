import { describe, it, expect } from "vitest";
import {
  parseOrderText,
  suggestProcessosForProduct,
  analyzeProductionBottlenecks,
  generateDailyExecutiveBriefing,
} from "@/lib/aiAssistant";
import { Order } from "@/types/order";

describe("AI Assistant & NLP Heuristics Engine", () => {
  it("should extract client, description, urgency and delivery from WhatsApp briefing", () => {
    const rawText = `
      Olá equipe Primacor!
      Favor abrir O.S. para cliente: Farmácias São Bento
      Serviço: Catálogo Institucional 32 páginas em papel couche com laminação fosca e verniz localizado.
      A entrega precisa ser com MOTO até sexta-feira às 14h.
      Muito URGENTE porque é para evento no final de semana!
      Vendedor: Carlos
    `;

    const parsed = parseOrderText(rawText);

    expect(parsed.cliente).toBe("Farmácias São Bento");
    expect(parsed.descricao).toContain("Catálogo Institucional");
    expect(parsed.urgente).toBe(true);
    expect(parsed.tipo_entrega).toContain("MOTO");
    expect(parsed.vendedor).toBe("Carlos");
  });

  it("should automatically suggest printing and finishing processes for packaging boxes", () => {
    const suggestions = suggestProcessosForProduct("Caixa de embalagem para remédio em cartão duplex");
    expect(suggestions).toContain("CTP");
    expect(suggestions).toContain("OFF"); // Off-set
    expect(suggestions).toContain("COR"); // Corte e Vinco
    expect(suggestions).toContain("COL"); // Colagem
  });

  it("should detect production bottlenecks, delayed orders and stage load", () => {
    const mockOrders: Order[] = [
      {
        id: "1",
        titulo: "1001",
        cliente: "Cliente A",
        descricao: "Flyer",
        status: "preparando_arquivo",
        posicao: 0,
        urgente: true,
        urgente_prova: false,
        urgente_impressao: false,
        urgente_acabamento: false,
        urgente_expedicao: false,
        saida_direta: false,
        prova_digital: false,
        prova_email: false,
        processos: ["OFF"],
        tipo_entrega: [],
        arquivado: false,
        created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
        prazo: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // Delayed
      },
      {
        id: "2",
        titulo: "1002",
        cliente: "Cliente B",
        descricao: "Pasta",
        status: "preparando_arquivo",
        posicao: 1,
        urgente: false,
        urgente_prova: false,
        urgente_impressao: false,
        urgente_acabamento: false,
        urgente_expedicao: false,
        saida_direta: false,
        prova_digital: false,
        prova_email: false,
        processos: ["OFF"],
        tipo_entrega: [],
        arquivado: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        prazo: new Date(Date.now() + 4 * 3600 * 1000).toISOString(), // Due today
      },
    ];

    const bottlenecks = analyzeProductionBottlenecks(mockOrders);

    expect(bottlenecks.totalActive).toBe(2);
    expect(bottlenecks.delayedOrders.length).toBe(1);
    expect(bottlenecks.delayedOrders[0].titulo).toBe("1001");
    expect(bottlenecks.dueTodayOrders.length).toBe(1);
    expect(bottlenecks.dueTodayOrders[0].titulo).toBe("1002");
    expect(bottlenecks.urgentOrders.length).toBe(1);
    expect(bottlenecks.bottleneckStages.length).toBeGreaterThan(0);
  });

  it("should generate a structured executive briefing summary", () => {
    const mockOrders: Order[] = [
      {
        id: "1",
        titulo: "1001",
        cliente: "Cliente A",
        descricao: "Flyer",
        status: "preparando_arquivo",
        posicao: 0,
        urgente: true,
        urgente_prova: false,
        urgente_impressao: false,
        urgente_acabamento: false,
        urgente_expedicao: false,
        saida_direta: false,
        prova_digital: false,
        prova_email: false,
        processos: ["OFF"],
        tipo_entrega: [],
        arquivado: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        prazo: null,
      },
    ];

    const briefing = generateDailyExecutiveBriefing(mockOrders);
    expect(briefing.text).toContain("Relatório Executivo Primacor");
    expect(briefing.text).toContain("Total de Ordens Ativas");
  });
});
