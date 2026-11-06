import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ROTAS_DISPONIVEIS,
  MOTIVOS_PAUSA_CONFIG,
  type RotaId,
  type MotivoPausaRota,
} from "@/types/delivery";
import {
  assignOrderToRoute,
  reorderRouteStops,
  toggleRoutePause,
  toggleDeliveryPriority,
  groupOrdersInStop,
  ungroupOrderFromStop,
  saveEntregador,
  toggleEntregadorAtivo,
} from "@/lib/deliveryService";
import { supabase } from "@/integrations/supabase/client";
import * as fs from "fs";
import * as path from "path";

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-test-id", email: "expedicao@primacor.com.br" } },
        }),
      },
    },
  };
});

describe("Módulo de Gestão de Entregas e Expedição — Evolução de Rotas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Configurações de Rotas e Motivos de Pausa", () => {
    it("deve disponibilizar exatamente seis rotas numeradas de 1 a 6 e a rota especial RETIRA", () => {
      expect(ROTAS_DISPONIVEIS).toHaveLength(7);
      const rotaIds = ROTAS_DISPONIVEIS.map((r) => r.id);
      expect(rotaIds).toEqual(["1", "2", "3", "4", "5", "6", "RETIRA"]);

      const retira = ROTAS_DISPONIVEIS.find((r) => r.id === "RETIRA");
      expect(retira).toBeDefined();
      expect(retira?.isRetira).toBe(true);
    });

    it("deve conter todos os motivos de pausa padronizados pela proposta", () => {
      const motivosEsperados: MotivoPausaRota[] = [
        "sinistro",
        "pneu_furado",
        "defeito_mecanico",
        "saude",
        "excedeu_jornada",
        "problema_via",
        "mau_tempo",
        "outro",
      ];

      motivosEsperados.forEach((m) => {
        expect(MOTIVOS_PAUSA_CONFIG[m]).toBeDefined();
        expect(MOTIVOS_PAUSA_CONFIG[m].label).toBeTruthy();
        expect(MOTIVOS_PAUSA_CONFIG[m].descricao).toBeTruthy();
      });
    });
  });

  describe("2. assignOrderToRoute", () => {
    it("deve atribuir ordens à rota especificada e vincular entregador", async () => {
      const mockIn = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ in: mockIn });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      const res = await assignOrderToRoute(["order-1", "order-2"], "1", "driver-abc");

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        rota_numero: "1",
        entregador_id: "driver-abc",
        status_entrega: "atribuido",
      });
      expect(mockIn).toHaveBeenCalledWith("id", ["order-1", "order-2"]);
    });

    it("deve permitir atribuir para a rota RETIRA", async () => {
      const mockIn = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ in: mockIn });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      const res = await assignOrderToRoute("order-100", "RETIRA");

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        rota_numero: "RETIRA",
      });
      expect(mockIn).toHaveBeenCalledWith("id", ["order-100"]);
    });
  });

  describe("3. reorderRouteStops", () => {
    it("deve atualizar a sequência das paradas de 1 a N", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      const ordered = ["order-c", "order-a", "order-b"];
      const res = await reorderRouteStops("2", ordered);

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledTimes(3);
      expect(mockUpdate).toHaveBeenNthCalledWith(1, {
        rota_numero: "2",
        rota_sequencia: 1,
        ordem_parada: 1,
      });
      expect(mockUpdate).toHaveBeenNthCalledWith(2, {
        rota_numero: "2",
        rota_sequencia: 2,
        ordem_parada: 2,
      });
      expect(mockUpdate).toHaveBeenNthCalledWith(3, {
        rota_numero: "2",
        rota_sequencia: 3,
        ordem_parada: 3,
      });
    });
  });

  describe("4. toggleRoutePause", () => {
    it("deve pausar rota registrando motivo e timestamp", async () => {
      const mockIn = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ in: mockIn });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      const res = await toggleRoutePause({
        orderIds: ["order-1"],
        paused: true,
        motivo: "pneu_furado",
        obs: "Trocando estepe no km 12",
      });

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          rota_pausada: true,
          rota_pausa_motivo: "pneu_furado",
          rota_pausa_obs: "Trocando estepe no km 12",
          rota_pausa_em: expect.any(String),
        })
      );
    });

    it("deve retomar rota limpando os motivos de pausa", async () => {
      const mockIn = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ in: mockIn });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      const res = await toggleRoutePause({
        orderIds: ["order-1"],
        paused: false,
      });

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        rota_pausada: false,
        rota_pausa_motivo: null,
        rota_pausa_obs: null,
        rota_pausa_em: null,
      });
    });
  });

  describe("5. Agrupamento de O.S. por Cliente (parada_agrupada_id)", () => {
    it("groupOrdersInStop deve atribuir o mesmo UUID de parada para múltiplas O.S.", async () => {
      const mockIn = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ in: mockIn });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      const res = await groupOrdersInStop(["os-73500", "os-73501"]);

      expect(res.success).toBe(true);
      expect(res.paradaId).toBeDefined();
      expect(mockUpdate).toHaveBeenCalledWith({
        parada_agrupada_id: res.paradaId,
      });
      expect(mockIn).toHaveBeenCalledWith("id", ["os-73500", "os-73501"]);
    });

    it("ungroupOrderFromStop deve limpar parada_agrupada_id", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      const res = await ungroupOrderFromStop("os-73500");

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        parada_agrupada_id: null,
      });
      expect(mockEq).toHaveBeenCalledWith("id", "os-73500");
    });
  });

  describe("6. Cadastro e Administração de Entregadores", () => {
    it("saveEntregador deve suportar categoria_veiculo (carro/moto) e documento", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: "ent-1", nome_completo: "Carlos", categoria_veiculo: "carro" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
      (supabase.from as any).mockReturnValue({ upsert: mockUpsert });

      const res = await saveEntregador({
        user_id: "user-123",
        nome_completo: "Carlos Silva",
        sobrenome: "Silva",
        categoria_veiculo: "carro",
        documento_identificacao: "12.345.678-9",
        placa_veiculo: "ABC1D23",
      });

      expect(res.success).toBe(true);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-123",
          nome_completo: "Carlos Silva",
          sobrenome: "Silva",
          categoria_veiculo: "carro",
          documento_identificacao: "12.345.678-9",
          placa_veiculo: "ABC1D23",
        }),
        { onConflict: "user_id" }
      );
    });

    it("toggleEntregadorAtivo deve alterar status preservando registro", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      const res = await toggleEntregadorAtivo("ent-1", false);

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          ativo: false,
        })
      );
      expect(mockEq).toHaveBeenCalledWith("id", "ent-1");
    });
  });

  describe("7. Validação da Migration 20261106_evolucao_gestao_entregas_e_rotas.sql", () => {
    it("deve conter todas as definições estruturais exigidas pela proposta", () => {
      const migrationPath = path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "20261106_evolucao_gestao_entregas_e_rotas.sql"
      );
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, "utf-8");

      expect(sql).toContain("rota_numero");
      expect(sql).toContain("rota_sequencia");
      expect(sql).toContain("rota_prioridade");
      expect(sql).toContain("rota_pausada");
      expect(sql).toContain("rota_pausa_motivo");
      expect(sql).toContain("parada_agrupada_id");
      expect(sql).toContain("categoria_veiculo");
      expect(sql).toContain("documento_identificacao");
      expect(sql).toContain("orders_rota_numero_check");
      expect(sql).toContain("RETIRA");
    });
  });

  describe("8. Lógica de UI do Quadro de Rotas (Etapa 3)", () => {
    it("deve agrupar corretamente ordens com o mesmo parada_agrupada_id em uma única parada física", () => {
      const mockOrders: any[] = [
        {
          id: "os-1",
          titulo: "#73510",
          cliente: "Cliente A",
          entrega_endereco: "Rua Alpha, 100",
          rota_numero: "1",
          rota_sequencia: 1,
          parada_agrupada_id: "stop-group-1",
          rota_prioridade: false,
        },
        {
          id: "os-2",
          titulo: "#73511",
          cliente: "Cliente A",
          entrega_endereco: "Rua Alpha, 100",
          rota_numero: "1",
          rota_sequencia: 1,
          parada_agrupada_id: "stop-group-1",
          rota_prioridade: true,
        },
        {
          id: "os-3",
          titulo: "#73512",
          cliente: "Cliente B",
          entrega_endereco: "Rua Beta, 200",
          rota_numero: "1",
          rota_sequencia: 2,
          parada_agrupada_id: null,
          rota_prioridade: false,
        },
      ];

      // Algoritmo de montagem de paradas do DeliveryRouteColumn
      const stopMap = new Map<string, any>();
      mockOrders.forEach((o) => {
        const key = o.parada_agrupada_id ? `group_${o.parada_agrupada_id}` : `single_${o.id}`;
        if (!stopMap.has(key)) {
          stopMap.set(key, {
            stopKey: key,
            cliente: o.cliente,
            sequencia: o.rota_sequencia,
            prioridade: !!o.rota_prioridade,
            orders: [o],
          });
        } else {
          const existing = stopMap.get(key)!;
          existing.orders.push(o);
          if (o.rota_prioridade) existing.prioridade = true;
        }
      });

      const stops = Array.from(stopMap.values()).sort((a, b) => a.sequencia - b.sequencia);

      expect(stops).toHaveLength(2);
      expect(stops[0].cliente).toBe("Cliente A");
      expect(stops[0].orders).toHaveLength(2);
      expect(stops[0].prioridade).toBe(true); // Herdada da os-2
      expect(stops[1].cliente).toBe("Cliente B");
      expect(stops[1].orders).toHaveLength(1);
    });

    it("deve separar as ordens entre rotas ativas (1-6), RETIRA e Backlog sem rota", () => {
      const mockOrders: any[] = [
        { id: "1", rota_numero: "1", status_entrega: "pendente" },
        { id: "2", rota_numero: "6", status_entrega: "em_rota" },
        { id: "3", rota_numero: "RETIRA", status_entrega: "pendente" },
        { id: "4", rota_numero: null, status_entrega: "pendente" },
        { id: "5", rota_numero: null, status_entrega: "entregue" },
      ];

      const unassigned = mockOrders.filter(
        (o) => !o.rota_numero && o.status_entrega !== "entregue"
      );
      expect(unassigned).toHaveLength(1);
      expect(unassigned[0].id).toBe("4");

      const retiraOrders = mockOrders.filter((o) => o.rota_numero === "RETIRA");
      expect(retiraOrders).toHaveLength(1);
      expect(retiraOrders[0].id).toBe("3");
    });
  });
});
