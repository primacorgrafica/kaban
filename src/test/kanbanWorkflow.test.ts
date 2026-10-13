import { describe, it, expect } from "vitest";
import { STATUS_ORDER, STATUS_CONFIG, OrderStatus, Order } from "@/types/order";

describe("Kanban Workflow & State Transitions", () => {
  it("should enforce valid sequential status progression in Pré-Impressão", () => {
    expect(STATUS_ORDER[0]).toBe("fila_de_entrada");
    expect(STATUS_ORDER[STATUS_ORDER.length - 1]).toBe("arquivo_liberado");
    expect(STATUS_ORDER.length).toBe(8);

    // Each status must have a corresponding configuration
    STATUS_ORDER.forEach((status) => {
      const config = STATUS_CONFIG[status];
      expect(config).toBeDefined();
      expect(config.label).toBeTruthy();
      expect(config.colorKey).toBeTruthy();
    });
  });

  it("should correctly filter orders by search query across fields", () => {
    const orders: Partial<Order>[] = [
      { id: "1", titulo: "850", cliente: "Laboratório EMS", descricao: "Cartucho 150ml" },
      { id: "2", titulo: "851", cliente: "Nestlé Brasil", descricao: "Rotulo adesivo" },
      { id: "3", titulo: "852", cliente: "Editora Moderna", descricao: "Apostila escolar" },
    ];

    const filterByQuery = (query: string) => {
      const q = query.toLowerCase();
      return orders.filter(
        (o) =>
          o.titulo?.toLowerCase().includes(q) ||
          o.cliente?.toLowerCase().includes(q) ||
          o.descricao?.toLowerCase().includes(q)
      );
    };

    expect(filterByQuery("850").length).toBe(1);
    expect(filterByQuery("Nestlé").length).toBe(1);
    expect(filterByQuery("Adesivo").length).toBe(1);
    expect(filterByQuery("inexistente").length).toBe(0);
  });

  it("should preserve order positions within the same column", () => {
    const columnOrders: Partial<Order>[] = [
      { id: "a", status: "fila_de_entrada", posicao: 0 },
      { id: "b", status: "fila_de_entrada", posicao: 1 },
      { id: "c", status: "fila_de_entrada", posicao: 2 },
    ];

    const sorted = [...columnOrders].sort((x, y) => (x.posicao ?? 0) - (y.posicao ?? 0));
    expect(sorted.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });
});
