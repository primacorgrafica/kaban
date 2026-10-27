import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncOrderToCompras } from "@/lib/comprasSync";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

describe("Sincronização Imediata com Compras (syncOrderToCompras)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("NÃO deve enviar para Compras se a O.S. tiver apenas FACA ou CLICHÊ", async () => {
    const orderFaca = {
      id: "ord-faca-123",
      titulo: "12345",
      cliente: "CLIENTE TESTE",
      processos: ["FACA"],
    };

    const result = await syncOrderToCompras(orderFaca as any);
    expect(result).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("NÃO deve duplicar se a ordem já pertencer ao setor de Compras", async () => {
    const orderCompras = {
      id: "ord-compra-456",
      titulo: "45678",
      setor: "compras",
      processos: ["PANTONE"],
    };

    const result = await syncOrderToCompras(orderCompras as any);
    expect(result).toBe("ord-compra-456");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("DEVE criar card em Compras imediatamente para O.S. criada com PANTONE (ex: #757575 em ENTRADA)", async () => {
    const order757575 = {
      id: "ord-757575",
      titulo: "757575",
      cliente: "MIRA INCORPORAÇÕES",
      descricao: "1500 - ADESIVIOS",
      status: "fila_de_entrada",
      urgente: true,
      processos: ["PANTONE:info:485C", "FACA"],
    };

    // Mock: verificação de existência retorna vazio
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    // Mock: insert cria novo registro
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [{ id: "compra-child-757575" }],
        error: null,
      }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: selectMock,
          insert: insertMock,
        };
      }
      return {};
    });

    const result = await syncOrderToCompras(order757575 as any, { userId: "user-leonardo" });
    expect(result).toBe("compra-child-757575");
    expect(insertMock).toHaveBeenCalled();

    const insertArg = insertMock.mock.calls[0][0];
    expect(insertArg.setor).toBe("compras");
    expect(insertArg.parent_order_id).toBe("ord-757575");
    expect(insertArg.titulo).toBe("757575");
    expect(insertArg.cliente).toBe("MIRA INCORPORAÇÕES");
    expect(insertArg.posicao).toBe(0); // urgente -> 0
    expect(insertArg.processos).toContain("PANTONE:info:485C");
  });

  it("DEVE atualizar processos do card existente em Compras sem criar duplicata se já existir", async () => {
    const orderExisting = {
      id: "ord-existente-1",
      titulo: "88888",
      cliente: "CLIENTE EXISTENTE",
      processos: ["OUTROS:info:Cola%20Quente"],
    };

    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ id: "compra-existente-child", processos: ["OUTROS"] }],
        error: null,
      }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: selectMock,
          update: updateMock,
        };
      }
      return {};
    });

    const result = await syncOrderToCompras(orderExisting as any, {
      customProcessos: ["OUTROS:info:Cola%20Quente"],
    });

    expect(result).toBe("compra-existente-child");
    expect(updateMock).toHaveBeenCalledWith({
      processos: ["OUTROS:info:Cola%20Quente"],
    });
  });
});
