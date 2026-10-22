// ====================================================================
// PRIMACOR GRÁFICA - TIPOS E MODELOS DO CRM / FUNIL DE VENDAS
// ====================================================================

export type OpportunityPriority = "baixa" | "media" | "alta" | "urgente";

export type OpportunityStatus =
  | "aberta"
  | "fechada_ganha"
  | "fechada_perdida"
  | "cancelada"
  | "pausada";

export type LeadOrigin =
  | "Indicacao"
  | "Google/Site"
  | "WhatsApp"
  | "Telefone"
  | "Prospeccao Ativa"
  | "Balcao/Presencial"
  | "Evento/Feira"
  | "Base Antiga"
  | "Outros";

export type ActivityType =
  | "ligacao"
  | "whatsapp"
  | "email"
  | "reuniao"
  | "envio_amostra"
  | "followup_orcamento"
  | "visita"
  | "outro";

export type ActivityStatus = "pendente" | "concluido" | "cancelado";

export type ProposalStatus =
  | "rascunho"
  | "enviada"
  | "aguardando_aprovacao"
  | "aprovada"
  | "recusada"
  | "revisada";

export interface CrmStage {
  id: string;
  nome: string;
  ordem: number;
  cor: string;
  tipo_sistema: "padrao" | "ganha" | "perdida" | "cancelada";
  ativo: boolean;
  regras?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CrmClient {
  id: string;
  nome_fantasia: string;
  razao_social?: string | null;
  cnpj_cpf?: string | null;
  contato_principal?: string | null;
  cargo?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  cidade?: string | null;
  uf?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
  criado_por?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmOpportunity {
  id: string;
  numero_sequencial: number;
  codigo_identificador?: string | null;
  titulo: string;
  cliente_id?: string | null;
  cliente_nome: string;
  contato_nome?: string | null;
  contato_telefone?: string | null;
  contato_email?: string | null;
  origem_lead: LeadOrigin | string;
  servico_solicitado: string;
  descricao_necessidade?: string | null;
  valor_estimado: number;
  vendedor_id?: string | null;
  vendedor_nome?: string | null;
  prioridade: OpportunityPriority;
  etapa_id: string;
  posicao: number;
  status: OpportunityStatus;
  motivo_perda?: string | null;
  detalhes_motivo_perda?: string | null;
  prazo_fechamento_previsto?: string | null;
  proxima_acao_descricao?: string | null;
  proxima_acao_data?: string | null;
  data_ultimo_contato?: string | null;
  anexos?: Array<{ nome: string; url: string; tamanho?: number; tipo?: string }>;
  tags?: string[];
  arquivado?: boolean;
  convertida_os_id?: string | null;
  convertida_em?: string | null;
  criado_por?: string | null;
  atualizado_por?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmProposalItem {
  id: string;
  proposta_id: string;
  posicao: number;
  descricao_item: string;
  formato_aberto?: string | null;
  formato_fechado?: string | null;
  papel_substrato?: string | null;
  cores_impressao?: string | null;
  acabamentos_especiais?: string | null;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  created_at?: string;
}

export interface CrmProposal {
  id: string;
  oportunidade_id: string;
  numero_proposta: string;
  versao_numero: number;
  proposta_anterior_id?: string | null;
  valor_total: number;
  desconto_percentual?: number | null;
  desconto_valor?: number | null;
  valor_liquido: number;
  condicoes_pagamento?: string | null;
  prazo_producao_dias?: number | null;
  validade_dias?: number | null;
  data_validade?: string | null;
  data_envio?: string | null;
  status: ProposalStatus;
  observacoes?: string | null;
  criado_por?: string | null;
  created_at: string;
  updated_at: string;
  itens?: CrmProposalItem[];
}

export interface CrmActivity {
  id: string;
  oportunidade_id: string;
  tipo: ActivityType;
  titulo: string;
  descricao?: string | null;
  data_agendada: string;
  status: ActivityStatus;
  resultado?: string | null;
  responsavel_id?: string | null;
  responsavel_nome?: string | null;
  concluido_em?: string | null;
  created_at: string;
  updated_at: string;
  // Campos desnormalizados para visualização rápida
  oportunidade_titulo?: string;
  cliente_nome?: string;
}

export interface CrmHistoryEvent {
  id: string;
  oportunidade_id: string;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  tipo_evento: string;
  descricao: string;
  dados_anteriores?: any;
  dados_novos?: any;
  created_at: string;
}

// ====================================================================
// CONSTANTES E CONFIGURAÇÕES
// ====================================================================

export const LEAD_ORIGINS: { id: LeadOrigin; label: string }[] = [
  { id: "Indicacao", label: "Indicação de Cliente" },
  { id: "Google/Site", label: "Google / Site Institucional" },
  { id: "WhatsApp", label: "WhatsApp Comercial" },
  { id: "Telefone", label: "Contato Telefônico" },
  { id: "Prospeccao Ativa", label: "Prospecção Ativa (Outbound)" },
  { id: "Balcao/Presencial", label: "Balcão / Atendimento Presencial" },
  { id: "Evento/Feira", label: "Evento / Feira Gráfica" },
  { id: "Base Antiga", label: "Resgate de Base Antiga" },
  { id: "Outros", label: "Outros Canais" },
];

export const LOSS_REASONS = [
  "Preço elevado / Fora do orçamento",
  "Prazo de entrega muito longo",
  "Concorrente ganhou a cotação",
  "Especificação técnica inviável",
  "Projeto cancelado pelo cliente",
  "Cliente não respondeu contatos",
  "Condição de pagamento inadequada",
  "Problemas de frete / logística",
  "Outro motivo",
];

export const PRIORITY_CONFIG: Record<
  OpportunityPriority,
  { label: string; colorKey: string; badgeClass: string }
> = {
  baixa: {
    label: "Baixa",
    colorKey: "slate",
    badgeClass: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  },
  media: {
    label: "Média",
    colorKey: "blue",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  alta: {
    label: "Alta",
    colorKey: "amber",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  urgente: {
    label: "Urgente",
    colorKey: "rose",
    badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30 font-bold animate-pulse",
  },
};

export const STATUS_CONFIG_CRM: Record<
  OpportunityStatus,
  { label: string; badgeClass: string }
> = {
  aberta: {
    label: "Em Aberto",
    badgeClass: "bg-[#253745] text-[#CCD0CF] border-[#4A5C6A]",
  },
  fechada_ganha: {
    label: "Venda Fechada",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-bold",
  },
  fechada_perdida: {
    label: "Perdida",
    badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  },
  cancelada: {
    label: "Cancelada",
    badgeClass: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  },
  pausada: {
    label: "Em Espera",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
};

export const PROPOSAL_STATUS_CONFIG: Record<
  ProposalStatus,
  { label: string; badgeClass: string }
> = {
  rascunho: {
    label: "Rascunho",
    badgeClass: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  },
  enviada: {
    label: "Enviada ao Cliente",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  aguardando_aprovacao: {
    label: "Aguar. Aprovação",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  aprovada: {
    label: "Aprovada",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-bold",
  },
  recusada: {
    label: "Recusada",
    badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  },
  revisada: {
    label: "Revisada (Histórico)",
    badgeClass: "bg-purple-500/15 text-purple-400 border-purple-500/30 line-through opacity-75",
  },
};

export const ACTIVITY_TYPE_CONFIG: Record<
  ActivityType,
  { label: string; iconName: string; colorClass: string }
> = {
  ligacao: { label: "Ligação", iconName: "Phone", colorClass: "text-blue-400 bg-blue-500/10" },
  whatsapp: { label: "WhatsApp", iconName: "MessageCircle", colorClass: "text-emerald-400 bg-emerald-500/10" },
  email: { label: "E-mail", iconName: "Mail", colorClass: "text-purple-400 bg-purple-500/10" },
  reuniao: { label: "Reunião", iconName: "Users", colorClass: "text-amber-400 bg-amber-500/10" },
  envio_amostra: { label: "Amostra Gráfica", iconName: "Package", colorClass: "text-indigo-400 bg-indigo-500/10" },
  followup_orcamento: { label: "Follow-up Proposta", iconName: "FileCheck", colorClass: "text-[#CCD0CF] bg-[#253745]" },
  visita: { label: "Visita Presencial", iconName: "MapPin", colorClass: "text-orange-400 bg-orange-500/10" },
  outro: { label: "Outro Contato", iconName: "Calendar", colorClass: "text-slate-400 bg-slate-500/10" },
};

// ====================================================================
// FUNÇÕES AUXILIARES DE FORMATAÇÃO E STATUS
// ====================================================================

export function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === "number" ? value : Number(value) || 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
}

export function isFollowUpLate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const target = new Date(dateStr).getTime();
  const now = Date.now();
  return target < now;
}

export function isFollowUpToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

export function isProposalExpiringSoon(validadeStr: string | null | undefined): boolean {
  if (!validadeStr) return false;
  const validade = new Date(validadeStr).getTime();
  const now = Date.now();
  const diffHours = (validade - now) / (1000 * 60 * 60);
  return diffHours > 0 && diffHours <= 48; // Menos de 48 horas para vencer
}
