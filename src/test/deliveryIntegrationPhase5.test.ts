import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ROTAS_DISPONIVEIS,
  MOTIVOS_PAUSA_CONFIG,
  type RotaId,
  type MotivoPausaRota,
  type DeliveryStatus,
} from "@/types/delivery";
import {
  assignOrderToRoute,
  reorderRouteStops,
  toggleRoutePause,
  toggleDeliveryPriority,
  groupOrdersInStop,
  ungroupOrderFromStop,
  recordGpsCheckpoint,
  uploadDeliveryProofFile,
  updateDriverDeliveryStatus,
} from "@/lib/deliveryService";
import {
  uploadDeliveryProtocolToSharePoint,
  SHAREPOINT_PROTOCOLOS_FOLDER,
} from "@/lib/sharepointService";
import { calculateHaversineDistance, fetchOsrmRoute } from "@/services/osrmService";
import { sanitizeAddressForGeocoding } from "@/services/nominatimService";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/lib/msalClient", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/msalClient");
  return {
    ...actual,
    getSharePointAccessToken: vi.fn().mockResolvedValue("mock_token"),
    getActiveMicrosoftAccount: vi.fn().mockResolvedValue({ username: "expedicao@primacorgrafica.com.br" }),
  };
});

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
      storage: {
        from: vi.fn(),
      },
      functions: {
        invoke: vi.fn(),
      },
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-motoboy-1", email: "motoboy@primacor.com.br" } },
          error: null,
        }),
      },
    },
  };
});

