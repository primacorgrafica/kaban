export type DeliveryStatus =
  | "pendente"
  | "atribuido"
  | "em_rota"
  | "no_local"
  | "entregue"
  | "insucesso";

export type EntregadorStatus = "disponivel" | "em_entrega" | "offline";

export type RotaId = "1" | "2" | "3" | "4" | "5" | "6" | "RETIRA";

export type VeiculoCategoria = "moto" | "carro";

export const VEICULO_CATEGORIAS: { id: VeiculoCategoria; label: string }[] = [
  { id: "moto", label: "Moto" },
  { id: "carro", label: "Carro" },
];

export const EXPEDICAO_AREAS = [
  { id: "gestao_entregas", label: "Gestão de Entregas", path: "/entregas" },
  { id: "rotas", label: "Rotas", path: "/expedicao/rotas" },
  { id: "entregadores", label: "Cadastro de Entregadores", path: "/expedicao/entregadores" },
] as const;

/**
 * Normaliza uma placa brasileira removendo espaços/traços e convertendo para maiúsculas.
 * Formato antigo (7 chars com 4 dígitos finais) recebe hífen opcional na exibição: AAA-0000.
 * Formato Mercosul mantém 7 caracteres contínuos: AAA0A00.
 */
export function normalizeBrazilianPlate(raw: string): string {
  const clean = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  if (/^[A-Z]{3}[0-9]{4}$/.test(clean)) {
    return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  }
  return clean;
}

/**
 * Valida placa brasileira no padrão antigo (AAA-0000 / AAA0000) ou Mercosul (AAA0A00).
 */
export function isValidBrazilianPlate(plate: string): boolean {
  const clean = (plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}([0-9]{4}|[0-9][A-Z][0-9]{2})$/.test(clean);
}

export type MotivoPausaRota =
  | "sinistro"
  | "pneu_furado"
  | "defeito_mecanico"
  | "saude"
  | "excedeu_jornada"
  | "problema_via"
  | "mau_tempo"
  | "outro";

export const MOTIVOS_PAUSA_CONFIG: Record<
  MotivoPausaRota,
  { label: string; icon: string; descricao: string }
> = {
  sinistro: {
    label: "Sinistro / Acidente",
    icon: "ShieldAlert",
    descricao: "Acidente de trânsito ou ocorrência na via",
  },
  pneu_furado: {
    label: "Pneu Furado",
    icon: "Disc",
    descricao: "Manutenção de pneu furado ou calibragem",
  },
  defeito_mecanico: {
    label: "Defeito Mecânico",
    icon: "Wrench",
    descricao: "Pane no veículo ou parte elétrica",
  },
  saude: {
    label: "Problema de Saúde",
    icon: "HeartPulse",
    descricao: "Indisposição física ou atendimento de saúde",
  },
  excedeu_jornada: {
    label: "Excedeu Jornada",
    icon: "Clock",
    descricao: "Limite de tempo de trabalho ou intervalo obrigatório",
  },
  problema_via: {
    label: "Problema na Via",
    icon: "AlertTriangle",
    descricao: "Obras, alagamento, manifestação ou interdição",
  },
  mau_tempo: {
    label: "Mau Tempo",
    icon: "CloudRain",
    descricao: "Chuva torrencial, temporal ou risco climático",
  },
  outro: {
    label: "Outro Motivo",
    icon: "HelpCircle",
    descricao: "Outro imprevisto (especificar na observação)",
  },
};

export const ROTAS_DISPONIVEIS: { id: RotaId; label: string; isRetira?: boolean }[] = [
  { id: "1", label: "Rota 1" },
  { id: "2", label: "Rota 2" },
  { id: "3", label: "Rota 3" },
  { id: "4", label: "Rota 4" },
  { id: "5", label: "Rota 5" },
  { id: "6", label: "Rota 6" },
  { id: "RETIRA", label: "RETIRA", isRetira: true },
];

