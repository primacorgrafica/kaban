import { describe, it, expect } from "vitest";

// Tipagem de status de entrega planejada
export type DeliveryStatus = "pendente" | "atribuido" | "em_rota" | "no_local" | "entregue" | "insucesso";

export interface DeliveryTransitionInput {
  currentStatus: DeliveryStatus;
  targetStatus: DeliveryStatus;
  driverId: string;
  orderDriverId: string | null;
  driverActive: boolean;
  entreguePara?: string;
  motivoInsucesso?: string;
}

/**
 * Lógica pura da Máquina de Estados que espelha a RPC public.driver_update_delivery_status
 */
export function validateDeliveryTransition(input: DeliveryTransitionInput): { valid: boolean; error?: string } {
  if (!input.driverActive) {
    return { valid: false, error: "Entregador inativo no sistema." };
  }
  if (!input.orderDriverId || input.orderDriverId !== input.driverId) {
    return { valid: false, error: "Esta ordem não está atribuída a você." };
  }

  const { currentStatus, targetStatus } = input;

  if (targetStatus === "em_rota") {
    if (!["atribuido", "pendente", "insucesso"].includes(currentStatus)) {
      return { valid: false, error: "Não é possível iniciar rota a partir do status atual." };
    }
    return { valid: true };
  }

  if (targetStatus === "no_local") {
    if (currentStatus !== "em_rota") {
      return { valid: false, error: "A ordem deve estar em rota para marcar chegada no local." };
    }
    return { valid: true };
  }

  if (targetStatus === "entregue") {
    if (!["no_local", "em_rota"].includes(currentStatus)) {
      return { valid: false, error: "A entrega deve estar no local ou em rota para ser concluída." };
    }
    if (!input.entreguePara || input.entreguePara.trim() === "") {
      return { valid: false, error: "O nome de quem recebeu a entrega é obrigatório." };
    }
    return { valid: true };
  }

  if (targetStatus === "insucesso") {
    if (!["em_rota", "no_local"].includes(currentStatus)) {
      return { valid: false, error: "Insucesso só pode ser registrado durante a rota." };
    }
    if (!input.motivoInsucesso || input.motivoInsucesso.trim() === "") {
      return { valid: false, error: "O motivo do insucesso deve ser informado." };
    }
    return { valid: true };
  }

  return { valid: false, error: "Status de entrega inválido." };
}

/**
 * Validação de rotas permitidas por perfil
 */
export function canAccessModule(role: string, mod: string): boolean {
  if (role === "admin") return true;
  if (role === "entregador") {
    return mod === "entregador";
  }
  if (role === "coordenador") {
    return ["comercial", "pcp", "pre_impressao", "ctp", "digital", "qualidade", "producao", "expedicao", "entregas", "dashboard"].includes(mod);
  }
  if (role === "vendedor") {
    return ["comercial", "utilidades"].includes(mod);
  }
  if (role === "operador" || role === "impressor") {
    return ["pre_impressao", "ctp", "digital", "qualidade", "producao"].includes(mod);
  }
  return false;
}

/**
 * Validação de integridade de armazenamento de comprovantes
 */
export function validateDeliveryProofUploadPath(orderId: string, assignedDriverId: string, callerId: string, filename: string): { valid: boolean; path?: string; error?: string } {
  if (callerId !== assignedDriverId) {
    return { valid: false, error: "Tentativa de upload em ordem de outro entregador." };
  }
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
  const lower = filename.toLowerCase();
  const hasValidExt = allowedExtensions.some(ext => lower.endsWith(ext));
  if (!hasValidExt) {
    return { valid: false, error: "Tipo de arquivo não permitido para comprovante." };
  }
  return { valid: true, path: `${orderId}/${filename}` };
}

