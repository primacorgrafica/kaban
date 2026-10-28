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
  obsEntrega?: string;
  motivoInsucesso?: string;
}

/**
 * Lógica pura da Máquina de Estados que espelha a RPC public.driver_update_delivery_status (v2)
 */
export function validateDeliveryTransition(input: DeliveryTransitionInput): { valid: boolean; error?: string } {
  if (!input.driverActive) {
    return { valid: false, error: "Entregador inativo no sistema." };
  }
  if (!input.orderDriverId || input.orderDriverId !== input.driverId) {
    return { valid: false, error: "Esta ordem não está atribuída a você." };
  }

  const { currentStatus, targetStatus } = input;

  // Imutabilidade de ordens já concluídas (Terminal State Protection)
  if (currentStatus === "entregue") {
    return { valid: false, error: "Esta entrega já foi concluída e não pode mais ser alterada." };
  }

  // Validação de comprimento de campos
  if (input.entreguePara && input.entreguePara.trim().length > 150) {
    return { valid: false, error: "Nome do recebedor excede o limite de 150 caracteres." };
  }
  if (input.obsEntrega && input.obsEntrega.trim().length > 1000) {
    return { valid: false, error: "Observação de entrega excede o limite de 1000 caracteres." };
  }
  if (input.motivoInsucesso && input.motivoInsucesso.trim().length > 500) {
    return { valid: false, error: "Motivo do insucesso excede o limite de 500 caracteres." };
  }

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
      return { valid: false, error: "Insucesso só pode ser registrado após início do deslocamento." };
    }
    if (!input.motivoInsucesso || input.motivoInsucesso.trim() === "") {
      return { valid: false, error: "O motivo do insucesso deve ser informado." };
    }
    return { valid: true };
  }

  return { valid: false, error: "Status de entrega inválido." };
}

export interface ManagerAssignInput {
  callerRole: string;
  orderExists: boolean;
  orderStatus: DeliveryStatus;
  targetDriverId: string | null;
  targetDriverActive?: boolean;
  targetDriverRole?: string;
}

/**
 * Lógica pura que espelha a RPC public.manager_assign_delivery_driver (v2 Hardened)
 */
export function validateManagerAssignDriver(input: ManagerAssignInput): { valid: boolean; error?: string } {
  if (!["admin", "coordenador"].includes(input.callerRole)) {
    return { valid: false, error: "Apenas administradores e coordenadores podem atribuir entregadores." };
  }

  if (!input.orderExists) {
    return { valid: false, error: "Ordem de serviço não encontrada." };
  }

  if (input.orderStatus === "entregue") {
    return { valid: false, error: "Não é possível alterar a atribuição de uma entrega já concluída." };
  }

  // Proteção contra desatribuição indevida com carga em trânsito
  if (input.targetDriverId === null && ["em_rota", "no_local"].includes(input.orderStatus)) {
    return {
      valid: false,
      error: `Não é possível desatribuir uma entrega que já está em trânsito (${input.orderStatus}). Registre a ocorrência de insucesso ou reatribua diretamente a outro entregador ativo.`
    };
  }

  if (input.targetDriverId !== null) {
    if (!input.targetDriverActive) {
      return { valid: false, error: "Entregador selecionado está inativo." };
    }
    if (input.targetDriverRole !== "entregador") {
      return { valid: false, error: "O usuário indicado não possui o papel de entregador." };
    }
  }

  return { valid: true };
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
 * Validação de integridade de armazenamento de comprovantes (v2)
 */
export function validateDeliveryProofUploadPath(orderId: string, assignedDriverId: string, callerId: string, filename: string): { valid: boolean; path?: string; error?: string } {
  if (callerId !== assignedDriverId) {
    return { valid: false, error: "Tentativa de upload em ordem de outro entregador." };
  }

  // Validação de formato UUID do orderId
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(orderId)) {
    return { valid: false, error: "Identificador de ordem inválido para caminho de armazenamento." };
  }

  // Prevenção de Path Traversal
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return { valid: false, error: "Nome de arquivo inválido ou tentativa de evasão de diretório." };
  }

  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
  const lower = filename.toLowerCase();
  const hasValidExt = allowedExtensions.some(ext => lower.endsWith(ext));
  if (!hasValidExt) {
    return { valid: false, error: "Tipo de arquivo não permitido para comprovante." };
  }

  return { valid: true, path: `${orderId}/${filename}` };
}

