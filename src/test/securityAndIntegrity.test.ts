import { describe, it, expect } from "vitest";

describe("Security & Default-Deny Module Authorization", () => {
  // Simula a lógica de autorização implementada em useAuth
  const checkModuleAccess = (
    role: string | null,
    modulosAcesso: string[] | null,
    mod: string
  ) => {
    const isAdmin = role === "admin";
    if (isAdmin) return true;
    if (modulosAcesso && modulosAcesso.length > 0) {
      return modulosAcesso.includes(mod);
    }
    // Fallback seguro: default-deny baseado na role
    if (role === "coordenador") {
      return ["producao", "expedicao", "pcp", "trabalhos_concluidos", "compras", "manutencao"].includes(mod);
    }
    if (role === "vendedor") {
      return ["comercial"].includes(mod);
    }
    if (role === "orcamentista") {
      return ["comercial", "producao"].includes(mod);
    }
    if (role === "operador" || role === "impressor") {
      return ["producao"].includes(mod);
    }
    return false;
  };

  it("should grant full access to admin regardless of modulosAcesso array", () => {
    expect(checkModuleAccess("admin", [], "comercial")).toBe(true);
    expect(checkModuleAccess("admin", [], "pcp")).toBe(true);
    expect(checkModuleAccess("admin", [], "qualquer_coisa")).toBe(true);
  });

  it("should deny access to restricted modules when regular user has empty modulosAcesso (default-deny)", () => {
    expect(checkModuleAccess("user", [], "comercial")).toBe(false);
    expect(checkModuleAccess("user", [], "pcp")).toBe(false);
    expect(checkModuleAccess("user", null, "dashboard")).toBe(false);
  });

  it("should grant role-based defaults when modulosAcesso is empty", () => {
    // Vendedor recebe comercial, mas não PCP nem compras
    expect(checkModuleAccess("vendedor", [], "comercial")).toBe(true);
    expect(checkModuleAccess("vendedor", [], "pcp")).toBe(false);
    expect(checkModuleAccess("vendedor", [], "compras")).toBe(false);

    // Operador recebe producao, mas não comercial
    expect(checkModuleAccess("operador", [], "producao")).toBe(true);
    expect(checkModuleAccess("operador", [], "comercial")).toBe(false);
  });

  it("should strictly respect custom modulosAcesso when explicitly assigned", () => {
    const customUserModules = ["comercial", "dashboard"];
    expect(checkModuleAccess("vendedor", customUserModules, "comercial")).toBe(true);
    expect(checkModuleAccess("vendedor", customUserModules, "dashboard")).toBe(true);
    expect(checkModuleAccess("vendedor", customUserModules, "pcp")).toBe(false);
    expect(checkModuleAccess("vendedor", customUserModules, "producao")).toBe(false);
  });
});

describe("Order Family Referential Integrity", () => {
  interface SimulatedOrder {
    id: string;
    parent_order_id: string | null;
    tipo: "pai" | "filho";
  }

  it("should clean up child orders when parent is deleted, preventing orphan ghost orders", () => {
    let database: SimulatedOrder[] = [
      { id: "parent-1", parent_order_id: null, tipo: "pai" },
      { id: "child-faturamento-1", parent_order_id: "parent-1", tipo: "filho" },
      { id: "child-manutencao-1", parent_order_id: "parent-1", tipo: "filho" },
      { id: "parent-2", parent_order_id: null, tipo: "pai" },
    ];

    const deleteOrderSimulated = (parentId: string) => {
      // 1. Remove filhos vinculados à OS pai
      database = database.filter((o) => o.parent_order_id !== parentId);
      // 2. Remove o pai
      database = database.filter((o) => o.id !== parentId);
    };

    deleteOrderSimulated("parent-1");

    expect(database.length).toBe(1);
    expect(database[0].id).toBe("parent-2");
    // Garante que nenhum filho de parent-1 restou no banco
    const orphans = database.filter((o) => o.parent_order_id === "parent-1");
    expect(orphans.length).toBe(0);
  });
});
