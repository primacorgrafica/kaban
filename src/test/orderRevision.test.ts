import { describe, it, expect } from "vitest";
import { getOrderRevision, setObservationRevision, cleanObservationRevision, isReturnToPreparation } from "@/lib/orderRevision";

describe("orderRevision logic", () => {
  it("should extract revision from explicit revisao field", () => {
    expect(getOrderRevision({ revisao: 2 })).toBe(2);
    expect(getOrderRevision({ revisao: 5 })).toBe(5);
    expect(getOrderRevision({ revisao: 1 })).toBe(1);
  });

  it("should fallback to observation tags if revisao is not set", () => {
    expect(getOrderRevision({ observacao: "[REV2] cliente solicitou alteracao" })).toBe(2);
    expect(getOrderRevision({ observacao: "[REV:3] ajustar sangria" })).toBe(3);
    expect(getOrderRevision({ observacao: "sem revisao alguma" })).toBe(1);
    expect(getOrderRevision(null)).toBe(1);
  });

  it("should clean observation tag from text", () => {
    expect(cleanObservationRevision("[REV2]")).toBe("");
    expect(cleanObservationRevision("[REV2] Ajuste")).toBe("Ajuste");
    expect(cleanObservationRevision("[REV:3] Ajuste")).toBe("Ajuste");
    expect(cleanObservationRevision("Observação sem tag")).toBe("Observação sem tag");
    expect(cleanObservationRevision(null)).toBe("");
  });

  it("should correctly update observation tags", () => {
    expect(setObservationRevision("teste", 2)).toBe("[REV2] teste");
    expect(setObservationRevision("[REV2] teste anterior", 3)).toBe("[REV3] teste anterior");
    expect(setObservationRevision("[REV3] teste", 1)).toBe("teste");
    expect(setObservationRevision("", 2)).toBe("[REV2]");
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
});