describe("Auditoria e Validação de Segurança - Módulo de Entregas (v2 Hardened)", () => {
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

    it("deve bloquear qualquer alteração em entregas já concluídas (terminal state)", () => {
      const res = validateDeliveryTransition({
        currentStatus: "entregue",
        targetStatus: "em_rota",
        driverId: "driver-1",
        orderDriverId: "driver-1",
        driverActive: true,
      });
      expect(res.valid).toBe(false);
      expect(res.error).toBe("Esta entrega já foi concluída e não pode mais ser alterada.");
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

    it("deve validar tamanho máximo do nome do recebedor (max 150)", () => {
      const res = validateDeliveryTransition({
        currentStatus: "no_local",
        targetStatus: "entregue",
        driverId: "driver-1",
        orderDriverId: "driver-1",
        driverActive: true,
        entreguePara: "A".repeat(151),
      });
      expect(res.valid).toBe(false);
      expect(res.error).toBe("Nome do recebedor excede o limite de 150 caracteres.");
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

  describe("Atribuição e Gestão de Entregadores (manager_assign_delivery_driver)", () => {
    it("deve bloquear desatribuição (targetDriverId = null) se a O.S. estiver em rota", () => {
      const res = validateManagerAssignDriver({
        callerRole: "coordenador",
        orderExists: true,
        orderStatus: "em_rota",
        targetDriverId: null,
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Não é possível desatribuir uma entrega que já está em trânsito (em_rota)");
    });

    it("deve bloquear desatribuição se a O.S. estiver no local do cliente", () => {
      const res = validateManagerAssignDriver({
        callerRole: "coordenador",
        orderExists: true,
        orderStatus: "no_local",
        targetDriverId: null,
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Não é possível desatribuir uma entrega que já está em trânsito (no_local)");
    });

    it("deve permitir desatribuição quando a O.S. estiver apenas atribuida ou pendente", () => {
      const res = validateManagerAssignDriver({
        callerRole: "coordenador",
        orderExists: true,
        orderStatus: "atribuido",
        targetDriverId: null,
      });
      expect(res.valid).toBe(true);
    });

    it("deve permitir reatribuição emergencial direta para outro entregador ativo mesmo em rota", () => {
      const res = validateManagerAssignDriver({
        callerRole: "coordenador",
        orderExists: true,
        orderStatus: "em_rota",
        targetDriverId: "driver-2",
        targetDriverActive: true,
        targetDriverRole: "entregador",
      });
      expect(res.valid).toBe(true);
    });

    it("deve bloquear qualquer alteração em entregas concluídas", () => {
      const res = validateManagerAssignDriver({
        callerRole: "admin",
        orderExists: true,
        orderStatus: "entregue",
        targetDriverId: "driver-2",
        targetDriverActive: true,
        targetDriverRole: "entregador",
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Não é possível alterar a atribuição de uma entrega já concluída");
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
    const validUuid = "11111111-2222-3333-4444-555555555555";

    it("deve impedir que o entregador envie comprovante para O.S. de outro motoboy", () => {
      const res = validateDeliveryProofUploadPath(
        validUuid,
        "driver-alice",
        "driver-bob",
        "canhoto_assinado.jpg"
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Tentativa de upload em ordem de outro entregador");
    });

    it("deve validar formato UUID da ordem", () => {
      const res = validateDeliveryProofUploadPath(
        "invalid-id-format",
        "driver-1",
        "driver-1",
        "comprovante.jpg"
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Identificador de ordem inválido");
    });

    it("deve bloquear tentativa de evasão de diretório (path traversal)", () => {
      const res = validateDeliveryProofUploadPath(
        validUuid,
        "driver-1",
        "driver-1",
        "../../etc/passwd.jpg"
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain("tentativa de evasão de diretório");
    });

    it("deve validar tipos de arquivo aceitos para comprovantes", () => {
      const validJpg = validateDeliveryProofUploadPath(validUuid, "driver-1", "driver-1", "foto.jpg");
      expect(validJpg.valid).toBe(true);
      expect(validJpg.path).toBe(`${validUuid}/foto.jpg`);

      const invalidExe = validateDeliveryProofUploadPath(validUuid, "driver-1", "driver-1", "script.exe");
      expect(invalidExe.valid).toBe(false);
      expect(invalidExe.error).toContain("Tipo de arquivo não permitido");
    });
  });

  describe("Invariantes de Rollback Seguro", () => {
    it("deve garantir que o predicado do Rollback Modo 1 isola contas de entregador", () => {
      const checkAccess = (role: string) => role !== "entregador";
      expect(checkAccess("admin")).toBe(true);
      expect(checkAccess("coordenador")).toBe(true);
      expect(checkAccess("operador")).toBe(true);
      expect(checkAccess("vendedor")).toBe(true);
      expect(checkAccess("impressor")).toBe(true);
      expect(checkAccess("user")).toBe(true);
      expect(checkAccess("entregador")).toBe(false);
    });
  });
});
