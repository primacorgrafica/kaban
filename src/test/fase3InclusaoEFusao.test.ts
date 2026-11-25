import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateSameClientForMerge,
  detectMergeConflicts,
  type MergeOrdersPayload,
} from "@/types/delivery";
import {
  mergeOrdersForDelivery,
  unmergeOrdersFromDelivery,
  ensureDigitalProofDelivery,
  ensureProductionOrderDelivery,
} from "@/lib/deliveryService";
import { supabase } from "@/integrations/supabase/client";

// Mock do supabase client
vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

describe("FASE 3 — INCLUSÃO AUTOMÁTICA E FUSÃO DE OS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Inclusão Automática da Prova Digital ('P') ao ir para Aguardando Aprovação", () => {
    it("deve criar demanda de Prova Digital com prefixo 'P', veículo Moto e endereço da prova", async () => {
      const mockParent = {
        id: "parent-uuid-101",
        titulo: "73736",
        cliente: "Maison Deboà",
        descricao: "20 Rótulos Água Perfumada",
        vendedor: "Primacor",
        endereco_entrega: "Rua São Paulo, 1200 - Centro, BH",
        destinatario: "Maria Clara",
        prova_digital: true,
      };

      // Simula cadeia completa de chamadas do Supabase
      const mockSingle = vi.fn().mockResolvedValue({ data: { id: "proof-uuid-999" }, error: null });
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: mockSingle,
      });
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "orders") {
          return {
            select: mockSelect,
            insert: mockInsert,
          };
        }
        return {};
      });

      const res = await ensureDigitalProofDelivery(mockParent);

      expect(res.success).toBe(true);
      expect(res.proofOrderId).toBe("proof-uuid-999");
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          titulo: "P73736",
          cliente: "Maison Deboà",
          tipo_veiculo_entrega: "moto", // AUTOMATICAMENTE Moto
          status_entrega: "pendente", // Aguardando atribuição
          entrega_endereco: "Rua São Paulo, 1200 - Centro, BH",
          parent_order_id: "parent-uuid-101",
          is_prova_entrega: true,
        })
      );
    });

    it("deve ser idempotente e NÃO duplicar entrega caso a O.S. já possua uma prova ativa", async () => {
      const mockParent = {
        id: "parent-uuid-101",
        titulo: "P73736",
        cliente: "Maison Deboà",
        endereco_entrega: "Rua São Paulo, 1200 - Centro, BH",
        prova_digital: true,
      };

      const updateMock = vi.fn().mockReturnThis();
      const eqMock = vi.fn().mockResolvedValue({ error: null });

      // Simula que JÁ existe uma prova ativa
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "orders") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ id: "existing-proof-id", titulo: "P73736", entrega_endereco: "Rua Antiga, 10" }],
              error: null,
            }),
            update: updateMock.mockReturnValue({ eq: eqMock }),
            insert: vi.fn(),
          };
        }
        return {};
      });

      const res = await ensureDigitalProofDelivery(mockParent);

      expect(res.success).toBe(true);
      expect(res.proofOrderId).toBe("existing-proof-id");
      // Verifica que NÃO chamou insert (sem duplicidade!)
      const ordersClient = (supabase.from as any)("orders");
      expect(ordersClient.insert).not.toHaveBeenCalled();
      // E atualizou o endereço na existente
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          entrega_endereco: "Rua São Paulo, 1200 - Centro, BH",
        })
      );
    });
  });

  describe("2. Inclusão Automática da O.S. ao ir para Produção", () => {
    it("deve inicializar status_entrega como 'pendente' e tipo_veiculo_entrega sem duplicar ordens", async () => {
      const updateMock = vi.fn().mockReturnThis();
      const eqMock = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "orders") {
          return {
            update: updateMock.mockReturnValue({ eq: eqMock }),
          };
        }
        return {};
      });

      const orderInProduction = {
        id: "order-prod-001",
        titulo: "73755",
        status_entrega: null,
        tipo_veiculo_entrega: null,
      };

      const res = await ensureProductionOrderDelivery(orderInProduction);

      expect(res.success).toBe(true);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status_entrega: "pendente",
          tipo_veiculo_entrega: "moto",
        })
      );
    });

    it("não deve sobrescrever caso a ordem já possua status_entrega e veículo definidos", async () => {
      const updateMock = vi.fn();
      (supabase.from as any).mockReturnValue({ update: updateMock });

      const existingConfiguredOrder = {
        id: "order-prod-002",
        titulo: "73756",
        status_entrega: "atribuido",
        tipo_veiculo_entrega: "carro",
      };

      const res = await ensureProductionOrderDelivery(existingConfiguredOrder);

      expect(res.success).toBe(true);
      expect(updateMock).not.toHaveBeenCalled();
    });
  });

  describe("3. Validação de Fusão de O.S. (Apenas do MESMO Cliente)", () => {
    it("deve permitir fusão quando todas as O.S. pertencem ao mesmo cliente", () => {
      const orders = [
        { id: "1", titulo: "73755", cliente: "UNIMED BH" },
        { id: "2", titulo: "73748", cliente: "unimed bh  " },
        { id: "3", titulo: "P73736", cliente: "Unimed Bh" }, // Prova digital do mesmo cliente
      ];

      const res = validateSameClientForMerge(orders);
      expect(res.valid).toBe(true);
      expect(res.clientName?.toLowerCase()).toBe("unimed bh");
    });

    it("deve REJEITAR fusão quando houver clientes diferentes", () => {
      const orders = [
        { id: "1", titulo: "73755", cliente: "UNIMED BH" },
        { id: "2", titulo: "73748", cliente: "COLÉGIO LOGOSÓFICO" },
      ];

      const res = validateSameClientForMerge(orders);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Fusão permitida apenas para o MESMO cliente");
    });

    it("deve rejeitar quando menos de 2 ordens forem informadas", () => {
      const orders = [{ id: "1", titulo: "73755", cliente: "UNIMED BH" }];
      const res = validateSameClientForMerge(orders);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Selecione ao menos 2");
    });
  });

  describe("4. Detecção e Resolução de Conflitos de Endereço e Data", () => {
    it("deve detectar conflito de endereço quando O.S. possuírem endereços divergentes", () => {
      const orders = [
        {
          id: "1",
          titulo: "73755",
          cliente: "UNIMED BH",
          entrega_endereco: "Av. do Contorno, 3000 - Santa Efigênia, BH",
          entrega_data_limite: "2026-11-26T14:00:00Z",
        },
        {
          id: "2",
          titulo: "73748",
          cliente: "UNIMED BH",
          entrega_endereco: "Rua dos Otoni, 881 - Santa Efigênia, BH",
          entrega_data_limite: "2026-11-26T14:00:00Z",
        },
      ];

      const conflicts = detectMergeConflicts(orders);
      expect(conflicts.hasAddressConflict).toBe(true);
      expect(conflicts.distinctAddresses).toHaveLength(2);
      expect(conflicts.hasDateConflict).toBe(false); // Mesma data
    });

    it("deve detectar conflito de datas de entrega quando os prazos forem divergentes", () => {
      const orders = [
        {
          id: "1",
          titulo: "73755",
          cliente: "UNIMED BH",
          entrega_endereco: "Av. do Contorno, 3000 - Santa Efigênia, BH",
          entrega_data_limite: "2026-11-26T10:00:00Z",
        },
        {
          id: "2",
          titulo: "73748",
          cliente: "UNIMED BH",
          entrega_endereco: "Av. do Contorno, 3000 - Santa Efigênia, BH",
          entrega_data_limite: "2026-11-27T16:00:00Z",
        },
      ];

      const conflicts = detectMergeConflicts(orders);
      expect(conflicts.hasAddressConflict).toBe(false); // Mesmo endereço
      expect(conflicts.hasDateConflict).toBe(true);
      expect(conflicts.distinctDates).toHaveLength(2);
    });
  });

  describe("5. Execução da Fusão e Desfusão (Atômica e com Validação de Rota)", () => {
    it("deve fundir ordens atualizando parada_agrupada_id e aplicando o endereço/data escolhidos", async () => {
      (supabase.rpc as any).mockResolvedValue({
        data: { success: true, parada_id: "parada-uuid-auto" },
        error: null,
      });

      const payload: MergeOrdersPayload = {
        orderIds: ["order-1", "order-2"],
        chosenAddress: "Av. do Contorno, 3000 - Santa Efigênia",
        chosenDate: "2026-11-26T14:00:00Z",
        chosenVehicle: "carro",
      };

      const res = await mergeOrdersForDelivery(payload);
      expect(res.success).toBe(true);
      expect(res.paradaId).toBe("parada-uuid-auto");
      expect(supabase.rpc).toHaveBeenCalledWith(
        "merge_orders_for_delivery",
        expect.objectContaining({
          p_order_ids: ["order-1", "order-2"],
          p_chosen_address: "Av. do Contorno, 3000 - Santa Efigênia",
          p_chosen_vehicle: "carro",
        })
      );
    });

    it("deve permitir desfazer a fusão quando a entrega NÃO estiver em nenhuma rota", async () => {
      // Simula que a RPC unmerge_orders_from_delivery respondeu sucesso
      (supabase.rpc as any).mockResolvedValue({
        data: { success: true, unmerged_count: 2 },
        error: null,
      });

      const res = await unmergeOrdersFromDelivery("parada-uuid-livre");
      expect(res.success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith("unmerge_orders_from_delivery", {
        p_parada_id: "parada-uuid-livre",
      });
    });

    it("deve BLOQUEAR desfazer fusão se a entrega já estiver atribuída a uma rota", async () => {
      // Simula que a RPC recusou por estar em rota ativa
      (supabase.rpc as any).mockResolvedValue({
        data: null,
        error: {
          message:
            "Não é possível desfazer a fusão de uma entrega que já está atribuída a uma rota. Remova a entrega da rota antes de desfazer.",
        },
      });

      const res = await unmergeOrdersFromDelivery("parada-uuid-em-rota");
      expect(res.success).toBe(false);
      expect(res.error).toContain("já está atribuída a uma rota");
    });
  });
});
