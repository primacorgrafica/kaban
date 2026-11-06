import { describe, it, expect } from "vitest";
import { getOrderRevision, setObservationRevision, cleanObservationRevision, isReturnToPreparation } from "@/lib/orderRevision";

describe("orderRevision logic", () => {
  it("should extract revision from explicit revisao field", () => {
    expect(getOrderRevision({ revisao: 2 })).toBe(2);
    expect(getOrderRevision({ revisao: 5 })).toBe(5);
    expect(getOrderRevision({ revisao: 1 })).toBe(1);
    expect(getOrderRevision({ revisao: 0 })).toBe(0);
  });

  it("should fallback to observation tags if revisao is not set or treat legacy records", () => {
    expect(getOrderRevision({ observacao: "[REV1] cliente solicitou alteracao" })).toBe(1);
    expect(getOrderRevision({ observacao: "[REV2] cliente solicitou alteracao" })).toBe(2);
    expect(getOrderRevision({ observacao: "[REV:3] ajustar sangria" })).toBe(3);
    expect(getOrderRevision({ observacao: "sem revisao alguma" })).toBe(0);
    expect(getOrderRevision(null)).toBe(0);
    expect(getOrderRevision({})).toBe(0);

    // Proteção de compatibilidade com banco legado onde DEFAULT era 1 antes de qualquer revisão
    expect(getOrderRevision({ revisao: 1, observacao: "Ordem original sem tag" })).toBe(0);
    expect(getOrderRevision({ revisao: 1, observacao: null })).toBe(0);
    expect(getOrderRevision({ revisao: 1, observacao: "[REV1] Primeira revisão confirmada" })).toBe(1);
  });

  it("should clean observation tag from text", () => {
    expect(cleanObservationRevision("[REV1]")).toBe("");
    expect(cleanObservationRevision("[REV1] Ajuste")).toBe("Ajuste");
    expect(cleanObservationRevision("[REV2]")).toBe("");
    expect(cleanObservationRevision("[REV2] Ajuste")).toBe("Ajuste");
    expect(cleanObservationRevision("[REV:3] Ajuste")).toBe("Ajuste");
    expect(cleanObservationRevision("Observação sem tag")).toBe("Observação sem tag");
    expect(cleanObservationRevision(null)).toBe("");
  });

  it("should correctly update observation tags", () => {
    expect(setObservationRevision("teste", 1)).toBe("[REV1] teste");
    expect(setObservationRevision("teste", 2)).toBe("[REV2] teste");
    expect(setObservationRevision("[REV2] teste anterior", 3)).toBe("[REV3] teste anterior");
    expect(setObservationRevision("[REV3] teste", 0)).toBe("teste");
    expect(setObservationRevision("", 1)).toBe("[REV1]");
    expect(setObservationRevision("", 2)).toBe("[REV2]");
    expect(setObservationRevision("teste", 0)).toBe("teste");
  });

  it("should detect return to preparation correctly", () => {
    expect(isReturnToPreparation("aguardando_aprovacao", "preparando_arquivo")).toBe(true);
    expect(isReturnToPreparation("aguardando_prova", "preparando_arquivo")).toBe(true);
    expect(isReturnToPreparation("arquivo_liberado", "preparando_arquivo")).toBe(true);
    expect(isReturnToPreparation("aguardando_novo_arquivo", "preparando_arquivo")).toBe(true);

    // Initial forward moves or same-column should NOT be returns
    expect(isReturnToPreparation("fila_de_entrada", "preparando_arquivo")).toBe(false);
    expect(isReturnToPreparation("preparando_arquivo", "preparando_arquivo")).toBe(false);
    expect(isReturnToPreparation("preparando_arquivo", "aguardando_aprovacao")).toBe(false);
  });

  it("should preserve revision when user unchecks 'applyRevision' during return to preparation", () => {
    // Cenário relatado pelo usuário: O.S. sem revisão (0) em Paralisado voltando para Preparação
    const currentOrder = { id: "73503", status: "paralisado" as const, revisao: 0, observacao: null };
    const currentRev = getOrderRevision(currentOrder);
    const nextRev = currentRev + 1;

    // Caso 1: Usuário DESMARCA a opção de virar REV (applyRevision = false)
    const applyRevisionFalse = false;
    const targetRevUnchecked = isReturnToPreparation(currentOrder.status, "preparando_arquivo")
      ? (applyRevisionFalse ? nextRev : currentRev)
      : undefined;

    expect(targetRevUnchecked).toBe(0);
    // Não altera observação
    const obsUnchecked = targetRevUnchecked !== currentRev
      ? setObservationRevision(currentOrder.observacao, targetRevUnchecked)
      : currentOrder.observacao;
    expect(obsUnchecked).toBe(null);

    // Caso 2: Usuário MANTÉM marcado a opção de virar REV (applyRevision = true)
    const applyRevisionTrue = true;
    const targetRevChecked = isReturnToPreparation(currentOrder.status, "preparando_arquivo")
      ? (applyRevisionTrue ? nextRev : currentRev)
      : undefined;

    expect(targetRevChecked).toBe(1);
    const obsChecked = targetRevChecked !== currentRev
      ? setObservationRevision(currentOrder.observacao, targetRevChecked)
      : currentOrder.observacao;
    expect(obsChecked).toBe("[REV1]");
  });
});