describe("Etapa 5: Integrações e Testes — Módulo de Entregas e Expedição", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Integração SharePoint e Comprovantes de Entrega", () => {
    it("deve rejeitar comprovante com extensão não permitida", async () => {
      const mockFile = new File(["dummy content"], "virus.exe", { type: "application/x-msdownload" });
      const res = await uploadDeliveryProofFile("order-uuid-1", mockFile);

      expect(res.success).toBe(false);
      expect(res.error).toContain("Formato de arquivo inválido");
    });

    it("deve rejeitar arquivo maior que 10 MB", async () => {
      const bigFile = new File([new ArrayBuffer(11 * 1024 * 1024)], "foto_pesada.jpg", {
        type: "image/jpeg",
      });
      const res = await uploadDeliveryProofFile("order-uuid-1", bigFile);

      expect(res.success).toBe(false);
      expect(res.error).toContain("limite máximo permitido de 10 MB");
    });

    it("deve realizar upload com sucesso para o bucket 'comprovantes-entrega' sanitizando o nome", async () => {
      const validFile = new File(["valid-img-bytes"], "protocolo de entrega #73210!.jpg", {
        type: "image/jpeg",
      });

      const mockUpload = vi.fn().mockResolvedValue({
        data: { path: "order-uuid-1/1700000000_protocolo_de_entrega__73210_.jpg" },
        error: null,
      });

      (supabase.storage.from as any).mockReturnValue({
        upload: mockUpload,
      });

      const res = await uploadDeliveryProofFile("order-uuid-1", validFile);

      expect(res.success).toBe(true);
      expect(res.filePath).toContain("order-uuid-1");
      expect(mockUpload).toHaveBeenCalled();
    });

    it("deve suportar upload direto ao SharePoint corporativo via Graph API na pasta PROTOCOLOS ENTREGAS", async () => {
      // Mock fetch global para simular resolução de site e pasta
      const originalFetch = global.fetch;
      const originalXHR = global.XMLHttpRequest;

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.endsWith("/drive")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: "drive-protocolos-id", name: "Documentos Compartilhados" }),
          });
        }
        if (typeof url === "string" && url.includes("/root/children")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                id: "folder-protocolos-id",
                name: SHAREPOINT_PROTOCOLOS_FOLDER,
                folder: {},
                webUrl: "https://primacor.sharepoint.com/protocolos",
                value: [
                  {
                    id: "folder-protocolos-id",
                    name: SHAREPOINT_PROTOCOLOS_FOLDER,
                    folder: {},
                    webUrl: "https://primacor.sharepoint.com/protocolos",
                  },
                ],
              }),
          });
        }
        if (typeof url === "string" && url.includes("/sites/")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: "site-primacor-id", displayName: "Produção Grupo" }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      }) as any;

      // Mock XMLHttpRequest para simular upload PUT do arquivo
      global.XMLHttpRequest = vi.fn().mockImplementation(() => {
        const xhrInstance: any = {
          open: vi.fn(),
          setRequestHeader: vi.fn(),
          send: vi.fn().mockImplementation(() => {
            setTimeout(() => {
              xhrInstance.status = 201;
              xhrInstance.responseText = JSON.stringify({
                id: "item-comprovante-id",
                name: "OS_73210_Protocolo_123456_Joao_Silva.jpg",
                size: 10240,
                webUrl: "https://primacor.sharepoint.com/protocolos/OS_73210.jpg",
              });
              if (xhrInstance.onload) xhrInstance.onload();
            }, 0);
          }),
        };
        return xhrInstance;
      }) as any;

      const mockProof = new File(["jpeg-data"], "comprovante.jpg", { type: "image/jpeg" });
      const spResult = await uploadDeliveryProtocolToSharePoint(
        mockProof,
        "73210",
        "João Silva",
        undefined,
        false
      );

      expect(spResult.success).toBe(true);
      expect(spResult.driveItem?.id).toBe("item-comprovante-id");
      expect(spResult.folderInfo?.folderName).toBe(SHAREPOINT_PROTOCOLOS_FOLDER);

      global.fetch = originalFetch;
      global.XMLHttpRequest = originalXHR;
    });
  });

  describe("2. Telemetria GPS, Rastreamento em Tempo Real e OSRM", () => {
    it("deve registrar coordenadas GPS do entregador com precisão e velocidade", async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      (supabase.from as any).mockReturnValue({ insert: mockInsert });

      const res = await recordGpsCheckpoint({
        orderId: "order-1",
        latitude: -19.9208,
        longitude: -43.9378,
        precisaoMetros: 5.2,
        velocidadeKmh: 35.0,
        bateriaPercentual: 88,
      });

      expect(res.success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith({
        entregador_id: "user-motoboy-1",
        order_id: "order-1",
        latitude: -19.9208,
        longitude: -43.9378,
        precisao_metros: 5.2,
        velocidade_kmh: 35.0,
        bateria_percentual: 88,
      });
    });

    it("deve calcular distância geodésica linear (Haversine) corretamente entre dois pontos", () => {
      // Coordenadas da Primacor BH (-19.9200, -43.9400) para Praça Sete (-19.9191, -43.9386)
      const distKm = calculateHaversineDistance(-19.9200, -43.9400, -19.9191, -43.9386);
      expect(distKm).toBeGreaterThan(0.1);
      expect(distKm).toBeLessThan(0.3);
    });

    it("deve sanitizar endereço de entrega para geocodificação Nominatim focando na Grande BH", () => {
      const raw = "Rua Gonçalves Dias, 1200 - apto 302, Funcionários";
      const cleaned = sanitizeAddressForGeocoding(raw);

      expect(cleaned).toContain("Gonçalves Dias");
      expect(cleaned).toContain("1200");
      expect(cleaned).not.toContain("apto 302");
      expect(cleaned).toContain("Belo Horizonte, MG, Brasil");
    });
  });

  describe("3. Fluxos Operacionais de Ponta a Ponta", () => {
    it("Cenário A: Expedição monta Rota 1 -> Atribui ao Motoboy -> Ordena paradas -> Inicia e conclui", async () => {
      // 1. Atribuição à Rota 1
      const mockIn = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ in: mockIn });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      const assignRes = await assignOrderToRoute(["os-1", "os-2"], "1", "driver-ozeas");
      expect(assignRes.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        rota_numero: "1",
        entregador_id: "driver-ozeas",
        status_entrega: "atribuido",
      });

      // 2. Reordenação sequencial das paradas
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      mockUpdate.mockReturnValue({ eq: mockEq });

      const reorderRes = await reorderRouteStops("1", ["os-2", "os-1"]);
      expect(reorderRes.success).toBe(true);

      // 3. Motoboy inicia rota
      (supabase.rpc as any).mockResolvedValue({
        data: { success: true, new_status: "em_rota" },
        error: null,
      });

      const startRes = await updateDriverDeliveryStatus({
        orderId: "os-2",
        newStatus: "em_rota",
      });
      expect(startRes.success).toBe(true);

      // 4. Motoboy chega no local
      const arriveRes = await updateDriverDeliveryStatus({
        orderId: "os-2",
        newStatus: "no_local",
      });
      expect(arriveRes.success).toBe(true);

      // 5. Motoboy conclui com recebedor e observação
      const finishRes = await updateDriverDeliveryStatus({
        orderId: "os-2",
        newStatus: "entregue",
        entreguePara: "Maria Santos",
        obsEntrega: "Entregue no 3º andar, conferido",
      });
      expect(finishRes.success).toBe(true);
    });

    it("Cenário B: Parada Agrupada (2 O.S. do mesmo cliente) com conclusão simultânea", async () => {
      const mockIn = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ in: mockIn });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      // Agrupa os-10 e os-11
      const groupRes = await groupOrdersInStop(["os-10", "os-11"]);
      expect(groupRes.success).toBe(true);
      expect(groupRes.paradaId).toBeDefined();

      // Desagrupar caso necessário
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      mockUpdate.mockReturnValue({ eq: mockEq });
      const ungroupRes = await ungroupOrderFromStop("os-11");
      expect(ungroupRes.success).toBe(true);
    });

    it("Cenário C: Rota especial RETIRA com confirmação de retirada no balcão", async () => {
      const mockIn = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ in: mockIn });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      // Atribui à rota RETIRA
      const assignRes = await assignOrderToRoute("os-retira-1", "RETIRA");
      expect(assignRes.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({ rota_numero: "RETIRA" });

      // Conclusão no balcão
      (supabase.rpc as any).mockResolvedValue({
        data: { success: true, new_status: "entregue" },
        error: null,
      });

      const finishRetira = await updateDriverDeliveryStatus({
        orderId: "os-retira-1",
        newStatus: "entregue",
        entreguePara: "Carlos Cliente",
        obsEntrega: "[RETIRADA NO BALCÃO] Concluída com sucesso",
      });
      expect(finishRetira.success).toBe(true);
    });

    it("Cenário D: Pausa da Rota com motivo padronizado e retomada", async () => {
      const mockIn = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ in: mockIn });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      // Pausa a rota por sinistro
      const pauseRes = await toggleRoutePause({
        orderIds: ["os-1", "os-2"],
        paused: true,
        motivo: "sinistro",
        obs: "Colisão leve na Av. Cristiano Machado",
      });

      expect(pauseRes.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          rota_pausada: true,
          rota_pausa_motivo: "sinistro",
          rota_pausa_obs: "Colisão leve na Av. Cristiano Machado",
        })
      );

      // Retomada da rota
      const resumeRes = await toggleRoutePause({
        orderIds: ["os-1", "os-2"],
        paused: false,
      });

      expect(resumeRes.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          rota_pausada: false,
          rota_pausa_motivo: null,
          rota_pausa_obs: null,
          rota_pausa_em: null,
        })
      );
    });

    it("Cenário E: Insucesso na entrega com registro da justificativa", async () => {
      (supabase.rpc as any).mockResolvedValue({
        data: { success: true, new_status: "insucesso" },
        error: null,
      });

      const failRes = await updateDriverDeliveryStatus({
        orderId: "os-99",
        newStatus: "insucesso",
        motivoInsucesso: "Cliente ausente / estabelecimento fechado",
      });

      expect(failRes.success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith("driver_update_delivery_status", {
        p_order_id: "os-99",
        p_new_status: "insucesso",
        p_motivo_insucesso: "Cliente ausente / estabelecimento fechado",
        p_entregue_para: null,
        p_obs_entrega: null,
      });
    });

    it("Cenário F: Prioridade alta (Urgente) destacada na entrega", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      const res = await toggleDeliveryPriority("os-urgente-1", true);
      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({ rota_prioridade: true });
    });
  });
});
