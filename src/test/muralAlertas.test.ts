import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMuralAlertas } from "../hooks/useMuralAlertas";
import { supabase } from "@/integrations/supabase/client";
import * as useAuthModule from "../hooks/useAuth";

// Mock do supabase
vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn(),
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      }),
      removeChannel: vi.fn(),
    },
  };
});

describe("Mural de Alertas - Hook e Lógica de Negócio", () => {
  const mockAlertasData = [
    {
      id: "alerta-1",
      titulo: "Manutenção Komori às 14h",
      mensagem: "A máquina Komori passará por troca de rolos.",
      tipo: "urgente",
      ativo: true,
      criado_por: "user-admin",
      autor_nome: "Admin",
      created_at: "2026-10-30T10:00:00Z",
    },
    {
      id: "alerta-2",
      titulo: "Novo fornecedor de chapa CTP",
      mensagem: "Testes da nova chapa iniciam amanhã.",
      tipo: "info",
      ativo: false,
      criado_por: "user-admin",
      autor_nome: "Admin",
      created_at: "2026-10-29T10:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
      user: { id: "user-admin", email: "admin@primacorgrafica.com.br", user_metadata: { nome: "Admin" } } as any,
      isAdmin: true,
      role: "admin",
      loading: false,
      authReady: true,
      session: null,
      modulosAcesso: ["admin"],
      setorVinculado: null,
      onlineUserIds: new Set(),
      hasModule: () => true,
      canAccessSector: () => true,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    });
  });

  it("deve carregar alertas com sucesso da tabela mural_alertas", async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "mural_alertas") {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockAlertasData,
            error: null,
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const { result } = renderHook(() => useMuralAlertas());

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.alertas).toHaveLength(2);
    expect(result.current.activeAlerts).toHaveLength(1);
    expect(result.current.primaryAlert?.titulo).toBe("Manutenção Komori às 14h");
    expect(result.current.canManageMural).toBe(true);
  });

  it("deve utilizar fallback na tabela avisos caso mural_alertas retorne erro PGRST205", async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "mural_alertas") {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { code: "PGRST205", message: "table not found" },
          }),
        };
      }
      if (table === "avisos") {
        return {
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: "aviso-1",
                titulo: "Aviso do Mural via Avisos",
                mensagem: "Mensagem de teste fallback",
                tipo: "mural:urgente",
                criado_por: "user-admin",
                created_at: "2026-10-30T10:00:00Z",
              },
            ],
            error: null,
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const { result } = renderHook(() => useMuralAlertas());

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.alertas).toHaveLength(1);
    expect(result.current.alertas[0].titulo).toBe("Aviso do Mural via Avisos");
    expect(result.current.alertas[0].tipo).toBe("urgente");
    expect(result.current.activeAlerts).toHaveLength(1);
  });

  it("deve permitir que usuário autorizado crie novo alerta", async () => {
    let insertedPayload: any = null;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "mural_alertas") {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockAlertasData, error: null }),
          insert: vi.fn().mockImplementation((payload) => {
            insertedPayload = payload;
            return Promise.resolve({ error: null });
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const { result } = renderHook(() => useMuralAlertas());

    let res: any;
    await act(async () => {
      res = await result.current.criarAlerta({
        titulo: "Novo Comunicado Geral",
        mensagem: "Atenção ao horário de almoço na produção.",
        tipo: "importante",
        ativo: true,
      });
    });

    expect(res.success).toBe(true);
    expect(insertedPayload).toBeDefined();
    expect(insertedPayload.titulo).toBe("Novo Comunicado Geral");
    expect(insertedPayload.tipo).toBe("importante");
    expect(insertedPayload.ativo).toBe(true);
  });

  it("deve permitir que usuário autorizado edite um alerta existente", async () => {
    let updatePayload: any = null;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "mural_alertas") {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockAlertasData, error: null }),
          update: vi.fn().mockImplementation((payload) => {
            updatePayload = payload;
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            };
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const { result } = renderHook(() => useMuralAlertas());

    let res: any;
    await act(async () => {
      res = await result.current.editarAlerta("alerta-1", {
        titulo: "Título Atualizado",
        ativo: false,
      });
    });

    expect(res.success).toBe(true);
    expect(updatePayload.titulo).toBe("Título Atualizado");
    expect(updatePayload.ativo).toBe(false);
  });

  it("deve permitir que usuário autorizado exclua um alerta", async () => {
    let deletedId: string | null = null;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "mural_alertas") {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockAlertasData, error: null }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col, val) => {
              deletedId = val;
              return Promise.resolve({ error: null });
            }),
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const { result } = renderHook(() => useMuralAlertas());

    let res: any;
    await act(async () => {
      res = await result.current.excluirAlerta("alerta-1");
    });

    expect(res.success).toBe(true);
    expect(deletedId).toBe("alerta-1");
  });

  it("deve bloquear operações de gerenciamento para operadores comuns (apenas visualização)", async () => {
    vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
      user: { id: "user-operador", email: "operador@primacorgrafica.com.br" } as any,
      isAdmin: false,
      role: "operador",
      loading: false,
      authReady: true,
      session: null,
      modulosAcesso: ["producao"],
      setorVinculado: "offset",
      onlineUserIds: new Set(),
      hasModule: () => false,
      canAccessSector: () => false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "mural_alertas") {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockAlertasData, error: null }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const { result } = renderHook(() => useMuralAlertas());

    expect(result.current.canManageMural).toBe(false);

    let resCreate: any;
    await act(async () => {
      resCreate = await result.current.criarAlerta({
        titulo: "Tentativa não autorizada",
        mensagem: "Texto",
      });
    });

    expect(resCreate.success).toBe(false);
    expect(resCreate.error).toBe("Sem permissão");
  });
});
