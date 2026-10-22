import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchActiveOrdersOptimized,
  fetchOrdersMetricsSummary,
  searchOrdersOptimized,
  fetchEmailEventsRollingWindow,
  KANBAN_ESSENTIAL_COLUMNS,
} from "@/lib/autonomousEngine/queryOptimizer";

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockOr = vi.fn();
const mockLimit = vi.fn();
const mockGte = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: (...args: any[]) => {
        mockSelect(table, ...args);
        return {
          eq: (...eqArgs: any[]) => {
            mockEq(...eqArgs);
            return {
              order: (...orderArgs: any[]) => {
                mockOrder(...orderArgs);
                return Promise.resolve({
                  data: [
                    { id: "os-1", titulo: "1001", cliente: "Cliente Teste", arquivado: false, posicao: 0 },
                  ],
                  error: null,
                });
              },
            };
          },
          or: (...orArgs: any[]) => {
            mockOr(...orArgs);
            return {
              order: () => ({
                limit: (...limitArgs: any[]) => {
                  mockLimit(...limitArgs);
                  return Promise.resolve({
                    data: [{ id: "os-1", titulo: "1001", cliente: "Cliente Teste", arquivado: false }],
                    error: null,
                  });
                },
              }),
            };
          },
          gte: (...gteArgs: any[]) => {
            mockGte(...gteArgs);
            return {
              order: () => Promise.resolve({ data: [{ id: "evt-1", message_id: "msg-1" }], error: null }),
            };
          },
        };
      },
    })),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

describe("Kaban Autonomous Engine - Query Optimizer (Fase 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. fetchActiveOrdersOptimized deve filtrar estritamente arquivado = false com colunas seletivas", async () => {
    const orders = await fetchActiveOrdersOptimized();

    expect(mockSelect).toHaveBeenCalledWith("orders", KANBAN_ESSENTIAL_COLUMNS);
    expect(mockEq).toHaveBeenCalledWith("arquivado", false);
    expect(mockOrder).toHaveBeenCalledWith("posicao", { ascending: true });
    expect(orders.length).toBe(1);
    expect(orders[0].id).toBe("os-1");
  });

  it("2. fetchOrdersMetricsSummary deve consumir a RPC consolidada quando disponível", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        active_total: 15,
        archived_total: 500,
        awaiting_approval: 3,
        liberados_today: 7,
        preparando_arquivo: 5,
        generated_at: "2026-10-22T00:00:00Z",
      },
      error: null,
    });

    const summary = await fetchOrdersMetricsSummary();

    expect(mockRpc).toHaveBeenCalledWith("get_orders_metrics_summary");
    expect(summary.active_total).toBe(15);
    expect(summary.archived_total).toBe(500);
  });

  it("3. searchOrdersOptimized deve retornar vazio para buscas em branco sem chamar o banco", async () => {
    const results = await searchOrdersOptimized("   ");
    expect(results).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("4. searchOrdersOptimized deve filtrar por título ou cliente usando projeção otimizada", async () => {
    const results = await searchOrdersOptimized("Primacor", 25);

    expect(mockSelect).toHaveBeenCalledWith("orders", KANBAN_ESSENTIAL_COLUMNS);
    expect(mockOr).toHaveBeenCalledWith("titulo.ilike.%Primacor%,cliente.ilike.%Primacor%");
    expect(mockLimit).toHaveBeenCalledWith(25);
    expect(results.length).toBe(1);
  });

  it("5. fetchEmailEventsRollingWindow deve restringir a busca pela data de corte (janela de 30 dias)", async () => {
    const events = await fetchEmailEventsRollingWindow(30);

    expect(mockSelect).toHaveBeenCalledWith(
      "order_email_events",
      "id, message_id, conversation_id, order_id, os_number, subject, body_preview, email_datetime, direction"
    );
    expect(mockGte).toHaveBeenCalled();
    expect(events.length).toBe(1);
  });
});
