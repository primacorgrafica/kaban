import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  fetchVendedores,
  clearVendedoresCache,
  sanitizeVendedorNome,
  isRealVendedor,
  DEFAULT_VENDEDORES,
} from "@/lib/vendedores";
import { supabase } from "@/integrations/supabase/client";

describe("Sincronização de Perfis Reais de Vendedores (Primacor Kaban)", () => {
  beforeEach(() => {
    clearVendedoresCache();
    vi.restoreAllMocks();
  });

  it("1. Deve conter exatamente os 5 vendedores oficiais reais da Primacor", () => {
    expect(DEFAULT_VENDEDORES.length).toBe(5);
    const names = DEFAULT_VENDEDORES.map((v) => v.nome.toLowerCase());

    expect(names).toContain("bianca");
    expect(names).toContain("deborah");
    expect(names).toContain("ozeas");
    expect(names).toContain("ronaldo");
    expect(names).toContain("well");

    // NÃO deve conter Wellington nem Primacor
    expect(names).not.toContain("wellington");
    expect(names).not.toContain("primacor");
  });

  it("2. Deve sanitizar 'Wellington' para 'well'", () => {
    expect(sanitizeVendedorNome("Wellington")).toBe("well");
    expect(sanitizeVendedorNome("wellington")).toBe("well");
    expect(sanitizeVendedorNome("WELLINGTON")).toBe("well");
    expect(sanitizeVendedorNome("well")).toBe("well");
    expect(sanitizeVendedorNome("Bianca")).toBe("Bianca");
    expect(sanitizeVendedorNome("Ozeas")).toBe("Ozeas");
  });

  it("3. Deve rejeitar 'Primacor' como nome de vendedor", () => {
    expect(isRealVendedor("Primacor")).toBe(false);
    expect(isRealVendedor("primacor")).toBe(false);
    expect(isRealVendedor("")).toBe(false);
    expect(isRealVendedor("well")).toBe(true);
    expect(isRealVendedor("Bianca")).toBe(true);
  });

  it("4. Deve carregar vendedores via RPC get_vendedores quando disponível e filtrar Wellington para well", async () => {
    vi.spyOn(supabase, "rpc").mockResolvedValueOnce({
      data: [
        { id: "1", user_id: "u1", nome: "Bianca", email: "bianca@primacorgrafica.com.br" },
        { id: "2", user_id: "u2", nome: "deborah", email: "deborah@primacorgrafica.com.br" },
        { id: "3", user_id: "u3", nome: "Ozeas", email: "ozeas@primacorgrafica.com.br" },
        { id: "4", user_id: "u4", nome: "Ronaldo", email: "ronaldo@primacorgrafica.com.br" },
        { id: "5", user_id: "u5", nome: "Wellington", email: "well@primacorgrafica.com.br" }, // vem Wellington do banco
        { id: "6", user_id: "u6", nome: "Primacor", email: "contato@primacorgrafica.com.br" }, // vem Primacor do banco
      ],
      error: null,
    } as any);

    const list = await fetchVendedores();
    expect(list.length).toBe(5);

    const names = list.map((v) => v.nome);
    expect(names).toContain("well");
    expect(names).not.toContain("Wellington");
    expect(names).not.toContain("Primacor");
  });

  it("5. Deve utilizar o fallback seguro se a RPC e as tabelas falharem", async () => {
    vi.spyOn(supabase, "rpc").mockRejectedValueOnce(new Error("RPC not found"));
    vi.spyOn(supabase, "from").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: new Error("Network error") }),
    } as any);

    const list = await fetchVendedores();
    expect(list.length).toBe(5);
    expect(list.some((v) => v.nome === "well")).toBe(true);
    expect(list.some((v) => v.nome === "Wellington")).toBe(false);
    expect(list.some((v) => v.nome === "Primacor")).toBe(false);
  });
});
