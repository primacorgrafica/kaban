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
  getSpecialSupplyBadgeClasses,
  hasSpecialSuppliesForCompras,
  sortAndFilterProcessos,
  isInternalProcessTag,
} from "@/lib/processos";

describe("Suprimentos e Processos Especiais (PANTONE, FACA, CLICHÊ, OUTROS)", () => {
  it("deve conter todas as opções esperadas incluindo OUTROS", () => {
    const ids = SPECIAL_SUPPLIES.map((s) => s.id);
    expect(ids).toContain("PANTONE");
    expect(ids).toContain("FACA");
    expect(ids).toContain("CLICHE");
    expect(ids).toContain("FILME");
    expect(ids).toContain("OUTROS");

    const labels = SPECIAL_SUPPLIES.map((s) => s.label);
    expect(labels).toContain("CLICHÊ");
    expect(labels).toContain("FILME");
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

  it("deve identificar estritamente apenas os suprimentos especiais ativos no card", () => {
    // Cenário 1: Card criado SOMENTE com FACA
    const cardApenasFaca = ["CORTE", "FACA", "HOT"];
    const activeFaca = SPECIAL_SUPPLIES.filter((s) => isSpecialSupplyActive(cardApenasFaca, s.id));
    expect(activeFaca.map((s) => s.id)).toEqual(["FACA"]);
    expect(activeFaca.some((s) => s.id === "CLICHE")).toBe(false);

    // Cenário 2: Card criado SOMENTE com CLICHÊ
    const cardApenasCliche = ["FLEXO", "CLICHE:info:3%20cores"];
    const activeCliche = SPECIAL_SUPPLIES.filter((s) => isSpecialSupplyActive(cardApenasCliche, s.id));
    expect(activeCliche.map((s) => s.id)).toEqual(["CLICHE"]);
    expect(activeCliche.some((s) => s.id === "FACA")).toBe(false);

    // Cenário 3: Card criado com FACA e CLICHÊ
    const cardFacaECliche = ["CORTE", "FACA", "CLICHE"];
    const activeAmbos = SPECIAL_SUPPLIES.filter((s) => isSpecialSupplyActive(cardFacaECliche, s.id));
    expect(activeAmbos.map((s) => s.id)).toEqual(["CLICHE", "FACA"]);

    // Cenário 3b: Card criado com FILME
    const cardComFilme = ["CORTE", "FILME"];
    const activeFilme = SPECIAL_SUPPLIES.filter((s) => isSpecialSupplyActive(cardComFilme, s.id));
    expect(activeFilme.map((s) => s.id)).toEqual(["FILME"]);

    // Cenário 4: Card SEM suprimentos especiais (apenas processos regulares)
    const cardSemSuprimentos = ["DIG", "CORTE", "DOBRA"];
    const activeNenhum = SPECIAL_SUPPLIES.filter((s) => isSpecialSupplyActive(cardSemSemSuprimentos(cardSemSuprimentos), s.id));
    function cardSemSemSuprimentos(procs: string[]) { return procs; }
    expect(activeNenhum).toHaveLength(0);
  });

  it("determina que a O.S. só chega em Compras quando houver habilitado PANTONE ou OUTROS", () => {
    // 1. Apenas Faca -> NÃO vai para Compras
    expect(hasSpecialSuppliesForCompras(["FACA"])).toBe(false);

    // 2. Apenas Clichê -> NÃO vai para Compras
    expect(hasSpecialSuppliesForCompras(["CLICHE"])).toBe(false);

    // 3. Faca e Clichê juntos -> NÃO vai para Compras
    expect(hasSpecialSuppliesForCompras(["FACA", "CLICHE"])).toBe(false);

    // 4. Nenhum suprimento especial -> NÃO vai para Compras
    expect(hasSpecialSuppliesForCompras(["CMYK", "DIG", "CORTE"])).toBe(false);
    expect(hasSpecialSuppliesForCompras([])).toBe(false);
    expect(hasSpecialSuppliesForCompras(null)).toBe(false);

    // 5. Com PANTONE habilitado -> VAI para Compras
    expect(hasSpecialSuppliesForCompras(["PANTONE"])).toBe(true);
    expect(hasSpecialSuppliesForCompras(["PANTONE:info:485%20C"])).toBe(true);
    expect(hasSpecialSuppliesForCompras(["FACA", "PANTONE"])).toBe(true);

    // 6. Com OUTROS habilitado -> VAI para Compras
    expect(hasSpecialSuppliesForCompras(["OUTROS"])).toBe(true);
    expect(hasSpecialSuppliesForCompras(["OUTROS:info:Cola%20Especial"])).toBe(true);
    expect(hasSpecialSuppliesForCompras(["CLICHE", "OUTROS"])).toBe(true);
  });

  it("atribui cores padronizadas às tarjas: todos os suprimentos pendentes em amarelo e enviados em verde esmeralda (sem cor rosa)", () => {
    // Pendentes (todos usam a paleta âmbar/amarela sem rosa)
    const facaPending = getSpecialSupplyBadgeClasses("FACA", false);
    expect(facaPending.badge).toContain("bg-amber-400");
    expect(facaPending.badge).toContain("text-amber-950");

    const clichePending = getSpecialSupplyBadgeClasses("CLICHE", false);
    expect(clichePending.badge).toContain("bg-amber-400");
    expect(clichePending.badge).toContain("text-amber-950");

    const filmePending = getSpecialSupplyBadgeClasses("FILME", false);
    expect(filmePending.badge).toContain("bg-amber-400");
    expect(filmePending.badge).toContain("text-amber-950");

    const pantonePending = getSpecialSupplyBadgeClasses("PANTONE", false);
    expect(pantonePending.badge).toContain("bg-amber-400");
    expect(pantonePending.badge).toContain("text-amber-950");
    expect(pantonePending.badge).not.toContain("bg-pink");

    const outrosPending = getSpecialSupplyBadgeClasses("OUTROS", false);
    expect(outrosPending.badge).toContain("bg-amber-400");
    expect(outrosPending.badge).toContain("text-amber-950");
    expect(outrosPending.badge).not.toContain("bg-pink");

    // Enviados (todos ficam verde esmeralda)
    const facaSent = getSpecialSupplyBadgeClasses("FACA", true);
    expect(facaSent.badge).toContain("bg-emerald-500");

    const pantoneSent = getSpecialSupplyBadgeClasses("PANTONE", true);
    expect(pantoneSent.badge).toContain("bg-emerald-500");
  });
});
