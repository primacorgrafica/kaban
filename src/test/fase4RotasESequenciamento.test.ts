import { describe, it, expect } from "vitest";
import {
  ROTAS_DISPONIVEIS,
  MOTIVOS_PAUSA_CONFIG,
  canAlterRouteStop,
} from "@/types/delivery";

describe("FASE 4 — ROTAS, SEQUENCIAMENTO, PAUSA E BLOQUEIO PÓS-CHEGADA", () => {
  it("deve disponibilizar exatamente as Rotas 1 a 6 e RETIRA", () => {
    const ids = ROTAS_DISPONIVEIS.map((r) => r.id);
    expect(ids).toEqual(["1", "2", "3", "4", "5", "6", "RETIRA"]);
  });

  it("deve possuir motivos de pausa estruturados em MOTIVOS_PAUSA_CONFIG", () => {
    expect(Object.keys(MOTIVOS_PAUSA_CONFIG).length).toBeGreaterThanOrEqual(5);
    expect(MOTIVOS_PAUSA_CONFIG.sinistro.label).toBe("Sinistro / Acidente");
    expect(MOTIVOS_PAUSA_CONFIG.defeito_mecanico.label).toBe("Defeito Mecânico");
  });

  it("deve permitir alteração de rota/sequência antes do entregador chegar ao local", () => {
    expect(canAlterRouteStop(null)).toBe(true);
    expect(canAlterRouteStop("pendente")).toBe(true);
    expect(canAlterRouteStop("atribuido")).toBe(true);
    expect(canAlterRouteStop("em_rota")).toBe(true);
  });

  it("deve BLOQUEAR alteração de rota/sequência quando entregador chegou ao local ('no_local') ou finalizou ('entregue')", () => {
    expect(canAlterRouteStop("no_local")).toBe(false);
    expect(canAlterRouteStop("entregue")).toBe(false);
  });
});
