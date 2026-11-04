import { describe, it, expect } from "vitest";
import { ACCESS_MODULES, normalizeModules } from "@/pages/UserManagementPage";

// Simulação da lógica de verificação de hasModule e canAccessSector de useAuth.tsx
function createAuthChecker({
  role,
  setorVinculado,
  modulosAcesso,
}: {
  role?: string;
  setorVinculado?: string | null;
  modulosAcesso?: string[];
}) {
  const isAdmin = role === "admin";

  const hasModule = (mod: string) => {
    if (isAdmin) return true;

    // Se o usuário possui um setor vinculado exclusivo, seu acesso operacional fica estritamente restrito a esse setor
    if (setorVinculado) {
      if (["pre_impressao", "ctp", "digital", "qualidade", "producao"].includes(mod)) {
        return setorVinculado.toLowerCase() === mod.toLowerCase();
      }
    }

    if (modulosAcesso && modulosAcesso.length > 0) {
      const lowerMod = mod.toLowerCase();
      const hasDirect = modulosAcesso.some((m) => m.toLowerCase() === lowerMod);
      if (hasDirect) return true;
      if ((lowerMod === "mural" || lowerMod === "mural_alertas") && modulosAcesso.some((m) => m.toLowerCase() === "mural" || m.toLowerCase() === "mural_alertas")) return true;
      if (lowerMod === "cadastros" && modulosAcesso.some((m) => m.toLowerCase() === "cadastro")) return true;
      if (lowerMod === "entregas" && modulosAcesso.some((m) => m.toLowerCase() === "gestao_entregas")) return true;
      return false;
    }

    // Fallback seguro: default-deny baseado na role
    if (role === "coordenador") {
      return ["comercial", "pcp", "pre_impressao", "ctp", "digital", "qualidade", "producao", "expedicao", "entregas", "gestao_entregas", "entregador", "trabalhos_concluidos", "compras", "manutencao", "dashboard", "cadastros", "cadastro", "utilidades", "mural"].includes(mod);
    }
    if (role === "vendedor") {
      return ["comercial", "utilidades"].includes(mod);
    }
    if (role === "pcp") {
      return ["pcp", "comercial", "expedicao", "entregas", "gestao_entregas", "utilidades"].includes(mod);
    }
    if (role === "expedicao") {
      return ["expedicao", "entregas", "gestao_entregas", "utilidades"].includes(mod);
    }
    if (role === "entregador") {
      return mod === "entregador";
    }
    if (role === "rh") {
      return ["dashboard", "cadastros", "cadastro", "utilidades", "mural"].includes(mod);
    }
    return false;
  };

  const canAccessSector = (sectorId: string) => {
    if (isAdmin) return true;

    if (setorVinculado) {
      return setorVinculado.toLowerCase() === sectorId.toLowerCase();
    }

    if (modulosAcesso && modulosAcesso.length > 0) {
      return hasModule(sectorId);
    }

    if (role === "coordenador") return true;

    return hasModule(sectorId);
  };

  const canAccessMural = () => {
    return isAdmin || role === "coordenador" || role === "rh" || hasModule("mural") || hasModule("mural_alertas");
  };

  return { hasModule, canAccessSector, canAccessMural };
}