describe("Auditoria e Validação de Segurança - Módulo de Entregas", () => {
  describe("Máquina de Estados Logística (driver_update_delivery_status)", () => {
    it("deve rejeitar transições se o entregador estiver inativo", () => {
      const res = validateDeliveryTransition({
        currentStatus: "atribuido",
        targetStatus: "em_rota",
        driverId: "driver-1",
        orderDriverId: "driver-1",
        driverActive: false,
      });
      expect(res.valid).toBe(false);
      expect(res.error).toBe("Entregador inativo no sistema.");
    });

    it("deve rejeitar transições em O.S. que pertence a outro motoboy", () => {
      const res = validateDeliveryTransition({
        currentStatus: "atribuido",
        targetStatus: "em_rota",
        driverId: "driver-1",
        orderDriverId: "driver-2",
        driverActive: true,
      });
      expect(res.valid).toBe(false);
      expect(res.error).toBe("Esta ordem não está atribuída a você.");
    });

    it("deve permitir fluxo completo e legítimo de entrega", () => {
      // 1. Iniciar rota
      const r1 = validateDeliveryTransition({
        currentStatus: "atribuido",
        targetStatus: "em_rota",
        driverId: "driver-1",
        orderDriverId: "driver-1",
        driverActive: true,
      });
      expect(r1.valid).toBe(true);

      // 2. Chegada no local
      const r2 = validateDeliveryTransition({
        currentStatus: "em_rota",
        targetStatus: "no_local",
        driverId: "driver-1",
        orderDriverId: "driver-1",
        driverActive: true,
      });
      expect(r2.valid).toBe(true);

      // 3. Conclusão da entrega com recebedor
      const r3 = validateDeliveryTransition({
        currentStatus: "no_local",
        targetStatus: "entregue",
        driverId: "driver-1",
        orderDriverId: "driver-1",
        driverActive: true,
        entreguePara: "Recepção - Sra. Ana",
      });
      expect(r3.valid).toBe(true);
    });

    it("deve exigir o nome de quem recebeu na conclusão da entrega", () => {
      const res = validateDeliveryTransition({
        currentStatus: "no_local",
        targetStatus: "entregue",
        driverId: "driver-1",
        orderDriverId: "driver-1",
        driverActive: true,
        entreguePara: "   ",
      });
      expect(res.valid).toBe(false);
      expect(res.error).toBe("O nome de quem recebeu a entrega é obrigatório.");
    });

    it("deve exigir o motivo em caso de insucesso na entrega", () => {
      const res = validateDeliveryTransition({
        currentStatus: "em_rota",
        targetStatus: "insucesso",
        driverId: "driver-1",
        orderDriverId: "driver-1",
        driverActive: true,
        motivoInsucesso: "",
      });
      expect(res.valid).toBe(false);
      expect(res.error).toBe("O motivo do insucesso deve ser informado.");
    });

    it("deve bloquear saltos ilícitos de status (ex: atribuido direto para entregue)", () => {
      const res = validateDeliveryTransition({
        currentStatus: "atribuido",
        targetStatus: "entregue",
        driverId: "driver-1",
        orderDriverId: "driver-1",
        driverActive: true,
        entreguePara: "Portaria",
      });
      expect(res.valid).toBe(false);
    });
  });

  describe("Isolamento de Módulos e Autorização por Papel", () => {
    it("entregador deve acessar estritamente o módulo 'entregador'", () => {
      expect(canAccessModule("entregador", "entregador")).toBe(true);
      expect(canAccessModule("entregador", "pcp")).toBe(false);
      expect(canAccessModule("entregador", "producao")).toBe(false);
      expect(canAccessModule("entregador", "comercial")).toBe(false);
      expect(canAccessModule("entregador", "expedicao")).toBe(false);
      expect(canAccessModule("entregador", "usuarios")).toBe(false);
    });

    it("administrador e coordenador mantêm acesso aos seus respectivos módulos", () => {
      expect(canAccessModule("admin", "pcp")).toBe(true);
      expect(canAccessModule("admin", "usuarios")).toBe(true);
      expect(canAccessModule("coordenador", "entregas")).toBe(true);
      expect(canAccessModule("coordenador", "producao")).toBe(true);
    });

    it("operador de produção não acessa módulo de entregador", () => {
      expect(canAccessModule("operador", "entregador")).toBe(false);
    });
  });

  describe("Segurança de Comprovantes de Entrega", () => {
    it("deve impedir que o entregador envie comprovante para O.S. de outro motoboy", () => {
      const res = validateDeliveryProofUploadPath(
        "order-123",
        "driver-alice",
        "driver-bob",
        "canhoto_assinado.jpg"
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Tentativa de upload em ordem de outro entregador");
    });

    it("deve validar tipos de arquivo aceitos para comprovantes", () => {
      const validJpg = validateDeliveryProofUploadPath("order-123", "driver-1", "driver-1", "foto.jpg");
      expect(validJpg.valid).toBe(true);
      expect(validJpg.path).toBe("order-123/foto.jpg");

      const invalidExe = validateDeliveryProofUploadPath("order-123", "driver-1", "driver-1", "script.exe");
      expect(invalidExe.valid).toBe(false);
      expect(invalidExe.error).toContain("Tipo de arquivo não permitido");
    });
  });
});
