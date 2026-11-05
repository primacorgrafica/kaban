import { describe, it, expect, vi } from "vitest";
import {
  isOrderInProduction,
  cleanObservationProductionPriority,
  setObservationProductionPriority,
  hasProductionPriority,
  toggleProductionPriority,
  NON_PRODUCTION_SECTOR_KEYS,
} from "@/lib/productionPriority";
import { cleanOsNumber } from "@/lib/orderRelationsService";
import { cleanOsNumber as cleanOsNumberFromProdCard } from "@/components/ProductionCard";
import { Order } from "@/types/order";

describe("Primacor Kaban — Prioridades na Produção", () => {
  describe("1. Identificação de Setor de Produção (isOrderInProduction)", () => {
    it("deve identificar como produção os setores produtivos ativos", () => {
      expect(isOrderInProduction({ setor: "ctp", arquivado: false })).toBe(true);
      expect(isOrderInProduction({ setor: "digital", arquivado: false })).toBe(true);
      expect(isOrderInProduction({ setor: "qualidade", arquivado: false })).toBe(true);
      expect(isOrderInProduction({ setor: "producao", arquivado: false })).toBe(true);
      expect(isOrderInProduction({ setor: "offset", arquivado: false })).toBe(true);
      expect(isOrderInProduction({ setor: "acabamento", arquivado: false })).toBe(true);
    });

    it("NÃO deve identificar como produção setores fora de produção ou arquivados", () => {
      expect(isOrderInProduction({ setor: "pre_impressao", arquivado: false })).toBe(false);
      expect(isOrderInProduction({ setor: "expedicao", arquivado: false })).toBe(false);
      expect(isOrderInProduction({ setor: "compras", arquivado: false })).toBe(false);
      expect(isOrderInProduction({ setor: "faturamento", arquivado: false })).toBe(false);
      expect(isOrderInProduction({ setor: "manutencao", arquivado: false })).toBe(false);
      expect(isOrderInProduction({ setor: null, arquivado: false })).toBe(false);
      expect(isOrderInProduction({ setor: "ctp", arquivado: true })).toBe(false);
      expect(isOrderInProduction(null)).toBe(false);
    });
  });

  describe("2. Tags e Resiliência em Observação", () => {
    it("cleanObservationProductionPriority deve limpar tags de prioridade sem afetar o restante do texto", () => {
      const raw = "[PRIORIDADE_PRODUCAO] Temos que imprimir primeiro a faca 10";
      expect(cleanObservationProductionPriority(raw)).toBe("Temos que imprimir primeiro a faca 10");

      const legacy = "[PRIORIDADE_PROD] Urgência de acabamento";
      expect(cleanObservationProductionPriority(legacy)).toBe("Urgência de acabamento");

      expect(cleanObservationProductionPriority("")).toBe("");
      expect(cleanObservationProductionPriority(null)).toBe("");
    });

    it("setObservationProductionPriority deve adicionar ou remover a tag mantendo o texto limpo", () => {
      const original = "Impressão em papel couché 300g";
      const withPriority = setObservationProductionPriority(original, true);
      expect(withPriority).toContain("[PRIORIDADE_PRODUCAO]");
      expect(withPriority).toContain("Impressão em papel couché 300g");

      const removed = setObservationProductionPriority(withPriority, false);
      expect(removed).not.toContain("[PRIORIDADE_PRODUCAO]");
      expect(removed).toBe("Impressão em papel couché 300g");
    });
  });

  describe("3. Detecção de Prioridade (hasProductionPriority)", () => {
    it("deve retornar true apenas quando a O.S. estiver em produção e tiver flag ou tag", () => {
      const orderInCtp: Partial<Order> = {
        setor: "ctp",
        arquivado: false,
        prioridade_producao: true,
      };
      expect(hasProductionPriority(orderInCtp)).toBe(true);

      const orderWithTag: Partial<Order> = {
        setor: "digital",
        arquivado: false,
        observacao: "[PRIORIDADE_PRODUCAO] Teste de prova",
      };
      expect(hasProductionPriority(orderWithTag)).toBe(true);
    });

    it("NÃO deve considerar prioridade se a O.S. estiver fora da Produção, mesmo com flag true", () => {
      const orderInPrePress: Partial<Order> = {
        setor: "pre_impressao",
        arquivado: false,
        prioridade_producao: true,
      };
      expect(hasProductionPriority(orderInPrePress)).toBe(false);

      const orderInExpedicao: Partial<Order> = {
        setor: "expedicao",
        arquivado: false,
        prioridade_producao: true,
      };
      expect(hasProductionPriority(orderInExpedicao)).toBe(false);

      const orderArchived: Partial<Order> = {
        setor: "ctp",
        arquivado: true,
        prioridade_producao: true,
      };
      expect(hasProductionPriority(orderArchived)).toBe(false);
    });
  });

  describe("4. Alternância de Prioridade (toggleProductionPriority)", () => {
    it("deve alternar a prioridade e chamar onUpdate com os dados normalizados", async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const testOrder: Order = {
        id: "os-uuid-1",
        titulo: "#73527",
        cliente: "CLIENTE TESTE",
        descricao: "Catálogo",
        status: "em_producao",
        setor: "ctp",
        setor_status: "gravacao",
        arquivado: false,
        prioridade_producao: false,
        observacao: "Arquivo liberado",
        created_at: new Date().toISOString(),
        tipo_trabalho: "novo",
        processos: [],
        tipo_entrega: [],
      };

      const result = await toggleProductionPriority(testOrder, mockUpdate);
      expect(result).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith("os-uuid-1", {
        prioridade_producao: true,
        observacao: expect.stringContaining("[PRIORIDADE_PRODUCAO]"),
      });
    });
  });

  describe("5. Ordenação no Kanban de Produção", () => {
    it("cards com prioridade devem ser ordenados antes dos cards comuns na mesma coluna", () => {
      const orders: Order[] = [
        {
          id: "1",
          titulo: "100",
          cliente: "A",
          descricao: "",
          status: "em_producao",
          setor: "ctp",
          setor_status: "entrada",
          posicao: 1,
          prioridade_producao: false,
          created_at: "2026-11-01T10:00:00Z",
          tipo_trabalho: "novo",
          processos: [],
          tipo_entrega: [],
        },
        {
          id: "2",
          titulo: "200",
          cliente: "B",
          descricao: "",
          status: "em_producao",
          setor: "ctp",
          setor_status: "entrada",
          posicao: 2,
          prioridade_producao: true, // PRIORITÁRIO
          created_at: "2026-11-02T10:00:00Z",
          tipo_trabalho: "novo",
          processos: [],
          tipo_entrega: [],
        },
        {
          id: "3",
          titulo: "300",
          cliente: "C",
          descricao: "",
          status: "em_producao",
          setor: "ctp",
          setor_status: "entrada",
          posicao: 0,
          prioridade_producao: false,
          created_at: "2026-11-01T08:00:00Z",
          tipo_trabalho: "novo",
          processos: [],
          tipo_entrega: [],
        },
      ];

      const sorted = [...orders].sort((a, b) => {
        const isPriorityA = hasProductionPriority(a);
        const isPriorityB = hasProductionPriority(b);
        if (isPriorityA !== isPriorityB) {
          return isPriorityA ? -1 : 1;
        }
        const posA = typeof a.posicao === "number" ? a.posicao : 9999;
        const posB = typeof b.posicao === "number" ? b.posicao : 9999;
        if (posA !== posB) return posA - posB;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      // O card prioritário (id 2) deve estar no topo absoluto da fila
      expect(sorted[0].id).toBe("2");
      // Os demais seguem a ordem de posição (posicao 0 antes de posicao 1)
      expect(sorted[1].id).toBe("3");
      expect(sorted[2].id).toBe("1");
    });
  });

  describe("6. Integridade de cleanOsNumber sem colisão ou ReferenceError", () => {
    it("cleanOsNumber deve ser exportado e funcional em orderRelationsService e ProductionCard", () => {
      expect(cleanOsNumber).toBeDefined();
      expect(cleanOsNumberFromProdCard).toBeDefined();
      expect(cleanOsNumber("#73527")).toBe("73527");
      expect(cleanOsNumberFromProdCard("#73527")).toBe("73527");
      expect(cleanOsNumber("OS. 73527")).toBe("73527");
      expect(cleanOsNumberFromProdCard("OS. 73527")).toBe("73527");
    });
  });
});
