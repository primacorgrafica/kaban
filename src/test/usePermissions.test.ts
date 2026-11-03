import { describe, it, expect, vi } from "vitest";
import { usePermissions } from "@/hooks/usePermissions";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/hooks/useAuth";

describe("usePermissions - Permissões de Operador para Enviar a Outro Setor na Pré-Impressão", () => {
  it("deve permitir que o perfil 'operador' envie O.S para outro setor (canSendToProduction = true)", () => {
    (useAuth as any).mockReturnValue({
      role: "operador",
      user: { id: "user-op-1" },
      hasModule: vi.fn().mockReturnValue(false),
    });

    const perms = usePermissions();
    expect(perms.role).toBe("operador");
    expect(perms.canSendToProduction).toBe(true);
    expect(perms.canAdvanceCards).toBe(true);
  });

  it("deve manter canSendToProduction = true para coordenador e admin", () => {
    (useAuth as any).mockReturnValue({
      role: "coordenador",
      user: { id: "user-coord-1" },
      hasModule: vi.fn().mockReturnValue(false),
    });

    const permsCoord = usePermissions();
    expect(permsCoord.canSendToProduction).toBe(true);

    (useAuth as any).mockReturnValue({
      role: "admin",
      user: { id: "user-admin-1" },
      hasModule: vi.fn().mockReturnValue(false),
    });

    const permsAdmin = usePermissions();
    expect(permsAdmin.canSendToProduction).toBe(true);
  });

  it("não deve conceder canSendToProduction para vendedor comum sem módulo de orçamentista", () => {
    (useAuth as any).mockReturnValue({
      role: "vendedor",
      user: { id: "user-vend-1" },
      hasModule: vi.fn().mockReturnValue(false),
    });

    const perms = usePermissions();
    expect(perms.canSendToProduction).toBe(false);
  });

  it("deve permitir canAssignAnyOperator = true para coordenador e administrador", () => {
    (useAuth as any).mockReturnValue({
      role: "coordenador",
      user: { id: "user-coord-1" },
      hasModule: vi.fn().mockReturnValue(false),
    });
    const permsCoord = usePermissions();
    expect(permsCoord.canAssignAnyOperator).toBe(true);

    (useAuth as any).mockReturnValue({
      role: "admin",
      user: { id: "user-admin-1" },
      hasModule: vi.fn().mockReturnValue(false),
    });
    const permsAdmin = usePermissions();
    expect(permsAdmin.canAssignAnyOperator).toBe(true);
  });

  it("deve manter canAssignAnyOperator = false para operador comum (apenas autoatribuição)", () => {
    (useAuth as any).mockReturnValue({
      role: "operador",
      user: { id: "user-op-1" },
      hasModule: vi.fn().mockReturnValue(false),
    });
    const permsOp = usePermissions();
    expect(permsOp.canAssignAnyOperator).toBe(false);
  });
});
