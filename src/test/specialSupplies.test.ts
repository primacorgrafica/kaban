import { describe, it, expect } from "vitest";
import {
  SPECIAL_SUPPLIES,
  isSpecialSupplyActive,
  isSpecialSupplySent,
  toggleSpecialSupplyActive,
  toggleSpecialSupplySent,
  getSpecialSupplyDetails,
  getSpecialSupplyCustomText,
  setSpecialSupplyCustomText,
  getSpecialSupplyDisplayLabel,
  sortAndFilterProcessos,
  isInternalProcessTag,
} from "@/lib/processos";

describe("Suprimentos e Processos Especiais (PANTONE, FACA, CLICHÊ, OUTROS)", () => {
  it("deve conter todas as opções esperadas incluindo OUTROS", () => {
    const ids = SPECIAL_SUPPLIES.map((s) => s.id);
    expect(ids).toContain("PANTONE");
    expect(ids).toContain("FACA");
    expect(ids).toContain("CLICHE");
    expect(ids).toContain("OUTROS");

    const labels = SPECIAL_SUPPLIES.map((s) => s.label);
    expect(labels).toContain("CLICHÊ");
  });

  it("deve ativar e desativar PANTONE e OUTROS via toggleSpecialSupplyActive", () => {
    let processos: string[] = ["CORTE", "DOBRA"];
    
    // Ativa PANTONE
    processos = toggleSpecialSupplyActive(processos, "PANTONE");
    expect(isSpecialSupplyActive(processos, "PANTONE")).toBe(true);

    // Ativa OUTROS
    processos = toggleSpecialSupplyActive(processos, "OUTROS");
    expect(isSpecialSupplyActive(processos, "OUTROS")).toBe(true);

    // Desativa PANTONE
    processos = toggleSpecialSupplyActive(processos, "PANTONE");
    expect(isSpecialSupplyActive(processos, "PANTONE")).toBe(false);
    expect(isSpecialSupplyActive(processos, "OUTROS")).toBe(true);
  });

  it("deve armazenar e recuperar o número do PANTONE", () => {
    let processos: string[] = ["PANTONE"];
    processos = setSpecialSupplyCustomText(processos, "PANTONE", "485 C, Reflex Blue");
    
    expect(isSpecialSupplyActive(processos, "PANTONE")).toBe(true);
    expect(getSpecialSupplyCustomText(processos, "PANTONE")).toBe("485 C, Reflex Blue");

    const details = getSpecialSupplyDetails(processos, "PANTONE");
    expect(details.customText).toBe("485 C, Reflex Blue");
    expect(details.displayLabel).toBe("PANTONE (485 C, Reflex Blue)");
  });

  it("deve armazenar e recuperar a descrição de OUTROS", () => {
    let processos: string[] = ["OUTROS"];
    processos = setSpecialSupplyCustomText(processos, "OUTROS", "Verniz UV Localizado com relevo");
    
    expect(isSpecialSupplyActive(processos, "OUTROS")).toBe(true);
    expect(getSpecialSupplyCustomText(processos, "OUTROS")).toBe("Verniz UV Localizado com relevo");

    const details = getSpecialSupplyDetails(processos, "OUTROS");
    expect(details.customText).toBe("Verniz UV Localizado com relevo");
    expect(details.displayLabel).toBe("OUTROS: Verniz UV Localizado...");
  });

  it("deve preservar o texto personalizado ao alternar status de envio (toggleSpecialSupplySent)", () => {
    let processos: string[] = ["PANTONE"];
    processos = setSpecialSupplyCustomText(processos, "PANTONE", "Pantone 021 C");

    // Marca como enviado
    processos = toggleSpecialSupplySent(processos, "PANTONE", "Operador Carlos");
    expect(isSpecialSupplySent(processos, "PANTONE")).toBe(true);
    expect(getSpecialSupplyCustomText(processos, "PANTONE")).toBe("Pantone 021 C");
    
    const details = getSpecialSupplyDetails(processos, "PANTONE");
    expect(details.sent).toBe(true);
    expect(details.operator).toBe("Operador Carlos");
    expect(details.customText).toBe("Pantone 021 C");
    expect(details.displayLabel).toBe("PANTONE (Pantone 021 C)");

    // Desmarca envio (volta para pendente)
    processos = toggleSpecialSupplySent(processos, "PANTONE");
    expect(isSpecialSupplySent(processos, "PANTONE")).toBe(false);
    expect(getSpecialSupplyCustomText(processos, "PANTONE")).toBe("Pantone 021 C");
  });

  it("deve formatar rótulos compactos e longos corretamente", () => {
    expect(getSpecialSupplyDisplayLabel("PANTONE", "485 C")).toBe("PANTONE (485 C)");
    expect(getSpecialSupplyDisplayLabel("OUTROS", "Hot Stamping Dourado")).toBe("OUTROS: Hot Stamping Dourado");
    expect(getSpecialSupplyDisplayLabel("FACA", "")).toBe("FACA");
    expect(getSpecialSupplyDisplayLabel("CLICHE", "")).toBe("CLICHÊ");
  });

  it("deve filtrar tags de compras e dados de quem comprou (COMPRADO:...) impedindo exibição no card", () => {
    const rawProcessos = [
      "DIG",
      "PLO",
      "COMPRADO:1792599338602:Leonardo",
      "COMPRADO",
      "COMPRA:ok",
      "PANTONE:info:7256",
      "FACA:enviado:11:53",
      "CMYK",
      "Promocional",
      "HOT",
    ];

    expect(isInternalProcessTag("COMPRADO:1792599338602:Leonardo")).toBe(true);
    expect(isInternalProcessTag("COMPRA:ok")).toBe(true);
    expect(isInternalProcessTag("COMPRADO")).toBe(true);
    expect(isInternalProcessTag("DIG")).toBe(false);
    expect(isInternalProcessTag("HOT")).toBe(false);

    const filtered = sortAndFilterProcessos(rawProcessos);
    expect(filtered).not.toContain("COMPRADO:1792599338602:Leonardo");
    expect(filtered).not.toContain("COMPRADO");
    expect(filtered).not.toContain("COMPRA:ok");
    expect(filtered).not.toContain("PANTONE:info:7256");
    expect(filtered).toContain("DIG");
    expect(filtered).toContain("PLO");
    expect(filtered).toContain("HOT");
  });
});
