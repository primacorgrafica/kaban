import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  EXPEDICAO_AREAS,
  VEICULO_CATEGORIAS,
  isValidBrazilianPlate,
  normalizeBrazilianPlate,
} from "@/types/delivery";
import {
  getEntregadoresList,
  saveEntregador,
  inactivateEntregador,
} from "@/lib/deliveryService";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

describe("Fase 1 — Estrutura da Expedição e Cadastro de Entregadores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Configuração Centralizada da Expedição (src/types/delivery.ts)", () => {
    it("deve definir exatamente as 3 áreas da Expedição na ordem correta", () => {
      expect(EXPEDICAO_AREAS.map((a) => a.label)).toEqual([
        "Gestão de Entregas",
        "Rotas",
        "Cadastro de Entregadores",
      ]);
      expect(EXPEDICAO_AREAS.map((a) => a.path)).toEqual([
        "/entregas",
        "/expedicao/rotas",
        "/expedicao/entregadores",
      ]);
    });

    it("deve definir apenas as categorias Carro e Moto", () => {
      expect(VEICULO_CATEGORIAS.map((c) => c.id).sort()).toEqual(["carro", "moto"]);
    });
  });

  describe("Validação e Normalização de Placa Brasileira", () => {
    it("deve validar formato antigo (AAA-0000 e AAA0000) e Mercosul (AAA0A00)", () => {
      expect(isValidBrazilianPlate("ABC-1234")).toBe(true);
      expect(isValidBrazilianPlate("abc1234")).toBe(true);
      expect(isValidBrazilianPlate("ABC1D23")).toBe(true);
      expect(isValidBrazilianPlate("bra2e19")).toBe(true);
    });

    it("deve rejeitar placas inválidas", () => {
      expect(isValidBrazilianPlate("123-ABCD")).toBe(false);
      expect(isValidBrazilianPlate("AB-1234")).toBe(false);
      expect(isValidBrazilianPlate("ABC123")).toBe(false);
      expect(isValidBrazilianPlate("ABCD123")).toBe(false);
      expect(isValidBrazilianPlate("ABC12D3")).toBe(false);
    });

    it("deve normalizar placa antiga com hífen e Mercosul contínua em maiúsculas", () => {
      expect(normalizeBrazilianPlate("abc1234")).toBe("ABC-1234");
      expect(normalizeBrazilianPlate("abc-1234")).toBe("ABC-1234");
      expect(normalizeBrazilianPlate("abc1d23")).toBe("ABC1D23");
      expect(normalizeBrazilianPlate("abc-1d23")).toBe("ABC1D23");
    });
  });

  describe("CRUD de Entregadores e Exclusão Lógica", () => {
    it("deve bloquear salvamento quando a placa informada é inválida", async () => {
      const res = await saveEntregador({
        nome_completo: "Marcos",
        sobrenome: "Pereira",
        documento_identificacao: "123.456.789-00",
        categoria_veiculo: "moto",
        placa_veiculo: "INVALIDA",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Placa inválida");
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("deve inserir entregador sem user_id (user_id: null) preparado para Fase 5", async () => {
      const insertSingle = vi.fn().mockResolvedValue({
        data: {
          id: "ent-1",
          user_id: null,
          nome_completo: "Lucas",
          sobrenome: "Almeida",
          placa_veiculo: "OPQ1E23",
          documento_identificacao: "MG-12.345.678",
          categoria_veiculo: "carro",
          ativo: true,
        },
        error: null,
      });
      const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
      const insertMock = vi.fn().mockReturnValue({ select: insertSelect });

      (supabase.from as any).mockReturnValue({ insert: insertMock });

      const res = await saveEntregador({
        user_id: null,
        nome_completo: "Lucas",
        sobrenome: "Almeida",
        modelo_veiculo: "Fiorino",
        placa_veiculo: "opq1e23",
        documento_identificacao: "MG-12.345.678",
        categoria_veiculo: "carro",
        observacoes: "Disponível pela manhã",
      });

      expect(res.success).toBe(true);
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: null,
          nome_completo: "Lucas",
          sobrenome: "Almeida",
          placa_veiculo: "OPQ1E23",
          documento_identificacao: "MG-12.345.678",
          categoria_veiculo: "carro",
          ativo: true,
        })
      );
    });

    it("deve atualizar entregador existente por id quando editando", async () => {
      const updateSingle = vi.fn().mockResolvedValue({
        data: { id: "ent-1", nome_completo: "Lucas", ativo: true },
        error: null,
      });
      const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
      const updateEq = vi.fn().mockReturnValue({ select: updateSelect });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEq });

      (supabase.from as any).mockReturnValue({ update: updateMock });

      const res = await saveEntregador({
        id: "ent-1",
        user_id: null,
        nome_completo: "Lucas",
        sobrenome: "Almeida",
        placa_veiculo: "abc1234",
        documento_identificacao: "12345678900",
        categoria_veiculo: "moto",
      });

      expect(res.success).toBe(true);
      expect(updateEq).toHaveBeenCalledWith("id", "ent-1");
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          placa_veiculo: "ABC-1234",
        })
      );
    });

    it("inactivateEntregador deve inativar logicamente (ativo=false, rota=null) sem apagar nem desvincular histórico de orders", async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });

      (supabase.from as any).mockReturnValue({ update: updateMock });

      const res = await inactivateEntregador("ent-99");

      expect(res.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledTimes(1);
      expect(supabase.from).toHaveBeenCalledWith("entregadores");
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ativo: false,
          rota_atribuida: null,
        })
      );
      expect(eqMock).toHaveBeenCalledWith("id", "ent-99");
    });

    it("getEntregadoresList deve fazer fallback para entregadores_public se RLS bloquear documento_identificacao", async () => {
      const publicDrivers = [
        { id: "ent-1", user_id: null, nome_completo: "João", sobrenome: "Silva", ativo: true },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "entregadores") {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "42501", message: "permission denied for table entregadores" },
              }),
            }),
          };
        }
        if (table === "entregadores_public") {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: publicDrivers,
                error: null,
              }),
            }),
          };
        }
        return {};
      });

      const res = await getEntregadoresList();
      expect(res.error).toBeNull();
      expect(res.data).toEqual(publicDrivers);
    });
  });

  describe("Validação Estrutural da Migration SQL de Segurança (Backend)", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261125_fase1_expedicao_entregadores.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    it("deve permitir user_id nulo para entregadores ainda sem login", () => {
      expect(sql).toContain("ALTER COLUMN user_id DROP NOT NULL");
    });

    it("deve validar placa brasileira via CHECK constraint no banco", () => {
      expect(sql).toContain("entregadores_placa_veiculo_check");
    });

    it("deve criar função backend is_expedicao_manager e restringir tabela entregadores com RLS", () => {
      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.is_expedicao_manager");
      expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
      expect(sql).toContain("Gestores Expedicao ou proprio entregador veem cadastro completo");
      expect(sql).toContain("Gestores Expedicao podem inserir entregadores");
      expect(sql).toContain("Gestores Expedicao podem editar entregadores");
      expect(sql).toContain("Apenas admin remove entregador fisicamente");
    });

    it("deve expor view entregadores_public sem documento_identificacao", () => {
      expect(sql).toContain("CREATE OR REPLACE VIEW public.entregadores_public");
      expect(sql).not.toMatch(/CREATE OR REPLACE VIEW public\.entregadores_public[\s\S]*documento_identificacao/);
    });
  });
});
