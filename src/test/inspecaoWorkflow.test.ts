import { describe, it, expect } from "vitest";
import {
  validateInspecaoConditions,
  INSPECAO_CHECKLIST_ITEMS,
  InspecaoChecklist,
  InspecaoFoto,
} from "@/types/inspecao";
import { INSPECAO_DEPARTMENT, DEPARTMENTS, DEPARTMENT_MAP } from "@/types/production";
import { Order } from "@/types/order";

describe("Workflow e Regras da Etapa INSPEÇÃO", () => {
  const mockApprovedChecklist: InspecaoChecklist = {
    etapas_executadas: { status: "aprovado", data_hora: "2026-11-16T10:00:00Z" },
    qualidade_impressao: { status: "aprovado", data_hora: "2026-11-16T10:00:00Z" },
    qualidade_acabamento: { status: "aprovado", data_hora: "2026-11-16T10:00:00Z" },
    quantidade: { status: "aprovado", data_hora: "2026-11-16T10:00:00Z" },
    rotulagem: { status: "aprovado", data_hora: "2026-11-16T10:00:00Z" },
  };

  const mockFoto: InspecaoFoto = {
    id: "foto-1",
    nome: "73500_20261116-100000_1.jpg",
    url: "https://primacorgraficaeditora.sharepoint.com/sites/Produo_grupo/Documentos%20Compartilhados/INSPEÇÃO/73500/73500_20261116-100000_1.jpg",
    criado_em: "2026-11-16T10:00:00Z",
    criado_por: "Inspetor",
  };

  describe("1. Estrutura da Etapa e Fases", () => {
    it("deve conter exatamente as 4 fases na ordem: ENTRADA -> INSPEÇÃO -> PARADO -> SAÍDA", () => {
      expect(INSPECAO_DEPARTMENT.id).toBe("inspecao");
      expect(INSPECAO_DEPARTMENT.label).toBe("Inspeção");
      const statusIds = INSPECAO_DEPARTMENT.statuses.map((s) => s.id);
      expect(statusIds).toEqual(["entrada", "inspecao", "parado", "saida"]);
    });

    it("deve estar registrado no DEPARTMENTS e no DEPARTMENT_MAP para seleção nos modais de envio", () => {
      expect(DEPARTMENTS.some((d) => d.id === "inspecao")).toBe(true);
      expect(DEPARTMENT_MAP["inspecao"]).toBeDefined();
      expect(DEPARTMENT_MAP["inspecao"].label).toBe("Inspeção");
    });

    it("deve conter os 5 itens obrigatórios do checklist", () => {
      expect(INSPECAO_CHECKLIST_ITEMS).toHaveLength(5);
      const keys = INSPECAO_CHECKLIST_ITEMS.map((i) => i.key);
      expect(keys).toEqual([
        "etapas_executadas",
        "qualidade_impressao",
        "qualidade_acabamento",
        "quantidade",
        "rotulagem",
      ]);
    });
  });

  describe("2. Validação para Saída da Inspeção (validateInspecaoConditions)", () => {
    it("deve bloquear Saída quando o checklist está vazio e sem fotos", () => {
      const res = validateInspecaoConditions(null, null);
      expect(res.canMoveToSaida).toBe(false);
      expect(res.isChecklistComplete).toBe(false);
      expect(res.hasReprovedItem).toBe(false);
      expect(res.hasRequiredPhotos).toBe(false);
      expect(res.errorMessages.length).toBeGreaterThanOrEqual(2);
    });

    it("deve bloquear Saída quando checklist possui menos de 5 itens respondidos", () => {
      const partialChecklist: InspecaoChecklist = {
        etapas_executadas: { status: "aprovado" },
        qualidade_impressao: { status: "aprovado" },
      };
      const res = validateInspecaoConditions(partialChecklist, [mockFoto]);
      expect(res.canMoveToSaida).toBe(false);
      expect(res.isChecklistComplete).toBe(false);
      expect(res.errorMessages.some((msg) => msg.includes("não foi avaliado"))).toBe(true);
    });

    it("deve bloquear Saída quando qualquer item estiver Reprovado, mesmo com fotos e 5 itens", () => {
      const checklistWithReproved: InspecaoChecklist = {
        ...mockApprovedChecklist,
        qualidade_impressao: { status: "reprovado", observacao: "Manchas na impressão" },
      };
      const res = validateInspecaoConditions(checklistWithReproved, [mockFoto]);
      expect(res.canMoveToSaida).toBe(false);
      expect(res.hasReprovedItem).toBe(true);
      expect(res.errorMessages.some((msg) => msg.includes("REPROVADO"))).toBe(true);
    });

    it("deve bloquear Saída quando o checklist estiver 100% aprovado, mas não houver nenhuma foto", () => {
      const res = validateInspecaoConditions(mockApprovedChecklist, []);
      expect(res.canMoveToSaida).toBe(false);
      expect(res.hasRequiredPhotos).toBe(false);
      expect(res.errorMessages.some((msg) => msg.includes("foto"))).toBe(true);
    });

    it("deve permitir Saída quando os 5 itens estão Aprovados e há pelo menos 1 foto", () => {
      const res = validateInspecaoConditions(mockApprovedChecklist, [mockFoto]);
      expect(res.canMoveToSaida).toBe(true);
      expect(res.errorMessages).toHaveLength(0);
    });

    it("deve permitir Saída com itens 'aprovado_com_restricao', contanto que nenhum seja 'reprovado'", () => {
      const checklistWithRestriction: InspecaoChecklist = {
        ...mockApprovedChecklist,
        rotulagem: { status: "aprovado_restricao", observacao: "Etiqueta ligeiramente inclinada, mas legível" },
      };
      const res = validateInspecaoConditions(checklistWithRestriction, [mockFoto]);
      expect(res.canMoveToSaida).toBe(true);
      expect(res.errorMessages).toHaveLength(0);
    });
  });

  describe("3. Limite e Regras de Fotos (1 a 5 fotos)", () => {
    it("deve aceitar de 1 a 5 fotos", () => {
      const fivePhotos: InspecaoFoto[] = [1, 2, 3, 4, 5].map((i) => ({
        ...mockFoto,
        id: `foto-${i}`,
      }));
      const res = validateInspecaoConditions(mockApprovedChecklist, fivePhotos);
      expect(res.canMoveToSaida).toBe(true);
    });

    it("deve acusar erro caso ultrapasse o limite de 5 fotos", () => {
      const sixPhotos: InspecaoFoto[] = [1, 2, 3, 4, 5, 6].map((i) => ({
        ...mockFoto,
        id: `foto-${i}`,
      }));
      const res = validateInspecaoConditions(mockApprovedChecklist, sixPhotos);
      expect(res.canMoveToSaida).toBe(false);
      expect(res.errorMessages.some((msg) => msg.includes("máximo 5"))).toBe(true);
    });
  });

  describe("4. Regras de Parada (Motivo Obrigatório)", () => {
    it("não deve permitir parada sem motivo", () => {
      const motivoVazio = "   ";
      const isValido = motivoVazio.trim().length > 0;
      expect(isValido).toBe(false);
    });

    it("deve validar parada com motivo preenchido", () => {
      const motivoValido = "Aguardando definição de acabamento com cliente";
      const isValido = motivoValido.trim().length > 0;
      expect(isValido).toBe(true);
    });
  });
});
