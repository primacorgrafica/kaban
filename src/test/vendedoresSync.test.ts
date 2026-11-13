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

  it("1. Deve conter os 6 vendedores oficiais da Primacor (incluindo Primacor/comercial)", () => {
    expect(DEFAULT_VENDEDORES.length).toBe(6);
    const names = DEFAULT_VENDEDORES.map((v) => v.nome.toLowerCase());

    expect(names).toContain("bianca");
    expect(names).toContain("deborah");
    expect(names).toContain("ozeas");
    expect(names).toContain("ronaldo");
    expect(names).toContain("wellington");
    expect(names).toContain("primacor");

    // NÃO deve conter 'well' (o perfil oficial é 'Wellington')
    expect(names).not.toContain("well");
  });

  it("2. Deve sanitizar 'well' para 'Wellington'", () => {
    expect(sanitizeVendedorNome("well")).toBe("Wellington");
    expect(sanitizeVendedorNome("WELL")).toBe("Wellington");
    expect(sanitizeVendedorNome("Well")).toBe("Wellington");
    expect(sanitizeVendedorNome("Wellington")).toBe("Wellington");
    expect(sanitizeVendedorNome("wellington")).toBe("Wellington");
    expect(sanitizeVendedorNome("Bianca")).toBe("Bianca");
    expect(sanitizeVendedorNome("Ozeas")).toBe("Ozeas");
    expect(sanitizeVendedorNome("Primacor")).toBe("Primacor");
  });

  it("3. isRealVendedor deve aceitar nomes reais e rejeitar strings vazias", () => {
    expect(isRealVendedor("Primacor")).toBe(true);
    expect(isRealVendedor("primacor")).toBe(true);
    expect(isRealVendedor("Wellington")).toBe(true);
    expect(isRealVendedor("Bianca")).toBe(true);
    expect(isRealVendedor("")).toBe(false);
    expect(isRealVendedor("   ")).toBe(false);
  });

  it("4. Deve carregar vendedores dinamicamente cruzando user_roles (role = 'vendedor') com profiles", async () => {
    vi.spyOn(supabase, "rpc").mockRejectedValue(new Error("RPC not found"));
    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "user_roles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [
              { user_id: "u1" },
              { user_id: "u2" },
              { user_id: "u3" },
              { user_id: "u4" },
              { user_id: "u5" },
              { user_id: "u6" },
            ],
            error: null,
          }),
        } as any;
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              { id: "1", user_id: "u1", nome: "Bianca", email: "bianca@primacorgrafica.com.br" },
              { id: "2", user_id: "u2", nome: "deborah", email: "deborah@primacorgrafica.com.br" },
              { id: "3", user_id: "u3", nome: "Ozeas", email: "ozeas@primacorgrafica.com.br" },
              { id: "4", user_id: "u4", nome: "Ronaldo", email: "ronaldo@primacorgrafica.com.br" },
              { id: "5", user_id: "u5", nome: "Wellington", email: "well@primacorgrafica.com.br" },
              { id: "6", user_id: "u6", nome: "Primacor", email: "comercial@primacorgrafica.com.br" },
            ],
            error: null,
          }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any;
    });

    const list = await fetchVendedores(true);
    expect(list.length).toBe(6);

    const names = list.map((v) => v.nome);
    expect(names).toContain("Wellington");
    expect(names).toContain("Primacor");
    expect(names).not.toContain("well");
  });

  it("5. Deve utilizar o fallback seguro de DEFAULT_VENDEDORES se as consultas falharem", async () => {
    vi.spyOn(supabase, "rpc").mockRejectedValue(new Error("RPC not found"));
    vi.spyOn(supabase, "from").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: new Error("Network error") }),
    } as any);

    const list = await fetchVendedores(true);
    expect(list.length).toBe(6);
    expect(list.some((v) => v.nome === "Wellington")).toBe(true);
    expect(list.some((v) => v.nome === "Primacor")).toBe(true);
    expect(list.some((v) => v.nome === "well")).toBe(false);
  });
});
