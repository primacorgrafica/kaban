export type InspecaoItemKey =
  | "etapas_executadas"
  | "qualidade_impressao"
  | "qualidade_acabamento"
  | "quantidade"
  | "rotulagem";

export type InspecaoItemStatus = "aprovado" | "aprovado_restricao" | "reprovado";

export interface InspecaoChecklistItem {
  status: InspecaoItemStatus;
  observacao?: string | null;
  avaliado_por?: string | null;
  avaliado_em?: string | null;
}

export type InspecaoChecklist = Partial<Record<InspecaoItemKey, InspecaoChecklistItem>>;

export interface InspecaoChecklistConfigItem {
  key: InspecaoItemKey;
  label: string;
  descricao: string;
}

export const INSPECAO_CHECKLIST_ITEMS: InspecaoChecklistConfigItem[] = [
  {
    key: "etapas_executadas",
    label: "Todas as etapas executadas",
    descricao: "",
  },
  {
    key: "qualidade_impressao",
    label: "Qualidade Impressão",
    descricao: "",
  },
  {
    key: "qualidade_acabamento",
    label: "Qualidade acabamento",
    descricao: "",
  },
  {
    key: "quantidade",
    label: "Quantidade",
    descricao: "",
  },
  {
    key: "rotulagem",
    label: "Rotulagem",
    descricao: "",
  },
];

export interface InspecaoFoto {
  id: string;
  nome_arquivo: string;
  web_url: string;
  sharepoint_item_id: string;
  sharepoint_folder_id?: string;
  tamanho_bytes?: number;
  created_at: string;
  criado_por?: string | null;
  thumbnail_url?: string;
  status?: "sincronizado" | "pendente_sharepoint";
  storage_path?: string;
}

export type InspecaoHistoryEventType =
  | "entrada"
  | "checklist_item"
  | "foto_anexada"
  | "foto_removida"
  | "parada"
  | "retomada"
  | "saida"
  | "envio_expedicao";

export interface InspecaoHistoryEntry {
  id: string;
  order_id: string;
  tipo_evento: InspecaoHistoryEventType;
  descricao: string;
  detalhes?: Record<string, any>;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  created_at: string;
}

export interface InspecaoValidationResult {
  canMoveToSaida: boolean;
  missingItems: string[];
  reprovedItems: string[];
  photoCount: number;
  hasRequiredPhotos: boolean;
  isChecklistComplete: boolean;
  hasReprovedItem: boolean;
  errorMessages: string[];
}

/**
 * Validador síncrono completo das regras da etapa Inspeção
 */
export function validateInspecaoConditions(
  checklist: InspecaoChecklist | null | undefined,
  fotos: InspecaoFoto[] | null | undefined
): InspecaoValidationResult {
  const missingItems: string[] = [];
  const reprovedItems: string[] = [];
  const errorMessages: string[] = [];

  const safeChk = checklist || {};
  const safeFotos = fotos || [];

  INSPECAO_CHECKLIST_ITEMS.forEach((cfg) => {
    const item = safeChk[cfg.key];
    if (!item || !item.status) {
      missingItems.push(cfg.label);
      errorMessages.push(`O item "${cfg.label}" não foi avaliado.`);
    } else if (item.status === "reprovado") {
      reprovedItems.push(cfg.label);
      errorMessages.push(`O item "${cfg.label}" está REPROVADO (deve permanecer em Inspeção ou ir para Parado).`);
    }
  });

  const photoCount = safeFotos.length;
  const hasRequiredPhotos = photoCount >= 1 && photoCount <= 5;

  if (photoCount < 1) {
    errorMessages.push("É obrigatório anexar no mínimo 1 foto da inspeção concluída no SharePoint (atualmente: 0/5).");
  } else if (photoCount > 5) {
    errorMessages.push(`Limite máximo de fotos excedido (máximo 5, atualmente: ${photoCount}/5).`);
  }

  const isChecklistComplete = missingItems.length === 0;
  const hasReprovedItem = reprovedItems.length > 0;

  const canMoveToSaida =
    isChecklistComplete &&
    !hasReprovedItem &&
    hasRequiredPhotos;

  return {
    canMoveToSaida,
    missingItems,
    reprovedItems,
    photoCount,
    hasRequiredPhotos,
    isChecklistComplete,
    hasReprovedItem,
    errorMessages,
  };
}
