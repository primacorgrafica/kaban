import { describe, it, expect } from "vitest";
import { Order } from "@/types/order";
import { isOrderBlocked, hasSpecialSupply } from "@/pages/ProducaoPage";
import { hasProductionPriority, isOrderInProduction } from "@/lib/productionPriority";
import { sortAndFilterProcessos, SPECIAL_SUPPLIES, isSpecialSupplyActive, getSpecialSupplyDetails } from "@/lib/processos";

describe("ProducaoPage — Regras operacionais e blocos por setor", () => {
  const baseOrder = (overrides: Partial<Order> = {}): Order =>
    ({
      id: "ord-1",
      titulo: "73500",
      cliente: "Cliente Teste",
      descricao: "Embalagens Personalizadas",
      status: "fila_de_entrada",
      setor: "producao",
      setor_status: "entrada",
      processos: [],
      urgente: false,
      posicao: 10,
      created_at: "2026-11-05T10:00:00Z",
      ...overrides,
    } as Order);

  describe("Detecção de Bloqueios e Paradas (isOrderBlocked)", () => {
    it("deve detectar ordem com status 'paralisado'", () => {
      const order = baseOrder({ status: "paralisado" });
      expect(isOrderBlocked(order)).toBe(true);
    });

    it("deve detectar ordem aguardando novo arquivo", () => {
      const order = baseOrder({ status: "aguardando_novo_arquivo" });
      expect(isOrderBlocked(order)).toBe(true);
    });

    it("deve detectar ordem com setor_status 'pendencia'", () => {
      const order = baseOrder({ setor_status: "pendencia" });
      expect(isOrderBlocked(order)).toBe(true);
    });

    it("deve detectar bloqueio registrado na observação", () => {
      const orderWithObs = baseOrder({
        observacao: "[BLOQUEIO] Aguardando aprovação de cor pelo cliente",
      });
      expect(isOrderBlocked(orderWithObs)).toBe(true);

      const orderWithMotivo = baseOrder({
        observacao: "Motivo da parada: Falta de matéria-prima no estoque",
      });
      expect(isOrderBlocked(orderWithMotivo)).toBe(true);
    });

    it("não deve marcar como bloqueada uma ordem regular sem pendências", () => {
      const order = baseOrder({
        status: "fila_de_entrada",
        setor_status: "entrada",
        observacao: "Produzir conforme arquivo anexo.",
      });
      expect(isOrderBlocked(order)).toBe(false);
    });
  });

  describe("Identificação de Suprimentos Especiais (hasSpecialSupply)", () => {
    it("deve identificar ordem com PANTONE ativo", () => {
      const order = baseOrder({ processos: ["OFFSET", "PANTONE"] });
      expect(hasSpecialSupply(order)).toBe(true);
    });

    it("deve identificar ordem com CLICHE ativo", () => {
      const order = baseOrder({ processos: ["CLICHE", "CORTE_VINCO"] });
      expect(hasSpecialSupply(order)).toBe(true);
    });

    it("deve identificar ordem com FACA ativa", () => {
      const order = baseOrder({ processos: ["FACA"] });
      expect(hasSpecialSupply(order)).toBe(true);
    });

    it("não deve marcar ordem que possui apenas processos padrão sem matrizes especiais", () => {
      const order = baseOrder({ processos: ["IMPRESSAO", "DOBRA", "REFILO"] });
      expect(hasSpecialSupply(order)).toBe(false);
    });
  });

  describe("Ordenação de Cards dentro do Bloco", () => {
    it("deve colocar O.S. com Prioridade na Produção (estrela) sempre antes das demais na fila", () => {
      const orderNormal1 = baseOrder({ id: "norm-1", titulo: "73001", posicao: 1 });
      const orderNormal2 = baseOrder({ id: "norm-2", titulo: "73002", posicao: 2 });
      const orderPriority = baseOrder({
        id: "prio-1",
        titulo: "73003",
        prioridade_producao: true,
        posicao: 99,
      });

      const list = [orderNormal1, orderNormal2, orderPriority];

      const sorted = [...list].sort((a, b) => {
        const prioA = hasProductionPriority(a);
        const prioB = hasProductionPriority(b);
        if (prioA !== prioB) return prioA ? -1 : 1;
        return (a.posicao || 0) - (b.posicao || 0);
      });

      expect(sorted[0].id).toBe("prio-1");
      expect(sorted[1].id).toBe("norm-1");
      expect(sorted[2].id).toBe("norm-2");
    });
  });

  describe("Validação de O.S. em Produção (isOrderInProduction)", () => {
    it("deve reconhecer como em produção ordens com setor de produção, CTP ou Digital", () => {
      expect(isOrderInProduction(baseOrder({ setor: "producao" }))).toBe(true);
      expect(isOrderInProduction(baseOrder({ setor: "ctp" }))).toBe(true);
      expect(isOrderInProduction(baseOrder({ setor: "digital" }))).toBe(true);
    });

    it("deve reconhecer como em produção ordens na fila de entrada mesmo sem sub-setor explicitamente definido", () => {
      expect(isOrderInProduction(baseOrder({ setor: null, setor_status: "entrada" }))).toBe(true);
    });

    it("não deve considerar em produção setores externos como pre_impressao, compras, expedicao", () => {
      expect(isOrderInProduction(baseOrder({ setor: "pre_impressao" }))).toBe(false);
      expect(isOrderInProduction(baseOrder({ setor: "compras" }))).toBe(false);
      expect(isOrderInProduction(baseOrder({ setor: "expedicao" }))).toBe(false);
    });
  });

  describe("Limpeza de Processos e Suprimentos na Tabela de Produção", () => {
    it("deve filtrar tags internas ruidosas como COMPRAS:status:entrada e OUTROS:info:...", () => {
      const rawProcessos = [
        "OFFSET",
        "OUTROS:info:wire-o%20branco%20%20%20-%20%20capa%20dura%20-%20Hot-Stamping%20ouro",
        "CLICHE:recebido:1793877286465:Alexandre",
        "COMPRAS:status:entrada",
        "DOBRA",
      ];

      const clean = sortAndFilterProcessos(rawProcessos);

      expect(clean).toContain("OFFSET");
      expect(clean).toContain("DOBRA");
      expect(clean).not.toContain("COMPRAS:status:entrada");
      expect(clean).not.toContain("CLICHE:recebido:1793877286465:Alexandre");
      expect(clean).not.toContain("OUTROS:info:wire-o%20branco%20%20%20-%20%20capa%20dura%20-%20Hot-Stamping%20ouro");
    });

    it("deve extrair suprimentos especiais com dados limpos e decodificados", () => {
      const rawProcessos = [
        "OUTROS:info:wire-o%20branco%20capa%20dura",
        "CLICHE:recebido:1793877286465:Alexandre",
      ];

      const activeSupplies = SPECIAL_SUPPLIES.filter((s) => isSpecialSupplyActive(rawProcessos, s.id));
      expect(activeSupplies.map((s) => s.id)).toContain("OUTROS");
      expect(activeSupplies.map((s) => s.id)).toContain("CLICHE");

      const outrosDetails = getSpecialSupplyDetails(rawProcessos, "OUTROS");
      expect(decodeURIComponent(outrosDetails.customText || "")).toBe("wire-o branco capa dura");

      const clicheDetails = getSpecialSupplyDetails(rawProcessos, "CLICHE");
      expect(clicheDetails.operationalState).toBe("recebido");
    });
  });

  describe("Segregação por Setores (CTP, Digital e Produção)", () => {
    it("deve separar corretamente as ordens por setor", () => {
      const oCtp = baseOrder({ id: "c1", setor: "ctp" });
      const oDigital = baseOrder({ id: "d1", setor: "digital" });
      const oProducao = baseOrder({ id: "p1", setor: "producao" });
      const oSemSetor = baseOrder({ id: "p2", setor: null });

      const all = [oCtp, oDigital, oProducao, oSemSetor];

      const ctpGroup = all.filter((o) => o.setor?.toLowerCase() === "ctp");
      const digitalGroup = all.filter((o) => o.setor?.toLowerCase() === "digital");
      const producaoGroup = all.filter(
        (o) => !o.setor || o.setor.toLowerCase() === "producao"
      );

      expect(ctpGroup.map((o) => o.id)).toEqual(["c1"]);
      expect(digitalGroup.map((o) => o.id)).toEqual(["d1"]);
      expect(producaoGroup.map((o) => o.id)).toEqual(["p1", "p2"]);
    });
  });
});