export interface Entregador {
  id: string;
  user_id: string | null;
  nome_completo: string;
  sobrenome?: string | null;
  telefone: string | null;
  placa_veiculo: string | null;
  modelo_veiculo: string | null;
  documento_identificacao?: string | null;
  categoria_veiculo?: VeiculoCategoria;
  observacoes?: string | null;
  rota_atribuida?: RotaId | null;
  ativo: boolean;
  status?: EntregadorStatus;
  latitude?: number | null;
  longitude?: number | null;
  precisao_metros?: number | null;
  velocidade_kmh?: number | null;
  bateria_percentual?: number | null;
  ultima_atividade?: string | null;
  criado_por?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
}

export interface OsrmRouteResult {
  distanceKm: number;
  durationMinutes: number;
  geometry: [number, number][]; // [latitude, longitude] formatado para o Leaflet
}

export interface EntregadorPosicao {
  id: string;
  entregador_id: string;
  order_id: string | null;
  latitude: number;
  longitude: number;
  precisao_metros: number | null;
  velocidade_kmh: number | null;
  bateria_percentual: number | null;
  created_at: string;
}

export const DELIVERY_STATUS_ORDER: DeliveryStatus[] = [
  "pendente",
  "atribuido",
  "em_rota",
  "no_local",
  "entregue",
  "insucesso",
];

export const SEM_REGIAO_LABEL = "Sem região";

export type LocalidadeTipo = "bairro" | "cidade";

export interface Regional {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  ordem: number;
  created_at: string;
  updated_at: string;
}

