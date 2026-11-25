import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  REGIONAIS_SEED_DATA,
  slugifyRegionalText,
} from "@/lib/regionaisSeed";
import {
  matchRegionAndLocalityFromAddress,
  type RegionalWithCount,
} from "@/lib/regionaisService";
import {
  DELIVERY_STATUS_CONFIG,
  DELIVERY_STATUS_ORDER,
  SEM_REGIAO_LABEL,
} from "@/types/delivery";
import {
  updateDeliveryRegion,
  updateDeliveryVehicleType,
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

describe("Fase 2 — Regionais, Localidades e Evolução da Gestão de Entregas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Cadastro Inicial de 18 Regionais e Localidades (src/lib/regionaisSeed.ts)", () => {
    it("deve conter exatamente as 18 regionais na ordem oficial especificada", () => {
      expect(REGIONAIS_SEED_DATA).toHaveLength(18);

      const expectedNomes = [
        "CENTRO-SUL",
        "PAMPULHA",
        "OESTE",
        "BARREIRO",
        "LESTE",
        "NOROESTE",
        "NORDESTE",
        "NORTE",
        "VENDA NOVA",
        "LINHA VERDE",
        "262",
        "040 NORTE",
        "040 SUL",
        "381 NORTE",
        "381 SUL",
        "BETIM",
        "CONTAGEM",
        "SABARÁ",
      ];

      expect(REGIONAIS_SEED_DATA.map((r) => r.nome)).toEqual(expectedNomes);
      expect(REGIONAIS_SEED_DATA.map((r) => r.ordem)).toEqual(
        Array.from({ length: 18 }, (_, i) => i + 1)
      );
    });

    it("deve vincular bairros e cidades emblemáticos às suas respectivas regionais", () => {
      const centroSul = REGIONAIS_SEED_DATA.find((r) => r.nome === "CENTRO-SUL");
      const pampulha = REGIONAIS_SEED_DATA.find((r) => r.nome === "PAMPULHA");
      const oeste = REGIONAIS_SEED_DATA.find((r) => r.nome === "OESTE");
      const linhaVerde = REGIONAIS_SEED_DATA.find((r) => r.nome === "LINHA VERDE");
      const sul040 = REGIONAIS_SEED_DATA.find((r) => r.nome === "040 SUL");
      const betim = REGIONAIS_SEED_DATA.find((r) => r.nome === "BETIM");
      const contagem = REGIONAIS_SEED_DATA.find((r) => r.nome === "CONTAGEM");
      const sabara = REGIONAIS_SEED_DATA.find((r) => r.nome === "SABARÁ");

      expect(centroSul?.localidades.map((l) => l.nome)).toContain("Savassi");
      expect(centroSul?.localidades.map((l) => l.nome)).toContain("Lourdes");
      expect(centroSul?.localidades.map((l) => l.nome)).toContain("Barro Preto");
      expect(centroSul?.localidades.map((l) => l.nome)).toContain("Novo São Lucas");

      expect(pampulha?.localidades.map((l) => l.nome)).toContain("Castelo");
      expect(pampulha?.localidades.map((l) => l.nome)).toContain("Ouro Preto");

      expect(oeste?.localidades.map((l) => l.nome)).toContain("Buritis");
      expect(oeste?.localidades.map((l) => l.nome)).toContain("Gutierrez");

      expect(linhaVerde?.localidades.map((l) => l.nome)).toContain("Santa Luzia");
      expect(linhaVerde?.localidades.map((l) => l.nome)).toContain("Lagoa Santa");
      expect(linhaVerde?.localidades.map((l) => l.nome)).toContain("Vespasiano");

      expect(sul040?.localidades.map((l) => l.nome)).toContain("Nova Lima");
      expect(sul040?.localidades.map((l) => l.nome)).toContain("Alphaville Lagoa dos Ingleses");

      expect(betim?.localidades.map((l) => l.nome)).toEqual(["Betim"]);
      expect(contagem?.localidades.map((l) => l.nome)).toEqual(["Contagem"]);
      expect(sabara?.localidades.map((l) => l.nome)).toEqual(["Sabará"]);
    });

    it("slugifyRegionalText deve gerar slugs sem acentos e em minúsculas", () => {
      expect(slugifyRegionalText("CENTRO-SUL")).toBe("centro-sul");
      expect(slugifyRegionalText("São Cristóvão")).toBe("sao-cristovao");
      expect(slugifyRegionalText("Ápia")).toBe("apia");
      expect(slugifyRegionalText("040 NORTE")).toBe("040-norte");
    });
  });

  describe("Detecção Inteligente de Região / Localidade pelo Endereço", () => {
    it("deve detectar Savassi e classificar como CENTRO-SUL", () => {
      const match = matchRegionAndLocalityFromAddress(
        "Av. Getúlio Vargas, 1420 - Savassi, Belo Horizonte - MG, 30112-021"
      );
      expect(match.regionalNome).toBe("CENTRO-SUL");
      expect(match.localidadeNome).toBe("Savassi");
    });

    it("deve detectar Buritis e classificar como OESTE", () => {
      const match = matchRegionAndLocalityFromAddress(
        "Rua Mário Werneck, 1200 - Bairro Buritis - BH"
      );
      expect(match.regionalNome).toBe("OESTE");
      expect(match.localidadeNome).toBe("Buritis");
    });

    it("deve detectar Contagem e classificar como CONTAGEM", () => {
      const match = matchRegionAndLocalityFromAddress(
        "Av. João César de Oliveira, 2000, Contagem - MG"
      );
      expect(match.regionalNome).toBe("CONTAGEM");
      expect(match.localidadeNome).toBe("Contagem");
    });

    it("deve detectar Nova Lima e classificar como 040 SUL", () => {
      const match = matchRegionAndLocalityFromAddress(
        "Alameda da Serra, 800 - Vila da Serra, Nova Lima - MG"
      );
      expect(match.regionalNome).toBe("040 SUL");
      expect(match.localidadeNome).toBe("Nova Lima");
    });

    it("deve priorizar localidades mais longas para evitar falso positivo (ex: 'Novo São Lucas' antes de 'São Lucas')", () => {
      const match = matchRegionAndLocalityFromAddress(
        "Rua Principal, 50, Bairro Novo São Lucas, BH"
      );
      expect(match.localidadeNome).toBe("Novo São Lucas");
      expect(match.regionalNome).toBe("CENTRO-SUL");
    });

    it("deve retornar null para endereços que não batem com nenhuma localidade", () => {
      const match = matchRegionAndLocalityFromAddress(
        "Av. Beira Mar, 500 - Praia de Iracema, Fortaleza - CE"
      );
      expect(match.regionalNome).toBeNull();
      expect(match.localidadeNome).toBeNull();
    });
  });

  describe("Configuração de Status da Gestão de Entregas (Fase 2)", () => {
    it("status inicial 'pendente' deve ter rótulo oficial 'Aguardando atribuição'", () => {
      expect(DELIVERY_STATUS_CONFIG.pendente.label).toBe("Aguardando atribuição");
    });

    it("deve manter os 6 status operacionais em ordem", () => {
      expect(DELIVERY_STATUS_ORDER).toEqual([
        "pendente",
        "atribuido",
        "em_rota",
        "no_local",
        "entregue",
        "insucesso",
      ]);
      expect(SEM_REGIAO_LABEL).toBe("Sem região");
    });
  });

  describe("Serviços de Atualização de Região e Veículo (deliveryService.ts)", () => {
    it("updateDeliveryRegion deve persistir regional_id, localidade_id e regiao no Supabase", async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });

      (supabase.from as any).mockReturnValue({ update: updateMock });

      const res = await updateDeliveryRegion("order-123", {
        regional_id: "reg-1",
        localidade_id: "loc-1",
        regiao: "CENTRO-SUL",
      });

      expect(res.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith("orders");
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          regional_id: "reg-1",
          localidade_id: "loc-1",
          regiao: "CENTRO-SUL",
        })
      );
      expect(eqMock).toHaveBeenCalledWith("id", "order-123");
    });

    it("updateDeliveryVehicleType deve persistir tipo_veiculo_entrega no Supabase", async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });

      (supabase.from as any).mockReturnValue({ update: updateMock });

      const res = await updateDeliveryVehicleType("order-456", "carro");

      expect(res.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith("orders");
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo_veiculo_entrega: "carro",
        })
      );
      expect(eqMock).toHaveBeenCalledWith("id", "order-456");
    });
  });

  describe("Validação Estrutural da Migration SQL da Fase 2", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261125_fase2_regionais_localidades_e_gestao_entregas.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    it("deve criar as tabelas regionais e localidades com integridade referencial", () => {
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.regionais");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.localidades");
      expect(sql).toContain("REFERENCES public.regionais(id) ON DELETE CASCADE");
    });

    it("deve adicionar colunas regional_id, localidade_id, regiao e tipo_veiculo_entrega em orders", () => {
      expect(sql).toContain("ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS regional_id");
      expect(sql).toContain("ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS localidade_id");
      expect(sql).toContain("ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS regiao");
      expect(sql).toContain("ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tipo_veiculo_entrega");
      expect(sql).toContain("orders_tipo_veiculo_entrega_check");
    });

    it("deve conter permissão RLS is_regionais_admin e seed das 18 regionais", () => {
      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.is_regionais_admin");
      expect(sql).toContain("CENTRO-SUL");
      expect(sql).toContain("PAMPULHA");
      expect(sql).toContain("LINHA VERDE");
      expect(sql).toContain("BETIM");
      expect(sql).toContain("CONTAGEM");
      expect(sql).toContain("SABARÁ");
    });
  });
});
