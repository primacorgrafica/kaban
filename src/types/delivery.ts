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
  user_id: string;
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

export const DELIVERY_STATUS_CONFIG: Record<
  DeliveryStatus,
  {
    label: string;
    badgeClass: string;
    borderClass: string;
  }
> = {
  pendente: {
    label: "Pendente",
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
