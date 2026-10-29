import { describe, it, expect } from "vitest";
import { CTP_DEPARTMENT, DIGITAL_DEPARTMENT, PRODUCAO_DEPARTMENT, DEPARTMENTS, DEPARTMENT_MAP } from "@/types/production";
import { ACCESS_MODULES, normalizeModules } from "@/pages/UserManagementPage";

describe("CTP & Digital - Novos Menus e Colunas Kanban", () => {
  it("deve conter a configuração do departamento CTP com 3 colunas (ENTRADA, PRODUÇÃO e SAÍDA)", () => {
    expect(CTP_DEPARTMENT).toBeDefined();
    expect(CTP_DEPARTMENT.id).toBe("ctp");
    expect(CTP_DEPARTMENT.label).toBe("CTP");
    expect(CTP_DEPARTMENT.statuses).toHaveLength(3);
    expect(CTP_DEPARTMENT.statuses[0]).toEqual({
      id: "entrada",
      label: "Entrada",
      colorKey: "entrada",
    });
    expect(CTP_DEPARTMENT.statuses[1]).toEqual({
      id: "producao",
      label: "Produção",
      colorKey: "andamento",
    });
    expect(CTP_DEPARTMENT.statuses[2]).toEqual({
      id: "saida",
      label: "Saída",
      colorKey: "concluido",
    });
  });

  it("deve conter a configuração do departamento DIGITAL com 3 colunas (ENTRADA, PRODUÇÃO e SAÍDA)", () => {
    expect(DIGITAL_DEPARTMENT).toBeDefined();
    expect(DIGITAL_DEPARTMENT.id).toBe("digital");
    expect(DIGITAL_DEPARTMENT.label).toBe("Digital");
    expect(DIGITAL_DEPARTMENT.statuses).toHaveLength(3);
    expect(DIGITAL_DEPARTMENT.statuses[0]).toEqual({
      id: "entrada",
      label: "Entrada",
      colorKey: "entrada",
    });
    expect(DIGITAL_DEPARTMENT.statuses[1]).toEqual({
      id: "producao",
      label: "Produção",
      colorKey: "andamento",
    });
    expect(DIGITAL_DEPARTMENT.statuses[2]).toEqual({
      id: "saida",
      label: "Saída",
      colorKey: "concluido",
    });
  });

  it("deve registrar CTP, DIGITAL e PRODUCAO na lista global DEPARTMENTS e DEPARTMENT_MAP", () => {
    expect(DEPARTMENTS.some((d) => d.id === "ctp")).toBe(true);
    expect(DEPARTMENTS.some((d) => d.id === "digital")).toBe(true);
    expect(DEPARTMENTS.some((d) => d.id === "producao")).toBe(true);
    expect(DEPARTMENT_MAP.ctp).toEqual(CTP_DEPARTMENT);
    expect(DEPARTMENT_MAP.digital).toEqual(DIGITAL_DEPARTMENT);
    expect(DEPARTMENT_MAP.producao).toEqual(PRODUCAO_DEPARTMENT);
  });

  it("deve disponibilizar os módulos 'ctp' e 'digital' no gerenciamento de usuários", () => {
    expect(ACCESS_MODULES.some((m) => m.id === "ctp" && m.label === "CTP")).toBe(true);
    expect(ACCESS_MODULES.some((m) => m.id === "digital" && m.label === "Digital")).toBe(true);

    // Permissão de produção legada deve incluir ctp e digital
    const normalized = normalizeModules(["producao"]);
    expect(normalized).toContain("ctp");
    expect(normalized).toContain("digital");
    expect(normalized).toContain("qualidade");
    expect(normalized).toContain("pre_impressao");
  });
});
