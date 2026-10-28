export type DeliveryStatus =
  | "pendente"
  | "atribuido"
  | "em_rota"
  | "no_local"
  | "entregue"
  | "insucesso";

export interface Entregador {
  id: string;
  user_id: string;
  nome_completo: string;
  telefone: string | null;
  placa_veiculo: string | null;
  modelo_veiculo: string | null;
  ativo: boolean;
  criado_por?: string | null;
  created_at: string;
  updated_at: string;
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