export interface Localidade {
  id: string;
  regional_id: string;
  nome: string;
  tipo: LocalidadeTipo;
  slug: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocalidadeComRegional extends Localidade {
  regional?: Pick<Regional, "id" | "nome" | "slug" | "ativo" | "ordem"> | null;
}

export const DELIVERY_STATUS_CONFIG: Record<
  DeliveryStatus,
  {
    label: string;
    badgeClass: string;
    borderClass: string;
  }
> = {
  pendente: {
    label: "Aguardando atribuição",
    badgeClass: "bg-zinc-800/80 text-zinc-300 border-zinc-700",
    borderClass: "border-zinc-700",
  },
  atribuido: {
    label: "Atribuído",
    badgeClass: "bg-blue-900/60 text-blue-200 border-blue-700",
    borderClass: "border-blue-700",
  },
  em_rota: {
    label: "Em Rota",
    badgeClass: "bg-amber-900/60 text-amber-200 border-amber-700 animate-pulse",
    borderClass: "border-amber-600",
  },
  no_local: {
    label: "No Local",
    badgeClass: "bg-purple-900/60 text-purple-200 border-purple-700",
    borderClass: "border-purple-600",
  },
  entregue: {
    label: "Entregue",
    badgeClass: "bg-emerald-900/60 text-emerald-200 border-emerald-700",
    borderClass: "border-emerald-600",
  },
  insucesso: {
    label: "Insucesso",
    badgeClass: "bg-red-900/60 text-red-200 border-red-700",
    borderClass: "border-red-700",
  },
};

// =====================================================================================
// FASE 3: FUSÃO DE ORDENS DE SERVIÇO (MESMO CLIENTE)
// =====================================================================================

export interface MergeOrdersPayload {
  orderIds: string[];
  chosenAddress: string;
  chosenDate?: string | null;
  chosenVehicle?: VeiculoCategoria;
  paradaId?: string;
  regionalId?: string | null;
  localidadeId?: string | null;
  regionalNome?: string | null;
}

export interface DistinctAddressItem {
  address: string;
  orderIds: string[];
  orderTitles: string[];
}

export interface DistinctDateItem {
  rawDate: string;
  formatted: string;
  orderIds: string[];
  orderTitles: string[];
}

export interface MergeConflicts {
  hasAddressConflict: boolean;
  distinctAddresses: DistinctAddressItem[];
  hasDateConflict: boolean;
  distinctDates: DistinctDateItem[];
  clientName: string;
}

/**
 * Valida se todas as O.S. selecionadas para fusão pertencem rigorosamente ao mesmo cliente.
 */
export function validateSameClientForMerge(
  orders: Array<{ id: string; cliente: string; titulo: string }>
): { valid: boolean; clientName?: string; error?: string } {
  if (!orders || orders.length < 2) {
    return {
      valid: false,
      error: "Selecione ao menos 2 Ordens de Serviço para realizar a fusão.",
    };
  }

  const distinctClients = Array.from(
    new Set(orders.map((o) => (o.cliente || "").trim().toLowerCase()))
  ).filter(Boolean);

  if (distinctClients.length === 0) {
    return {
      valid: false,
      error: "As Ordens de Serviço selecionadas não possuem identificação de cliente.",
    };
  }

  if (distinctClients.length > 1) {
    const originalNames = Array.from(
      new Set(orders.map((o) => (o.cliente || "").trim()))
    ).join(", ");
    return {
      valid: false,
      error: `Fusão permitida apenas para o MESMO cliente. Clientes selecionados: ${originalNames}`,
    };
  }

  const clientName = orders[0].cliente.trim();
  return { valid: true, clientName };
}

/**
 * Detecta conflitos de endereço ou data de entrega entre as O.S. que serão fundidas.
 */
export function detectMergeConflicts(
  orders: Array<{
    id: string;
    titulo: string;
    cliente: string;
    entrega_endereco?: string | null;
    endereco_entrega?: string | null;
    entrega_data_limite?: string | null;
  }>
): MergeConflicts {
  const clientName = orders[0]?.cliente?.trim() || "";

  // 1. Mapeia endereços distintos
  const addressMap = new Map<string, { orderIds: string[]; orderTitles: string[] }>();
  orders.forEach((o) => {
    const addr = (o.entrega_endereco || o.endereco_entrega || "").trim();
    if (!addr) return;
    const existing = addressMap.get(addr) || { orderIds: [], orderTitles: [] };
    existing.orderIds.push(o.id);
    existing.orderTitles.push(o.titulo);
    addressMap.set(addr, existing);
  });

  const distinctAddresses: DistinctAddressItem[] = Array.from(addressMap.entries()).map(
    ([address, data]) => ({
      address,
      orderIds: data.orderIds,
      orderTitles: data.orderTitles,
    })
  );

  // 2. Mapeia datas de entrega distintas
  const dateMap = new Map<string, { orderIds: string[]; orderTitles: string[] }>();
  orders.forEach((o) => {
    const dt = (o.entrega_data_limite || "").trim();
    if (!dt) return;
    const existing = dateMap.get(dt) || { orderIds: [], orderTitles: [] };
    existing.orderIds.push(o.id);
    existing.orderTitles.push(o.titulo);
    dateMap.set(dt, existing);
  });

  const distinctDates: DistinctDateItem[] = Array.from(dateMap.entries()).map(
    ([rawDate, data]) => {
      let formatted = rawDate;
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          formatted = d.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      } catch {}
      return {
        rawDate,
        formatted,
        orderIds: data.orderIds,
        orderTitles: data.orderTitles,
      };
    }
  );

  return {
    hasAddressConflict: distinctAddresses.length > 1,
    distinctAddresses,
    hasDateConflict: distinctDates.length > 1,
    distinctDates,
    clientName,
  };
}

// =====================================================================================
// FASE 4: ROTAS, SEQUENCIAMENTO E BLOQUEIO PÓS-CHEGADA
// =====================================================================================

/**
 * Verifica se uma entrega/parada ainda pode ter sua rota ou sequência alterada.
 * Regra: Alteração permitida apenas até o entregador chegar ao local ('no_local') ou concluir ('entregue').
 */
export function canAlterRouteStop(statusEntrega?: string | null): boolean {
  return statusEntrega !== "no_local" && statusEntrega !== "entregue";
}

// =====================================================================================
// FASE 5: MOTIVOS DE INSUCESSO NA TELA DO ENTREGADOR
// =====================================================================================

export const INSUCESSO_MOTIVOS = [
  "Cliente ausente / estabelecimento fechado",
  "Endereço não localizado / número inexistente",
  "Destinatário recusou o recebimento",
  "Mercadoria avariada durante o transporte",
  "Horário comercial expirado",
  "Outro motivo (especificar nas observações)",
] as const;