describe("Isolamento Estrito de Setores e Permissões do Mural de Alertas", () => {
  it("Leonardo Queiroz (Operador CTP): deve acessar CTP, mas NUNCA Produção ou Mural de Alertas", () => {
    const auth = createAuthChecker({
      role: "operador",
      setorVinculado: "ctp",
      modulosAcesso: ["ctp"],
    });

    // Acesso ao setor CTP
    expect(auth.canAccessSector("ctp")).toBe(true);
    expect(auth.hasModule("ctp")).toBe(true);

    // NÃO deve acessar Produção
    expect(auth.canAccessSector("producao")).toBe(false);
    expect(auth.hasModule("producao")).toBe(false);

    // NÃO deve acessar outros setores operacionais
    expect(auth.canAccessSector("digital")).toBe(false);
    expect(auth.canAccessSector("qualidade")).toBe(false);
    expect(auth.canAccessSector("pre_impressao")).toBe(false);

    // NÃO deve acessar Mural de Alertas
    expect(auth.canAccessMural()).toBe(false);
    expect(auth.hasModule("mural")).toBe(false);
  });

  it("Operador Digital: deve acessar Digital, mas NUNCA CTP, Produção ou Mural de Alertas", () => {
    const auth = createAuthChecker({
      role: "operador",
      setorVinculado: "digital",
      modulosAcesso: ["digital"],
    });

    expect(auth.canAccessSector("digital")).toBe(true);
    expect(auth.hasModule("digital")).toBe(true);

    expect(auth.canAccessSector("producao")).toBe(false);
    expect(auth.canAccessSector("ctp")).toBe(false);
    expect(auth.canAccessSector("qualidade")).toBe(false);
    expect(auth.canAccessSector("pre_impressao")).toBe(false);

    expect(auth.canAccessMural()).toBe(false);
  });

  it("Operador Qualidade: deve acessar apenas Qualidade, sem vazar para Produção ou Mural", () => {
    const auth = createAuthChecker({
      role: "operador",
      setorVinculado: "qualidade",
      modulosAcesso: ["qualidade"],
    });

    expect(auth.canAccessSector("qualidade")).toBe(true);
    expect(auth.hasModule("qualidade")).toBe(true);

    expect(auth.canAccessSector("producao")).toBe(false);
    expect(auth.canAccessSector("ctp")).toBe(false);
    expect(auth.canAccessSector("digital")).toBe(false);
    expect(auth.canAccessSector("pre_impressao")).toBe(false);

    expect(auth.canAccessMural()).toBe(false);
  });

  it("Operador Produção (Chão de Fábrica): acessa Produção, mas não CTP nem Mural", () => {
    const auth = createAuthChecker({
      role: "operador",
      setorVinculado: "producao",
      modulosAcesso: ["producao"],
    });

    expect(auth.canAccessSector("producao")).toBe(true);
    expect(auth.hasModule("producao")).toBe(true);

    expect(auth.canAccessSector("ctp")).toBe(false);
    expect(auth.canAccessSector("digital")).toBe(false);
    expect(auth.canAccessSector("qualidade")).toBe(false);
    expect(auth.canAccessMural()).toBe(false);
  });

  it("Admin e Coordenador devem ter acesso a Produção e ao Mural de Alertas", () => {
    const admin = createAuthChecker({ role: "admin" });
    expect(admin.canAccessSector("producao")).toBe(true);
    expect(admin.canAccessSector("ctp")).toBe(true);
    expect(admin.canAccessMural()).toBe(true);

    const coord = createAuthChecker({ role: "coordenador" });
    expect(coord.canAccessSector("producao")).toBe(true);
    expect(coord.canAccessSector("ctp")).toBe(true);
    expect(coord.canAccessMural()).toBe(true);
  });

  it("Usuário com permissão explícita de mural deve conseguir acessar o Mural de Alertas", () => {
    const userWithMural = createAuthChecker({
      role: "operador",
      setorVinculado: "ctp",
      modulosAcesso: ["ctp", "mural"],
    });

    expect(userWithMural.canAccessMural()).toBe(true);
    expect(userWithMural.hasModule("mural")).toBe(true);
  });

  it("ACCESS_MODULES deve disponibilizar 'producao' e 'mural'", () => {
    expect(ACCESS_MODULES.some((m) => m.id === "producao" && m.label === "Produção")).toBe(true);
    expect(ACCESS_MODULES.some((m) => m.id === "mural" && m.label === "Mural de Alertas")).toBe(true);
  });

  it("normalizeModules não deve vazar 'producao' para outros setores", () => {
    const normalized = normalizeModules(["producao"]);
    expect(normalized).toEqual(["producao"]);
    expect(normalized).not.toContain("ctp");
    expect(normalized).not.toContain("digital");
    expect(normalized).not.toContain("qualidade");
    expect(normalized).not.toContain("pre_impressao");
  });

  it("normalizeModules deve mapear 'mural_alertas' para 'mural'", () => {
    const normalized = normalizeModules(["mural_alertas"]);
    expect(normalized).toContain("mural");
  });
});
