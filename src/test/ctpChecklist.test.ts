import { describe, it, expect } from "vitest";
import {
  CTP_CHECKLIST_ITEMS,
  getCtpChecklistStatus,
  isCtpChecklistComplete,
  CtpChecklist,
} from "@/types/ctp";

describe("CTP Checklist de Conferência (13 itens)", () => {
  it("deve conter exatamente os 13 itens da tabela de conferência do CTP", () => {
    expect(CTP_CHECKLIST_ITEMS).toHaveLength(13);
    expect(CTP_CHECKLIST_ITEMS[0].numero).toBe("01");
    expect(CTP_CHECKLIST_ITEMS[0].descricao).toBe(
      "A montagem corresponde à OS e à versão final aprovada do trabalho."
    );
    expect(CTP_CHECKLIST_ITEMS[12].numero).toBe("13");
    expect(CTP_CHECKLIST_ITEMS[12].descricao).toBe(
      "A quantidade e a identificação das formas e chapas correspondem à OS."
    );
  });

  it("deve identificar checklist vazio como incompleto (0/13)", () => {
    const status = getCtpChecklistStatus(null);
    expect(status.total).toBe(13);
    expect(status.checkedCount).toBe(0);
    expect(status.complete).toBe(false);
    expect(status.missingItems).toHaveLength(13);
    expect(isCtpChecklistComplete(null)).toBe(false);
    expect(isCtpChecklistComplete({})).toBe(false);
  });

  it("deve identificar checklist parcial (12/13) como incompleto e listar item faltante", () => {
    const partial: CtpChecklist = {};
    for (let i = 1; i <= 12; i++) {
      const id = String(i).padStart(2, "0");
      partial[id] = { checked: true, checked_at: new Date().toISOString() };
    }
    const status = getCtpChecklistStatus(partial);
    expect(status.checkedCount).toBe(12);
    expect(status.complete).toBe(false);
    expect(status.missingItems).toHaveLength(1);
    expect(status.missingItems[0].numero).toBe("13");
    expect(isCtpChecklistComplete(partial)).toBe(false);
  });

  it("deve identificar checklist completo (13/13) como liberado", () => {
    const complete: CtpChecklist = {};
    for (let i = 1; i <= 13; i++) {
      const id = String(i).padStart(2, "0");
      complete[id] = { checked: true, checked_at: new Date().toISOString() };
    }
    const status = getCtpChecklistStatus(complete);
    expect(status.checkedCount).toBe(13);
    expect(status.complete).toBe(true);
    expect(status.missingItems).toHaveLength(0);
    expect(isCtpChecklistComplete(complete)).toBe(true);
  });
});
