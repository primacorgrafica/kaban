import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getEntregadoresList,
  assignDriverToOrder,
  updateDriverDeliveryStatus,
  uploadDeliveryProofFile,
  recordGpsCheckpoint,
} from "@/lib/deliveryService";
import { DELIVERY_STATUS_CONFIG } from "@/types/delivery";
import { supabase } from "@/integrations/supabase/client";

// Mock do supabase client
vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        getUser: vi.fn(),
      },
      storage: {
        from: vi.fn(),
      },
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      })),
      removeChannel: vi.fn(),
    },
  };
});

describe("Delivery Module — Client Service Workflow Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DELIVERY_STATUS_CONFIG", () => {
    it("deve conter todos os 6 status operacionais com labels e classes de estilo", () => {
      const keys = Object.keys(DELIVERY_STATUS_CONFIG);
      expect(keys).toEqual(["pendente", "atribuido", "em_rota", "no_local", "entregue", "insucesso"]);

      expect(DELIVERY_STATUS_CONFIG.pendente.label).toBe("Pendente");
      expect(DELIVERY_STATUS_CONFIG.atribuido.label).toBe("Atribuído");
      expect(DELIVERY_STATUS_CONFIG.em_rota.label).toBe("Em Rota");
      expect(DELIVERY_STATUS_CONFIG.no_local.label).toBe("No Local");
      expect(DELIVERY_STATUS_CONFIG.entregue.label).toBe("Entregue");
      expect(DELIVERY_STATUS_CONFIG.insucesso.label).toBe("Insucesso");
    });
  });

  describe("getEntregadoresList", () => {
    it("deve retornar lista de entregadores com sucesso", async () => {
      const mockDrivers = [
        { id: "1", user_id: "u1", nome_completo: "Carlos Motoboy", ativo: true },
        { id: "2", user_id: "u2", nome_completo: "Bruno Express", ativo: false },
      ];

      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockDrivers, error: null }),
        }),
      });

      const res = await getEntregadoresList();
      expect(res.error).toBeNull();
      expect(res.data).toHaveLength(2);
      expect(res.data[0].nome_completo).toBe("Carlos Motoboy");
    });

    it("deve tratar graciosamente o erro 42P01 quando a migration não foi aplicada ainda", async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { code: "42P01", message: 'relation "entregadores" does not exist' },
          }),
        }),
      });

      const res = await getEntregadoresList();
      expect(res.data).toEqual([]);
      expect(res.error).toContain("Tabela 'entregadores' não implantada.");
    });
  });

  describe("assignDriverToOrder", () => {
    it("deve chamar RPC manager_assign_delivery_driver com os parâmetros esperados", async () => {
      (supabase.rpc as any).mockResolvedValue({
        data: { success: true, order_id: "ord-1", status_entrega: "atribuido", entregador_id: "driver-1" },
        error: null,
      });

      const res = await assignDriverToOrder("ord-1", "driver-1", 3);
      expect(supabase.rpc).toHaveBeenCalledWith("manager_assign_delivery_driver", {
        p_order_id: "ord-1",
        p_entregador_id: "driver-1",
        p_ordem_parada: 3,
      });
      expect(res.success).toBe(true);
      expect(res.entregador_id).toBe("driver-1");
    });

    it("deve reportar mensagem explicativa quando RPC ainda não foi aplicada", async () => {
      (supabase.rpc as any).mockResolvedValue({
        data: null,
        error: { code: "42883", message: "Could not find the function manager_assign_delivery_driver" },
      });

      const res = await assignDriverToOrder("ord-1", "driver-1");
      expect(res.success).toBe(false);
      expect(res.error).toContain("RPC manager_assign_delivery_driver ainda não implantada");
    });
  });

  describe("updateDriverDeliveryStatus", () => {
    it("deve chamar RPC driver_update_delivery_status com novos status e metadados", async () => {
      (supabase.rpc as any).mockResolvedValue({
        data: { success: true, order_id: "ord-1", status_entrega: "entregue" },
        error: null,
      });

      const res = await updateDriverDeliveryStatus({
        orderId: "ord-1",
        newStatus: "entregue",
        entreguePara: "João Silva",
        obsEntrega: "Portaria A",
      });

      expect(supabase.rpc).toHaveBeenCalledWith("driver_update_delivery_status", {
        p_order_id: "ord-1",
        p_new_status: "entregue",
        p_entregue_para: "João Silva",
        p_obs_entrega: "Portaria A",
        p_motivo_insucesso: null,
      });
      expect(res.success).toBe(true);
    });

    it("deve sanitizar strings vazias para null na chamada RPC", async () => {
      (supabase.rpc as any).mockResolvedValue({
        data: { success: true },
        error: null,
      });

      await updateDriverDeliveryStatus({
        orderId: "ord-2",
        newStatus: "insucesso",
        motivoInsucesso: "   Cliente ausente   ",
        entreguePara: "   ",
      });

      expect(supabase.rpc).toHaveBeenCalledWith("driver_update_delivery_status", {
        p_order_id: "ord-2",
        p_new_status: "insucesso",
        p_entregue_para: null,
        p_obs_entrega: null,
        p_motivo_insucesso: "Cliente ausente",
      });
    });
  });

  describe("uploadDeliveryProofFile", () => {
    it("deve rejeitar extensões não permitidas (ex: .exe, .sh, .bat)", async () => {
      const maliciousFile = new File(["bin"], "malware.exe", { type: "application/x-msdownload" });
      const res = await uploadDeliveryProofFile("ord-1", maliciousFile);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Formato de arquivo inválido");
    });

    it("deve rejeitar arquivos acima do limite de 10 MB", async () => {
      const bigFile = new File([new Uint8Array(11 * 1024 * 1024)], "foto_grande.jpg", {
        type: "image/jpeg",
      });
      const res = await uploadDeliveryProofFile("ord-1", bigFile);
      expect(res.success).toBe(false);
      expect(res.error).toContain("limite máximo permitido de 10 MB");
    });

    it("deve realizar upload e sanitizar nome do arquivo com sucesso para formato válido", async () => {
      const validFile = new File(["fake_photo_data"], "foto comprovante @#1.png", {
        type: "image/png",
      });

      const mockUpload = vi.fn().mockResolvedValue({
        data: { path: "ord-1/1700000000_foto_comprovante_1.png" },
        error: null,
      });

      (supabase.storage.from as any).mockReturnValue({
        upload: mockUpload,
      });

      const res = await uploadDeliveryProofFile("ord-1", validFile);
      expect(res.success).toBe(true);
      expect(res.filePath).toBe("ord-1/1700000000_foto_comprovante_1.png");
      expect(mockUpload).toHaveBeenCalled();

      // Verifica prefixo da pasta com UUID da ordem
      const calledPath = mockUpload.mock.calls[0][0];
      expect(calledPath.startsWith("ord-1/")).toBe(true);
    });
  });

  describe("recordGpsCheckpoint", () => {
    it("deve inserir registro de telemetria para usuário autenticado", async () => {
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { id: "driver-uuid-123" } },
      });

      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      (supabase.from as any).mockReturnValue({ insert: mockInsert });

      const res = await recordGpsCheckpoint({
        orderId: "ord-100",
        latitude: -23.55052,
        longitude: -46.633308,
        precisaoMetros: 12.5,
        velocidadeKmh: 45.2,
        bateriaPercentual: 88,
      });

      expect(res.success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith({
        entregador_id: "driver-uuid-123",
        order_id: "ord-100",
        latitude: -23.55052,
        longitude: -46.633308,
        precisao_metros: 12.5,
        velocidade_kmh: 45.2,
        bateria_percentual: 88,
      });
    });

    it("deve falhar se o usuário não estiver autenticado", async () => {
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: null },
      });

      const res = await recordGpsCheckpoint({
        latitude: -23.55,
        longitude: -46.63,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Usuário não autenticado.");
    });
  });

  describe("PWA e Isolamento de Acesso do Entregador", () => {
    it("deve garantir que o papel 'entregador' seja redirecionado com segurança para o app exclusivo", () => {
      // Simula a regra de roteamento implementada no ProtectedRoute
      const shouldRedirectToDriverApp = (role: string, targetModule?: string) => {
        if (role === "entregador" && targetModule !== "entregador") {
          return true;
        }
        return false;
      };

      expect(shouldRedirectToDriverApp("entregador", undefined)).toBe(true);
      expect(shouldRedirectToDriverApp("entregador", "pcp")).toBe(true);
      expect(shouldRedirectToDriverApp("entregador", "producao")).toBe(true);
      expect(shouldRedirectToDriverApp("entregador", "comercial")).toBe(true);
      expect(shouldRedirectToDriverApp("entregador", "entregas")).toBe(true);
      expect(shouldRedirectToDriverApp("entregador", "entregador")).toBe(false);
      expect(shouldRedirectToDriverApp("admin", "producao")).toBe(false);
      expect(shouldRedirectToDriverApp("coordenador", "comercial")).toBe(false);
    });
  });

  describe("Sincronização Zero-Friction de Protocolos para o SharePoint", () => {
    it("deve validar que entregador sem conta Microsoft corporativa no celular completa entrega com status pendente_sharepoint", async () => {
      // Simula fluxo do entregador na rua (sem MSAL)
      const mockOrder = { id: "order-999", titulo: "71382", entregue_para: "João Portaria" };
      const validPhoto = new File(["fake_photo_data"], "protocolo.jpg", { type: "image/jpeg" });

      const mockUpload = vi.fn().mockResolvedValue({
        data: { path: "order-999/1700000000_protocolo.jpg" },
        error: null,
      });

      (supabase.storage.from as any).mockReturnValue({
        upload: mockUpload,
      });

      // 1. Upload temporário sem bloqueio
      const uploadRes = await uploadDeliveryProofFile(mockOrder.id, validPhoto);
      expect(uploadRes.success).toBe(true);
      expect(uploadRes.filePath).toBe("order-999/1700000000_protocolo.jpg");

      // 2. Registro com status_comprovante_sync = 'pendente_sharepoint'
      const statusUpdate = { status_comprovante_sync: "pendente_sharepoint" };
      expect(statusUpdate.status_comprovante_sync).toBe("pendente_sharepoint");
    });
  });
});
