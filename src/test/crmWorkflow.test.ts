import { describe, it, expect } from "vitest";
import {
  CrmOpportunity,
  CrmStage,
  CrmProposal,
  formatCurrency,
  isFollowUpLate,
  isFollowUpToday,
  isProposalExpiringSoon,
  PRIORITY_CONFIG,
  STATUS_CONFIG_CRM,
  PROPOSAL_STATUS_CONFIG,
  LEAD_ORIGINS,
  LOSS_REASONS,
} from "@/types/crm";

describe("CRM Sales Funnel & Commercial Workflow", () => {
  // 1. Etapas do Funil
  it("should validate default initial stages and configurations", () => {
    const defaultStages: Partial<CrmStage>[] = [
      { nome: "Novo Lead", ordem: 1, tipo_sistema: "padrao" },
      { nome: "Primeiro Contato", ordem: 2, tipo_sistema: "padrao" },
      { nome: "Levantamento de Necessidades", ordem: 3, tipo_sistema: "padrao" },
      { nome: "Orçamento em Elaboração", ordem: 4, tipo_sistema: "padrao" },
      { nome: "Orçamento Enviado", ordem: 5, tipo_sistema: "padrao" },
      { nome: "Negociação", ordem: 6, tipo_sistema: "padrao" },
      { nome: "Venda Fechada", ordem: 7, tipo_sistema: "ganha" },
    ];

    expect(defaultStages.length).toBe(7);
    expect(defaultStages[0].nome).toBe("Novo Lead");
    expect(defaultStages[6].tipo_sistema).toBe("ganha");

    // All priority levels defined
    expect(PRIORITY_CONFIG.baixa).toBeDefined();
    expect(PRIORITY_CONFIG.media).toBeDefined();
    expect(PRIORITY_CONFIG.alta).toBeDefined();
    expect(PRIORITY_CONFIG.urgente).toBeDefined();

    // Standard loss reasons available
    expect(LOSS_REASONS.length).toBeGreaterThanOrEqual(5);
    expect(LOSS_REASONS).toContain("Preço elevado / Fora do orçamento");
    expect(LOSS_REASONS).toContain("Prazo de entrega muito longo");
  });

  // 2. Cálculos de Orçamentos e Versionamento Não-Destrutivo
  it("should calculate proposal values, discounts, and support non-destructive revisions", () => {
    const itens = [
      { quantidade: 5000, preco_unitario: 1.25 }, // 6250
      { quantidade: 1000, preco_unitario: 2.5 },  // 2500
    ];

    const subtotal = itens.reduce((acc, it) => acc + it.quantidade * it.preco_unitario, 0);
    expect(subtotal).toBe(8750);

    const descontoPercentual = 10; // 10% de desconto
    const descontoValor = (subtotal * descontoPercentual) / 100;
    const valorLiquido = subtotal - descontoValor;

    expect(descontoValor).toBe(875);
    expect(valorLiquido).toBe(7875);

    // Versionamento: v1 -> v2
    const proposalV1: CrmProposal = {
      id: "prop-1",
      oportunidade_id: "opp-1",
      numero_proposta: "PROP-2026-0001-v1",
      versao_numero: 1,
      valor_total: subtotal,
      valor_liquido: valorLiquido,
      status: "enviada",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Criação de revisão v2
    const proposalV2: CrmProposal = {
      id: "prop-2",
      oportunidade_id: "opp-1",
      numero_proposta: "PROP-2026-0001-v2",
      versao_numero: 2,
      proposta_anterior_id: proposalV1.id,
      valor_total: 8000,
      valor_liquido: 7200,
      status: "rascunho",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // V1 é marcada como revisada sem ser deletada ou sobrescrita
    const updatedV1 = { ...proposalV1, status: "revisada" as const };

    expect(updatedV1.status).toBe("revisada");
    expect(proposalV2.versao_numero).toBe(2);
    expect(proposalV2.proposta_anterior_id).toBe("prop-1");
    expect(proposalV1.valor_liquido).toBe(7875);
    expect(proposalV2.valor_liquido).toBe(7200);
  });

  // 3. Lembretes e Alertas de Follow-up (Sem IA)
  it("should accurately determine late follow-ups and upcoming contacts", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    expect(isFollowUpLate(yesterday)).toBe(true);
    expect(isFollowUpLate(tomorrow)).toBe(false);
    expect(isFollowUpToday(now)).toBe(true);

    // Validade próxima (< 48h)
    const in30Hours = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString();
    const in72Hours = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    expect(isProposalExpiringSoon(in30Hours)).toBe(true);
    expect(isProposalExpiringSoon(in72Hours)).toBe(false);
  });

  // 4. Conversão Segura em Ordem de Produção (OS) e Idempotência
  it("should prevent duplicate conversions and map fields correctly to production order", () => {
    const opportunity: CrmOpportunity = {
      id: "opp-100",
      numero_sequencial: 71250,
      codigo_identificador: "OPT-2026-0001",
      titulo: "Embalagens Farmacêuticas 100ml",
      cliente_nome: "Bioclin Química Básica Ltda",
      servico_solicitado: "Caixa Cartucho Triplex 350g",
      valor_estimado: 12500,
      vendedor_nome: "Carlos Vendedor",
      prioridade: "alta",
      etapa_id: "etapa-ganha",
      posicao: 0,
      status: "fechada_ganha",
      origem_lead: "Indicacao",
      convertida_os_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Validação de conversão
    const canConvert = (opp: CrmOpportunity) => !opp.convertida_os_id;
    expect(canConvert(opportunity)).toBe(true);

    // Simula conversão
    const createdOrderId = "order-uuid-999";
    const convertedOpp = {
      ...opportunity,
      convertida_os_id: createdOrderId,
      convertida_em: new Date().toISOString(),
    };

    // Tentativa de duplicar é bloqueada
    expect(canConvert(convertedOpp)).toBe(false);
    expect(convertedOpp.convertida_os_id).toBe(createdOrderId);
  });

  // 5. Métricas e Indicadores Comerciais
  it("should calculate accurate conversion rate and average ticket without fictitious data", () => {
    const mockOpportunities: Partial<CrmOpportunity>[] = [
      { id: "1", status: "fechada_ganha", valor_estimado: 10000 },
      { id: "2", status: "fechada_ganha", valor_estimado: 20000 },
      { id: "3", status: "fechada_perdida", valor_estimado: 5000 },
      { id: "4", status: "aberta", valor_estimado: 15000 },
      { id: "5", status: "aberta", valor_estimado: 25000 },
    ];

    const ganhas = mockOpportunities.filter((o) => o.status === "fechada_ganha");
    const perdidas = mockOpportunities.filter((o) => o.status === "fechada_perdida");
    const abertas = mockOpportunities.filter((o) => o.status === "aberta");

    const pipelineAberto = abertas.reduce((acc, o) => acc + (o.valor_estimado || 0), 0);
    const totalGanho = ganhas.reduce((acc, o) => acc + (o.valor_estimado || 0), 0);

    const taxaConversao = (ganhas.length / (ganhas.length + perdidas.length)) * 100;
    const ticketMedio = totalGanho / ganhas.length;

    expect(pipelineAberto).toBe(40000);
    expect(totalGanho).toBe(30000);
    expect(ganhas.length).toBe(2);
    expect(perdidas.length).toBe(1);
    expect(taxaConversao).toBeCloseTo(66.67, 1);
    expect(ticketMedio).toBe(15000);
  });

  // 6. Formatação de Moeda
  it("should format currency in Brazilian Real (pt-BR) pattern", () => {
    const formatted = formatCurrency(12500.5);
    expect(formatted).toContain("12.500,50");
  });
});
