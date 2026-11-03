import { describe, it, expect } from "vitest";
import {
  getEffectiveOsAnterior,
  cleanObservationOsAnterior,
  setObservationOsAnterior,
} from "@/lib/orderAnterior";

describe("orderAnterior logic", () => {
  it("should extract os_anterior from explicit column", () => {
    expect(getEffectiveOsAnterior({ os_anterior: "69950" })).toBe("69950");
    expect(getEffectiveOsAnterior({ os_anterior: " #69950 " })).toBe("69950");
    expect(getEffectiveOsAnterior({ os_anterior: "OS-12345" })).toBe("12345");
  });

  it("should accept ANY previous OS number without requiring it to exist in Kanban", () => {
    // Pode ser qualquer número livremente digitado pelo operador
    expect(getEffectiveOsAnterior({ os_anterior: "999999" })).toBe("999999");
    expect(getEffectiveOsAnterior({ os_anterior: "1" })).toBe("1");
    expect(getEffectiveOsAnterior({ os_anterior: "45000" })).toBe("45000");
  });

  it("should extract anterior OS from observation fallback tags when column is empty", () => {
    expect(
      getEffectiveOsAnterior({
        os_anterior: null,
        observacao: "[N.º O.S ANTERIOR: 69950] Usar mesma chapa do ano passado",
      })
    ).toBe("69950");

    expect(
      getEffectiveOsAnterior({
        os_anterior: "",
        observacao: "[OS ANTERIOR: 71200] Repetição idêntica",
      })
    ).toBe("71200");

    expect(
      getEffectiveOsAnterior({
        os_anterior: undefined,
        observacao: "[REP: 65432] Mesma faca",
      })
    ).toBe("65432");
  });

  it("should prioritize explicit column over observation fallback", () => {
    expect(
      getEffectiveOsAnterior({
        os_anterior: "69950",
        observacao: "[N.º O.S ANTERIOR: 55555]",
      })
    ).toBe("69950");
  });

  it("should return empty string when no anterior OS exists", () => {
    expect(getEffectiveOsAnterior(null)).toBe("");
    expect(getEffectiveOsAnterior({})).toBe("");
    expect(getEffectiveOsAnterior({ tipo_trabalho: "novo" })).toBe("");
    expect(getEffectiveOsAnterior({ observacao: "Trabalho normal sem tag" })).toBe("");
  });

  it("should clean observation tag cleanly", () => {
    expect(cleanObservationOsAnterior("[N.º O.S ANTERIOR: 69950]")).toBe("");
    expect(
      cleanObservationOsAnterior("[N.º O.S ANTERIOR: 69950] Verificar papel")
    ).toBe("Verificar papel");
    expect(cleanObservationOsAnterior("[REP: 1234] Teste")).toBe("Teste");
    expect(cleanObservationOsAnterior("Observação comum")).toBe("Observação comum");
    expect(cleanObservationOsAnterior(null)).toBe("");
  });

  it("should update observation tag with setObservationOsAnterior", () => {
    expect(setObservationOsAnterior("texto", "69950")).toBe(
      "[N.º O.S ANTERIOR: 69950] texto"
    );
    expect(
      setObservationOsAnterior("[N.º O.S ANTERIOR: 11111] texto antigo", "69950")
    ).toBe("[N.º O.S ANTERIOR: 69950] texto antigo");
    expect(setObservationOsAnterior("[N.º O.S ANTERIOR: 69950] texto", "")).toBe(
      "texto"
    );
  });
});
