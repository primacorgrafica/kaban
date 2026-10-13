import { useAuth } from "./useAuth";

export type AppRole = "admin" | "coordenador" | "operador" | "vendedor" | "user" | "orcamentista" | "impressor";

// Level mapping
const ROLE_LEVEL: Record<AppRole, number> = {
  admin: 4,
  coordenador: 3,
  operador: 2,
  impressor: 2,
  vendedor: 1,
  orcamentista: 1,
  user: 0,
};

export function usePermissions() {
  const { role, user } = useAuth();
  const currentRole = (role as AppRole) || "user";
  const level = ROLE_LEVEL[currentRole] ?? 0;

  return {
    role: currentRole,
    level,

    // Admin (4): tudo
    canAccessDashboard: level >= 4,
    canAccessComercial: currentRole === "admin" || currentRole === "coordenador" || currentRole === "vendedor" || currentRole === "orcamentista",
    canManageUsers: level >= 4,
    canManageProcesses: level >= 4,

    // Criar/Editar: admin, coordenador, orcamentista
    canCreateOS: level >= 3 || currentRole === "orcamentista",
    canCreateCardManual: level >= 3 || currentRole === "orcamentista",
    canEditCard: level >= 3 || currentRole === "orcamentista",

    // Mover card: TODOS os autenticados
    canViewAllSectors: level >= 1,
    canAdvanceCards: true, // todos podem mover
    canPauseCards: false,
    canReorderEntry: true, // todos podem reordenar
    canArchive: level >= 3,
    canDelete: level >= 4,
    canSendToProduction: level >= 3 || currentRole === "orcamentista",

    isOperador: currentRole === "operador",
    isViewOnly: false, // ninguém é somente visualização agora
  };
}
