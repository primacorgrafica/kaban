export type OrderStatus = "fila_de_entrada" | "aguardando_novo_arquivo" | "preparando_arquivo" | "operador_2" | "operador_3" | "aguardando_prova" | "aguardando_aprovacao" | "arquivo_liberado";

// OrderPriority kept for backward compatibility with DB column
export type OrderPriority = "normal" | "media" | "alta";

export interface Order {
  id: string;
  titulo: string;
  descricao: string;
  cliente: string;
  observacao: string | null;
  status: OrderStatus;
  arquivado: boolean;
  criado_por: string | null;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
  posicao: number;
  saida_direta: boolean;
  prova_digital: boolean;
  prova_email: boolean;
  prioridade: OrderPriority;
  endereco_entrega: string | null;
  destinatario: string | null;
  entregue_para: string | null;
  entregue_por: string | null;
  entregue_em: string | null;
  urgente: boolean;
  digital_color: boolean;
  digital_pb: boolean;
  urgente_prova: boolean;
  urgente_impressao: boolean;
  urgente_acabamento: boolean;
  urgente_expedicao: boolean;
  prazo: string | null;
  setor: string | null;
  setor_status: string;
  maquina: string | null;
  pausado: boolean;
  pausado_em: string | null;
  tempo_pausado_ms: number;
  vendedor: string | null;
  tipo_trabalho: string | null;
  equipamentos: string[];
  acabamentos: string[];
  processos: string[];
  nf: string | null;
  protocolo: string | null;
  empresa_entrega: string | null;
  obs_entrega: string | null;
  obs_prova: string | null;
  parent_order_id: string | null;
  // New ENTREGA fields
  tipo_entrega: string[];
  entrega_para: string | null;
  entrega_endereco: string | null;
  entrega_ac: string | null;
  entrega_data_limite: string | null;
  // Faturamento fields
  fat_cnpj_ok: boolean;
  fat_cnpj_obs: string | null;
  fat_retencao_iss_ok: boolean;
  fat_retencao_iss_obs: string | null;
  fat_retencoes_federais_ok: boolean;
  fat_retencoes_federais_obs: string | null;
  fat_limite_emissao_ok: boolean;
  fat_limite_emissao_obs: string | null;
  fat_envio_nf_ok: boolean;
  fat_envio_nf_obs: string | null;
  fat_ocpp_ok: boolean;
  fat_ocpp_obs: string | null;
  fat_restricao_credito_ok: boolean;
  fat_restricao_credito_obs: string | null;
  fat_cnpj_pendente: boolean;
  fat_retencao_iss_pendente: boolean;
  fat_retencoes_federais_pendente: boolean;
  fat_limite_emissao_pendente: boolean;
  fat_envio_nf_pendente: boolean;
  fat_ocpp_pendente: boolean;
  fat_restricao_credito_pendente: boolean;
  // Manutenção fields
  om_numero: number | null;
  categoria_manut: string | null;
  equipamento_manut: string | null;
  setor_manut: string | null;
  solucao: string | null;
  fornecedor_manut: string | null;
  endereco_manut: string | null;
  responsavel_manut: string | null;
  // Compras fields
  oc_numero: number | null;
  categoria_compra: string | null;
  responsavel_compra: string | null;
  fornecedor_compra: string | null;
  vendedor_compra: string | null;
  endereco_compra: string | null;
  // Não Conformidade fields
  nc_numero: number | null;
  reclamante_nc: string | null;
  categoria_nc: string | null;
  endereco_nc: string | null;
  os_ref_nc: string | null;
}

export interface Profile {
  id: string;
  user_id: string;
  nome: string;
  created_at: string;
}

export const STATUS_CONFIG: Record<OrderStatus, { label: string; colorKey: string }> = {
  fila_de_entrada: { label: "Entrada", colorKey: "entrada" },
  aguardando_novo_arquivo: { label: "Preparação", colorKey: "revisao" },
  preparando_arquivo: { label: "Operador 1", colorKey: "novo" },
  operador_2: { label: "Operador 2", colorKey: "novo" },
  operador_3: { label: "Operador 3", colorKey: "novo" },
  aguardando_prova: { label: "Produzindo Prova", colorKey: "andamento" },
  aguardando_aprovacao: { label: "Aguar. Aprovação", colorKey: "aguardando" },
  arquivo_liberado: { label: "Saída", colorKey: "concluido" },
};

export const STATUS_ORDER: OrderStatus[] = [
  "fila_de_entrada",
  "aguardando_novo_arquivo",
  "aguardando_prova",
  "aguardando_aprovacao",
  "arquivo_liberado",
];
