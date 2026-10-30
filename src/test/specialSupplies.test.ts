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
  extractComprasStatusFromProcessos,
  setComprasStatusInProcessos,
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

  it("deve permitir espaços e texto com espaços no final durante a digitação de OUTROS e PANTONE", () => {
    let processos: string[] = ["OUTROS"];
    // Digitando "Verniz " com espaço no final
    processos = setSpecialSupplyCustomText(processos, "OUTROS", "Verniz ");
    expect(getSpecialSupplyCustomText(processos, "OUTROS")).toBe("Verniz ");

    // Digitando mais texto "Verniz UV "
    processos = setSpecialSupplyCustomText(processos, "OUTROS", "Verniz UV ");
    expect(getSpecialSupplyCustomText(processos, "OUTROS")).toBe("Verniz UV ");

    // Testando com PANTONE
    processos = ["PANTONE"];
    processos = setSpecialSupplyCustomText(processos, "PANTONE", "485 ");
    expect(getSpecialSupplyCustomText(processos, "PANTONE")).toBe("485 ");
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

  it("deve alternar o ciclo de 3 estados para CLICHÊ, FACA e FILME: Magenta (chegam) -> Amarelo (enviou) -> Verde (chegou na produção)", () => {
    let procs = ["FACA", "CORTE"];
    
    // 1. Chegam: Pendente (Magenta)
    let details = getSpecialSupplyDetails(procs, "FACA");
    expect(details.operationalState).toBe("pendente");
    expect(details.statusColor).toBe("magenta");
    expect(details.statusLabel).toBe("Pendente");

    // 2. Pré-impressão marca que enviou: Enviado (Amarelo)
    procs = toggleSpecialSupplySent(procs, "FACA", "Operador Pré");
    details = getSpecialSupplyDetails(procs, "FACA");
    expect(details.operationalState).toBe("enviado");
    expect(details.statusColor).toBe("amarelo");
    expect(details.statusLabel).toBe("Enviado");
    expect(details.operator).toBe("Operador Pré");

    // 3. Produção avisa que chegou: Chegou/Recebido (Verde)
    procs = toggleSpecialSupplySent(procs, "FACA", "Operador Produção");
    details = getSpecialSupplyDetails(procs, "FACA");
    expect(details.operationalState).toBe("recebido");
    expect(details.statusColor).toBe("verde");
    expect(details.statusLabel).toBe("Chegou");
    expect(details.operator).toBe("Operador Produção");

    // 4. Redefine para pendente (Magenta)
    procs = toggleSpecialSupplySent(procs, "FACA");
    details = getSpecialSupplyDetails(procs, "FACA");
    expect(details.operationalState).toBe("pendente");
    expect(details.statusColor).toBe("magenta");
    expect(details.statusLabel).toBe("Pendente");
  });

  it("atribui cores e status de acordo com as regras de negócio: Clichê/Faca/Filme (Magenta/Amarelo/Verde) e Pantone/Outros (Magenta/Amarelo/Verde via Compras)", () => {
    // 1. CLICHÊ, FACA e FILME (Mecanismo Operacional da Pré-Impressão e Produção)
    // Chegam = Magenta (Pendente)
    const facaPending = getSpecialSupplyBadgeClasses("FACA", false);
    expect(facaPending.statusColor).toBe("magenta");
    expect(facaPending.badge).toContain("bg-[#d946ef]");
    expect(facaPending.label).toBe("Pendente");

    const clichePending = getSpecialSupplyBadgeClasses("CLICHE", false);
    expect(clichePending.statusColor).toBe("magenta");
    expect(clichePending.badge).toContain("bg-[#d946ef]");
    expect(clichePending.label).toBe("Pendente");

    const filmePending = getSpecialSupplyBadgeClasses("FILME", false);
    expect(filmePending.statusColor).toBe("magenta");
    expect(filmePending.badge).toContain("bg-[#d946ef]");
    expect(filmePending.label).toBe("Pendente");

    // Enviado = Amarelo
    const facaSent = getSpecialSupplyBadgeClasses("FACA", false, null, "enviado");
    expect(facaSent.statusColor).toBe("amarelo");
    expect(facaSent.badge).toContain("bg-amber-400");
    expect(facaSent.label).toBe("Enviado");

    const clicheSent = getSpecialSupplyBadgeClasses("CLICHE", false, null, "enviado");
    expect(clicheSent.statusColor).toBe("amarelo");
    expect(clicheSent.badge).toContain("bg-amber-400");

    const filmeSent = getSpecialSupplyBadgeClasses("FILME", false, null, "enviado");
    expect(filmeSent.statusColor).toBe("amarelo");
    expect(filmeSent.badge).toContain("bg-amber-400");

    // Chegou / Recebido na Produção = Verde
    const facaReceived = getSpecialSupplyBadgeClasses("FACA", false, null, "recebido");
    expect(facaReceived.statusColor).toBe("verde");
    expect(facaReceived.badge).toContain("bg-emerald-500");
    expect(facaReceived.label).toBe("Chegou");

    const clicheReceived = getSpecialSupplyBadgeClasses("CLICHE", false, null, "recebido");
    expect(clicheReceived.statusColor).toBe("verde");
    expect(clicheReceived.badge).toContain("bg-emerald-500");

    const filmeReceived = getSpecialSupplyBadgeClasses("FILME", false, null, "recebido");
    expect(filmeReceived.statusColor).toBe("verde");
    expect(filmeReceived.badge).toContain("bg-emerald-500");

    // 2. PANTONE e OUTROS (Acompanhamento Automático do Fluxo de Compras)
    // Fase Entrada ou Cotação = MAGENTA
    const pantoneEntrada = getSpecialSupplyBadgeClasses("PANTONE", false, "entrada");
    expect(pantoneEntrada.statusColor).toBe("magenta");
    expect(pantoneEntrada.badge).toContain("bg-[#d946ef]");
    expect(pantoneEntrada.label).toBe("Entrada");

    const pantoneCotacao = getSpecialSupplyBadgeClasses("PANTONE", false, "cotacao");
    expect(pantoneCotacao.statusColor).toBe("magenta");
    expect(pantoneCotacao.badge).toContain("bg-[#d946ef]");
    expect(pantoneCotacao.label).toBe("Cotação");

    const outrosCotacao = getSpecialSupplyBadgeClasses("OUTROS", false, "cotacao");
    expect(outrosCotacao.statusColor).toBe("magenta");
    expect(outrosCotacao.badge).toContain("bg-[#d946ef]");

    // Fase Pedido = AMARELO
    const pantonePedido = getSpecialSupplyBadgeClasses("PANTONE", false, "pedido");
    expect(pantonePedido.statusColor).toBe("amarelo");
    expect(pantonePedido.badge).toContain("bg-amber-400");
    expect(pantonePedido.label).toBe("Pedido");

    const outrosPedido = getSpecialSupplyBadgeClasses("OUTROS", false, "pedido");
    expect(outrosPedido.statusColor).toBe("amarelo");
    expect(outrosPedido.badge).toContain("bg-amber-400");
    expect(outrosPedido.label).toBe("Pedido");

    // Lançamento GE ou Saída = VERDE
    const pantoneGE = getSpecialSupplyBadgeClasses("PANTONE", false, "lancamento_ge");
    expect(pantoneGE.statusColor).toBe("verde");
    expect(pantoneGE.badge).toContain("bg-emerald-500");
    expect(pantoneGE.label).toBe("Lançamento GE");

    const pantoneSaida = getSpecialSupplyBadgeClasses("PANTONE", false, "saida");
    expect(pantoneSaida.statusColor).toBe("verde");
    expect(pantoneSaida.badge).toContain("bg-emerald-500");
    expect(pantoneSaida.label).toBe("Saída");

    const outrosSaida = getSpecialSupplyBadgeClasses("OUTROS", false, "saida");
    expect(outrosSaida.statusColor).toBe("verde");
    expect(outrosSaida.badge).toContain("bg-emerald-500");

    // Se marcado como enviado/comprado individualmente = VERDE
    const pantoneComprado = getSpecialSupplyBadgeClasses("PANTONE", true);
    expect(pantoneComprado.statusColor).toBe("verde");
    expect(pantoneComprado.badge).toContain("bg-emerald-500");
  });

  it("deve extrair e atualizar status de compras nos processos com precisão", () => {
    let procs = ["PANTONE", "CORTE"];
    expect(extractComprasStatusFromProcessos(procs)).toBeNull();

    procs = setComprasStatusInProcessos(procs, "cotacao");
    expect(extractComprasStatusFromProcessos(procs)).toBe("cotacao");

    procs = setComprasStatusInProcessos(procs, "pedido");
    expect(extractComprasStatusFromProcessos(procs)).toBe("pedido");

    procs = setComprasStatusInProcessos(procs, "lancamento_ge");
    expect(extractComprasStatusFromProcessos(procs)).toBe("lancamento_ge");

    const details = getSpecialSupplyDetails(procs, "PANTONE");
    expect(details.comprasStatus).toBe("lancamento_ge");
    expect(details.statusColor).toBe("verde");
    expect(details.sent).toBe(true);
  });
});
