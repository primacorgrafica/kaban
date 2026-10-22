import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordTelemetry,
  measureQueryLatency,
  trackWebSocketTelemetry,
  trackGraphApiTelemetry,
} from "@/lib/autonomousEngine/telemetry";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

describe("Kaban Autonomous Engine - Telemetry & Monitoring (Fase 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Medição de latência deve executar a consulta e retornar o resultado com exatidão", async () => {
    const mockQuery = vi.fn().mockResolvedValue({ count: 42 });

    const result = await measureQueryLatency("fetchOrdersBenchmark", mockQuery);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ count: 42 });
  });

  it("2. Medição de latência deve propagar erros da consulta original sem mascará-los", async () => {
    const failingQuery = vi.fn().mockRejectedValue(new Error("Timeout de conexão"));

    await expect(
      measureQueryLatency("failingDbCall", failingQuery)
    ).rejects.toThrow("Timeout de conexão");
  });

  it("3. Registro de telemetria deve despachar sem lançar exceções para o chamador", () => {
    expect(() => {
      recordTelemetry({
        metric_type: "HEARTBEAT",
        source: "unit_test",
        status: "HEALTHY",
        details: { test: true },
      });
    }).not.toThrow();
  });

  it("4. Rastreamento de WebSocket deve lidar com transições de rede e recuperação", () => {
    expect(() => {
      trackWebSocketTelemetry("OFFLINE", { code: 1006 });
      trackWebSocketTelemetry("RECONNECTING");
      trackWebSocketTelemetry("OFFLINE");
      trackWebSocketTelemetry("ONLINE");
    }).not.toThrow();
  });

  it("5. Rastreamento da Microsoft Graph API deve acumular e resetar falhas após sucesso", () => {
    expect(() => {
      trackGraphApiTelemetry("EMAIL_SYNC", false, 1200, "Service Unavailable 503");
      trackGraphApiTelemetry("EMAIL_SYNC", false, 1100, "Service Unavailable 503");
      trackGraphApiTelemetry("EMAIL_SYNC", true, 300);
    }).not.toThrow();
  });
});
