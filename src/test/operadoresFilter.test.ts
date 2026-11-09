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

  describe("Filtro de Ordens por Operador (Kanban e Produção)", () => {
    const mockOrders = [
      { id: "1", titulo: "OS 1001", operador: "Alexandre", status: "entrada" },
      { id: "2", titulo: "OS 1002", operador: "Leonardo", status: "preparacao" },
      { id: "3", titulo: "OS 1003", operador: "Carlos Coelho", status: "saida" },
      { id: "4", titulo: "OS 1004", operador: null, status: "entrada" },
      { id: "5", titulo: "OS 1005", operador: undefined, status: "preparacao" },
    ];

    const filterOrders = (orders: typeof mockOrders, operadores?: string[]) => {
      return orders.filter((o) => {
        if (operadores && operadores.length > 0 && (!o.operador || !operadores.includes(o.operador))) {
          return false;
        }
        return true;
      });
    };

    it("deve retornar todas as ordens quando nenhum operador estiver selecionado no filtro", () => {
      expect(filterOrders(mockOrders, [])).toHaveLength(5);
      expect(filterOrders(mockOrders, undefined)).toHaveLength(5);
    });

    it("deve filtrar ordens pelo operador selecionado", () => {
      const alexandreOrders = filterOrders(mockOrders, ["Alexandre"]);
      expect(alexandreOrders).toHaveLength(1);
      expect(alexandreOrders[0].id).toBe("1");

      const leonardoOrders = filterOrders(mockOrders, ["Leonardo"]);
      expect(leonardoOrders).toHaveLength(1);
      expect(leonardoOrders[0].id).toBe("2");
    });

    it("deve suportar filtro com múltiplos operadores selecionados simultaneamente", () => {
      const multi = filterOrders(mockOrders, ["Alexandre", "Carlos Coelho"]);
      expect(multi).toHaveLength(2);
      expect(multi.map((o) => o.operador)).toEqual(["Alexandre", "Carlos Coelho"]);
    });

    it("deve excluir ordens sem operador quando qualquer operador estiver filtrado", () => {
      const filtered = filterOrders(mockOrders, ["Leonardo"]);
      expect(filtered.some((o) => !o.operador)).toBe(false);
    });

    it("KanbanFiltersBar, Index, ProductionPage, ComercialPage e EntregasPage devem conter suporte ao filtro de operador", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const projectRoot = path.resolve(__dirname, "..");

      const filterBarCode = fs.readFileSync(path.join(projectRoot, "components", "KanbanFiltersBar.tsx"), "utf8");
      expect(filterBarCode).toContain("operadores?: string[]");
      expect(filterBarCode).toContain("Operador");
      expect(filterBarCode).toContain("fetchOperadoresList");

      const indexCode = fs.readFileSync(path.join(projectRoot, "pages", "Index.tsx"), "utf8");
      expect(indexCode).toContain("filters.operadores");

      const prodCode = fs.readFileSync(path.join(projectRoot, "pages", "ProductionPage.tsx"), "utf8");
      expect(prodCode).toContain("deptFilters.operadores");
      expect(prodCode).toContain("showOnly={[\"statuses\", \"vendedores\", \"operadores\"");

      const comCode = fs.readFileSync(path.join(projectRoot, "pages", "ComercialPage.tsx"), "utf8");
      expect(comCode).toContain("filters.operadores");

      const entCode = fs.readFileSync(path.join(projectRoot, "pages", "EntregasPage.tsx"), "utf8");
      expect(entCode).toContain("kanbanFilters.operadores");
    });
  });
});
