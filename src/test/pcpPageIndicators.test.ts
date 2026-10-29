import { describe, it, expect } from "vitest";
import { computePcpSectorCounts } from "@/pages/PcpPage";

describe("PAINEL - Contadores de Fluxo na Barra Superior", () => {
  it("deve calcular corretamente a quantidade de O.S. em Pré-impressão, Produção e Expedição", () => {
    const mockOrders = [
      // 1. Pré-impressão (ativas no fluxo pré-impressão e não liberadas)
      { id: "1", titulo: "1001", setor: null, setor_status: null, status: "novo", arquivado: false },
      { id: "2", titulo: "1002", setor: "desenvolvimento", setor_status: "entrada", status: "em_andamento", arquivado: false },
      { id: "3", titulo: "1003", setor: null, setor_status: null, status: "aguardando_aprovacao", arquivado: false },

      // 2. Produção (liberadas ou em setores produtivos: CTP, Digital, Produção, Qualidade)
      { id: "4", titulo: "2001", setor: null, setor_status: null, status: "arquivo_liberado", arquivado: false },
      { id: "5", titulo: "2002", setor: "ctp", setor_status: "producao", status: null, arquivado: false },
      { id: "6", titulo: "2003", setor: "digital", setor_status: "entrada", status: null, arquivado: false },
      { id: "7", titulo: "2004", setor: "producao", setor_status: "entrada", status: null, arquivado: false },
      { id: "8", titulo: "2005", setor: "qualidade", setor_status: "entrada", status: null, arquivado: false },

      // 3. Expedição (ativas na expedição)
      { id: "9", titulo: "3001", setor: "expedicao", setor_status: "entrada", status: null, arquivado: false },
      { id: "10", titulo: "3002", setor: "expedicao", setor_status: "rota_manha", status: null, arquivado: false },

      // 4. Exclusões: finalizadas na saída da expedição, arquivadas ou setores de apoio
      { id: "11", titulo: "4001", setor: "expedicao", setor_status: "saida", status: null, arquivado: false },
      { id: "12", titulo: "4002", setor: "producao", setor_status: "saida", status: null, arquivado: false },
      { id: "13", titulo: "4003", setor: null, setor_status: null, status: "novo", arquivado: true },
      { id: "14", titulo: "4004", setor: "compras", setor_status: "entrada", status: null, arquivado: false },
      { id: "15", titulo: "4005", setor: "manutencao", setor_status: "entrada", status: null, arquivado: false },
    ];

    const counts = computePcpSectorCounts(mockOrders);

    expect(counts.preImpressao).toBe(3);
    expect(counts.producao).toBe(5);
    expect(counts.expedicao).toBe(2);
  });

  it("deve desduplicar por título da O.S. para não inflar contadores com sub-ordens", () => {
    const mockOrdersWithSub = [
      // Mesma O.S. "75000" pai e filho em produção
      { id: "101", titulo: "75000", setor: "ctp", setor_status: "entrada", status: null, arquivado: false },
      { id: "102", titulo: "75000", setor: "producao", setor_status: "entrada", status: null, arquivado: false },
      // O.S. distinta
      { id: "103", titulo: "75001", setor: "digital", setor_status: "entrada", status: null, arquivado: false },
    ];

    const counts = computePcpSectorCounts(mockOrdersWithSub);

    expect(counts.producao).toBe(2);
  });

  it("deve retornar zeros quando não houver ordens", () => {
    const counts = computePcpSectorCounts([]);
    expect(counts.preImpressao).toBe(0);
    expect(counts.producao).toBe(0);
    expect(counts.expedicao).toBe(0);
  });
});
