import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchOperadoresList, clearOperadoresCache } from "@/lib/operadores";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(),
    },
  };
});

describe("fetchOperadoresList - Filtro exclusivo de perfis com papel de Operador", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOperadoresCache();
  });

  it("deve carregar operadores via RPC get_operadores quando disponível", async () => {
    (supabase.rpc as any).mockResolvedValueOnce({
      data: [
        { id: "p1", user_id: "u1", nome: "Alexandre", setor_vinculado: "Pré-Impressão" },
        { id: "p2", user_id: "u2", nome: "Beatriz", setor_vinculado: "Digital" },
      ],
      error: null,
    });

    const ops = await fetchOperadoresList();

    expect(supabase.rpc).toHaveBeenCalledWith("get_operadores");
    expect(ops).toHaveLength(2);
    expect(ops.map((o) => o.nome)).toEqual(["Alexandre", "Beatriz"]);
  });

  it("deve realizar fallback cruzando user_roles (role = operador) e profiles quando RPC falhar", async () => {
    // Simula falha na RPC
    (supabase.rpc as any).mockResolvedValueOnce({
      data: null,
      error: { message: "function public.get_operadores() does not exist" },
    });

    // Mock das tabelas
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "user_roles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { user_id: "u-operador-1" },
                { user_id: "u-operador-2" },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { id: "p1", user_id: "u-admin", nome: "Carlos Admin", setor_vinculado: null },
                { id: "p2", user_id: "u-vendedor", nome: "Ronaldo Vendedor", setor_vinculado: "Comercial" },
                { id: "p3", user_id: "u-operador-1", nome: "Alexandre Operador", setor_vinculado: "Pré-Impressão" },
                { id: "p4", user_id: "u-coordenador", nome: "Marcelo Coordenador", setor_vinculado: "Coordenação" },
                { id: "p5", user_id: "u-operador-2", nome: "Tiago Operador", setor_vinculado: "Digital" },
              ],
              error: null,
            }),
          }),
        };
      }
      return { select: vi.fn() };
    });

    const ops = await fetchOperadoresList();

    // Apenas perfis cujo user_id consta em user_roles com role = 'operador' devem ser retornados
    expect(ops).toHaveLength(2);
    expect(ops.map((o) => o.nome)).toEqual(["Alexandre Operador", "Tiago Operador"]);
    expect(ops.some((o) => o.nome.includes("Admin"))).toBe(false);
    expect(ops.some((o) => o.nome.includes("Vendedor"))).toBe(false);
    expect(ops.some((o) => o.nome.includes("Coordenador"))).toBe(false);
  });

  it("deve preservar o operador atual da O.S. caso ele não esteja na lista de operadores ativos", async () => {
    (supabase.rpc as any).mockResolvedValueOnce({
      data: [
        { id: "p1", user_id: "u1", nome: "Alexandre", setor_vinculado: "Pré-Impressão" },
      ],
      error: null,
    });

    const ops = await fetchOperadoresList("Operador Antigo Histórico");

    expect(ops).toHaveLength(2);
    expect(ops[0].nome).toBe("Operador Antigo Histórico");
    expect(ops[1].nome).toBe("Alexandre");
  });

  it("não duplica o operador atual se ele já constar na lista de operadores ativos", async () => {
    (supabase.rpc as any).mockResolvedValueOnce({
      data: [
        { id: "p1", user_id: "u1", nome: "Alexandre", setor_vinculado: "Pré-Impressão" },
        { id: "p2", user_id: "u2", nome: "Beatriz", setor_vinculado: "Digital" },
      ],
      error: null,
    });

    const ops = await fetchOperadoresList("Alexandre");

    expect(ops).toHaveLength(2);
    expect(ops.filter((o) => o.nome === "Alexandre")).toHaveLength(1);
  });

  it("utiliza cache in-memory em chamadas subsequentes dentro da janela de TTL", async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: [
        { id: "p1", user_id: "u1", nome: "Alexandre", setor_vinculado: "Pré-Impressão" },
      ],
      error: null,
    });

    await fetchOperadoresList();
    await fetchOperadoresList();
    await fetchOperadoresList();

    // supabase.rpc deve ter sido chamado apenas 1 vez graças ao cache
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("deve incluir os administradores autorizados (embalagens e coordenadorpre) como operadores selecionáveis", async () => {
    (supabase.rpc as any).mockResolvedValueOnce({
      data: null,
      error: { message: "function public.get_operadores() does not exist" },
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "user_roles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { user_id: "u-operador-1" },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { id: "p1", user_id: "u-operador-1", nome: "Alexandre", email: "alexandre@primacorgrafica.com.br", setor_vinculado: "Pré-Impressão" },
                { id: "p2", user_id: "0926b9b3-fe98-4a45-b449-79ed850b469f", nome: "Leonardo", email: "embalagens@primacorgrafica.com.br", setor_vinculado: null },
                { id: "p3", user_id: "586b96f9-8ecf-4f69-8e68-4540c741d787", nome: "Carlos Coelho", email: "coordenadorpre@primacorgrafica.com.br", setor_vinculado: null },
                { id: "p4", user_id: "u-outro-admin", nome: "Outro Admin", email: "outro@primacorgrafica.com.br", setor_vinculado: null },
              ],
              error: null,
            }),
          }),
        };
      }
      return { select: vi.fn() };
    });

    const ops = await fetchOperadoresList();

    expect(ops).toHaveLength(3);
    const names = ops.map((o) => o.nome);
    expect(names).toContain("Alexandre");
    expect(names).toContain("Leonardo");
    expect(names).toContain("Carlos Coelho");
    expect(names).not.toContain("Outro Admin");
  });
});
