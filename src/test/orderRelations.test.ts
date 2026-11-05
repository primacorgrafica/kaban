import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  cleanOsNumber,
  toRelatedOrderSummary,
  searchOrdersForRelation,
  getRelatedOrdersInfo,
  syncOrderRelations,
  getSectorRoute,
  getSectorFriendlyLabel,
  highlightOrderCard,
} from "@/lib/orderRelationsService";
import { INVALID_NOTIFICATION_EMAILS, isValidEmail } from "@/lib/sellerNotificationService";
import { Order } from "@/types/order";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

describe("Primacor Kaban - Vinculação de O.S. Relacionadas", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const mockChain: any = {
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
    };

    (supabase.from as any).mockReturnValue(mockChain);
  });

  const mockOrders: Order[] = [
    {
      id: "os-100",
      titulo: "#73400",
      cliente: "CLIENTE ALFA",
      descricao: "Caixa display personalizada",
      setor: "pre_impressao",
      status: "preparacao",
      arquivado: false,
      posicao: 0,
      prioridade: "normal",
      urgente: false,
      saida_direta: false,
      prova_digital: false,
      prova_email: false,
      urgente_prova: false,
      urgente_impressao: false,
      urgente_acabamento: false,
      urgente_expedicao: false,
      digital_color: false,
      digital_pb: false,
      equipamentos: [],
      acabamentos: [],
      processos: [],
      tipo_entrega: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      related_order_ids: ["os-200"],
    },
    {
      id: "os-200",
      titulo: "73401",
      cliente: "CLIENTE ALFA",
      descricao: "Manual de instruções",
      setor: "ctp",
      status: "ctp",
      arquivado: false,
      posicao: 1,
      prioridade: "normal",
      urgente: false,
      saida_direta: false,
      prova_digital: false,
      prova_email: false,
      urgente_prova: false,
      urgente_impressao: false,
      urgente_acabamento: false,
      urgente_expedicao: false,
      digital_color: false,
      digital_pb: false,
      equipamentos: [],
      acabamentos: [],
      processos: [],
      tipo_entrega: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      related_order_ids: ["os-100"],
    },
    {
      id: "os-300",
      titulo: "73402",
      cliente: "CLIENTE BETA",
      descricao: "Rótulo adesivo",
      setor: "digital",
      status: "impressao",
      arquivado: false,
      posicao: 2,
      prioridade: "alta",
      urgente: true,
      saida_direta: false,
      prova_digital: false,
      prova_email: false,
      urgente_prova: false,
      urgente_impressao: false,
      urgente_acabamento: false,
      urgente_expedicao: false,
      digital_color: false,
      digital_pb: false,
      equipamentos: [],
      acabamentos: [],
      processos: [],
      tipo_entrega: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      related_order_ids: [],
    },
  ];

  describe("1. toRelatedOrderSummary", () => {
    it("deve normalizar os dados resumidos e limpar o hash (#) do título da O.S.", () => {
      const summary = toRelatedOrderSummary(mockOrders[0]);
      expect(summary.id).toBe("os-100");
      expect(summary.titulo).toBe("73400"); // limpo de #
      expect(summary.cliente).toBe("CLIENTE ALFA");
      expect(summary.descricao).toBe("Caixa display personalizada");
      expect(summary.setor).toBe("pre_impressao");
      expect(summary.arquivado).toBe(false);
    });
  });

  describe("2. searchOrdersForRelation", () => {
    it("deve pesquisar por número da O.S., cliente e descrição sem incluir a própria O.S.", async () => {
      // Procura por cliente "ALFA" excluindo a O.S. "os-100"
      const res = await searchOrdersForRelation("ALFA", "os-100", mockOrders);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe("os-200");
      expect(res[0].titulo).toBe("73401");
    });

    it("deve pesquisar por termo da descrição", async () => {
      const res = await searchOrdersForRelation("manual", undefined, mockOrders);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe("os-200");
    });

    it("não deve permitir vincular uma O.S. a ela mesma", async () => {
      const res = await searchOrdersForRelation("73400", "os-100", mockOrders);
      expect(res.some((r) => r.id === "os-100")).toBe(false);
    });
  });

  describe("3. getRelatedOrdersInfo", () => {
    it("deve retornar informações corretas a partir dos IDs em memória", async () => {
      const info = await getRelatedOrdersInfo(["os-100", "os-200"], mockOrders);
      expect(info).toHaveLength(2);
      expect(info.map((i) => i.id)).toContain("os-100");
      expect(info.map((i) => i.id)).toContain("os-200");
    });

    it("deve buscar no banco caso não esteja em memória", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [
            {
              id: "os-999",
              titulo: "99999",
              cliente: "CLIENTE REMOTO",
              descricao: "Trabalho especial",
              setor: "qualidade",
              status: "inspecao",
              arquivado: false,
            },
          ],
          error: null,
        }),
      });

      (supabase.from as any).mockReturnValue({ select: mockSelect });

      const info = await getRelatedOrdersInfo(["os-999"], mockOrders);
      expect(info).toHaveLength(1);
      expect(info[0].id).toBe("os-999");
      expect(info[0].cliente).toBe("CLIENTE REMOTO");
    });
  });

  describe("4. syncOrderRelations (Bidirecionalidade e Integridade)", () => {
    it("deve garantir bidirecionalidade: se A vincula B, B passa a ter A vinculado", async () => {
      const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { related_order_ids: [] },
          }),
        }),
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "orders") {
          return {
            update: mockUpdate,
            select: mockSelect,
          };
        }
        if (table === "order_relations") {
          return {
            upsert: mockUpsert,
            delete: vi.fn().mockReturnValue({ or: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        return {};
      });

      // Vincula "os-300" a "os-100"
      const result = await syncOrderRelations("os-300", ["os-100"], "user-1", []);

      expect(result).toEqual(["os-100"]);
      // Verifica atualização da O.S. principal
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ related_order_ids: ["os-100"] })
      );
      // Verifica upsert bidirecional na tabela order_relations
      expect(mockUpsert).toHaveBeenCalledWith(
        [
          { order_id: "os-300", related_order_id: "os-100", created_by: "user-1" },
          { order_id: "os-100", related_order_id: "os-300", created_by: "user-1" },
        ],
        { onConflict: "order_id,related_order_id" }
      );
    });

    it("deve remover bidirecionalmente: se A desvincula B, B remove A de seus relacionados", async () => {
      const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      const mockDelete = vi.fn().mockReturnValue({ or: vi.fn().mockResolvedValue({ error: null }) });
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { related_order_ids: ["os-100", "os-200"] },
          }),
        }),
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "orders") {
          return {
            update: mockUpdate,
            select: mockSelect,
          };
        }
        if (table === "order_relations") {
          return {
            delete: mockDelete,
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      // os-100 tinha os-200, agora passará a ter array vazio []
      const result = await syncOrderRelations("os-100", [], "user-1", ["os-200"]);

      expect(result).toEqual([]);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ related_order_ids: [] })
      );
      expect(mockDelete).toHaveBeenCalled();
    });

    it("não deve permitir auto-vínculo nem IDs duplicados", async () => {
      const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      (supabase.from as any).mockReturnValue({
        update: mockUpdate,
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      });

      const result = await syncOrderRelations("os-100", ["os-100", "os-200", "os-200"], "user-1", []);
      // "os-100" é filtrado por ser a própria O.S., e "os-200" vira único
      expect(result).toEqual(["os-200"]);
    });
  });

  describe("5. Rotas de Setor e Rótulos Amigáveis", () => {
    it("deve mapear os setores para as rotas corretas", () => {
      expect(getSectorRoute("ctp")).toBe("/ctp");
      expect(getSectorRoute("digital")).toBe("/digital");
      expect(getSectorRoute("qualidade")).toBe("/qualidade");
      expect(getSectorRoute("expedicao")).toBe("/expedicao");
      expect(getSectorRoute("compras")).toBe("/compras");
      expect(getSectorRoute("manutencao")).toBe("/manutencao");
      expect(getSectorRoute("pre_impressao")).toBe("/");
      expect(getSectorRoute(null, true)).toBe("/arquivados");
    });

    it("deve fornecer rótulos amigáveis para exibição ao usuário", () => {
      expect(getSectorFriendlyLabel("ctp")).toBe("CTP");
      expect(getSectorFriendlyLabel("digital")).toBe("Digital");
      expect(getSectorFriendlyLabel("qualidade")).toBe("Qualidade");
      expect(getSectorFriendlyLabel("compras")).toBe("Compras");
      expect(getSectorFriendlyLabel(null, true)).toBe("O.S. Concluída / Arquivada");
    });
  });

  describe("6. highlightOrderCard", () => {
    it("deve aplicar classes de destaque no elemento DOM correspondente", () => {
      const mockElement = document.createElement("div");
      mockElement.id = "order-card-os-100";
      mockElement.scrollIntoView = vi.fn();
      document.body.appendChild(mockElement);

      const success = highlightOrderCard("os-100");
      expect(success).toBe(true);
      expect(mockElement.scrollIntoView).toHaveBeenCalled();
      expect(mockElement.classList.contains("ring-amber-500")).toBe(true);

      document.body.removeChild(mockElement);
    });

    it("deve retornar false se o elemento não for encontrado no DOM", () => {
      const success = highlightOrderCard("os-inexistente");
      expect(success).toBe(false);
    });
  });

  describe("7. Prevenção de Bounces de E-mail (coordenadorpre)", () => {
    it("deve rejeitar coordenadorpre@primacorgrafica.com.br na validação de e-mails", () => {
      expect(INVALID_NOTIFICATION_EMAILS.has("coordenadorpre@primacorgrafica.com.br")).toBe(true);
      expect(isValidEmail("coordenadorpre@primacorgrafica.com.br")).toBe(false);
      expect(isValidEmail("COORDENADORPRE@PRIMACORGRAFICA.COM.BR ")).toBe(false);
    });

    it("deve aceitar e-mails válidos reais", () => {
      expect(isValidEmail("carlos@primacorgrafica.com.br")).toBe(true);
      expect(isValidEmail("bianca@primacorgrafica.com.br")).toBe(true);
      expect(isValidEmail("well@primacorgrafica.com.br")).toBe(true);
    });
  });

  describe("8. RelatedOrdersPopover e cleanOsNumber", () => {
    it("cleanOsNumber deve extrair corretamente os dígitos numéricos ou sanitizar a O.S.", () => {
      expect(cleanOsNumber("#73438")).toBe("73438");
      expect(cleanOsNumber("O.S. 73400")).toBe("73400");
      expect(cleanOsNumber("73401")).toBe("73401");
      expect(cleanOsNumber("")).toBe("");
      expect(cleanOsNumber(null)).toBe("");
    });

    it("RelatedOrdersPopover.tsx deve importar cleanOsNumber para evitar ReferenceError na renderização do card", () => {
      const popoverFile = fs.readFileSync(
        path.join(__dirname, "../components/orders/RelatedOrdersPopover.tsx"),
        "utf-8"
      );
      expect(popoverFile).toContain("cleanOsNumber");
      expect(popoverFile).toMatch(/import\s*\{[^}]*cleanOsNumber[^}]*\}\s*from/);
    });
  });
});
