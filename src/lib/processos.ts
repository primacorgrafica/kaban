import { format } from "date-fns";

export interface ProcessoItem {
  sigla: string;
  cor: string;
}

export function parseSafeDate(val: string | number | Date | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (/^\d{10,}$/.test(trimmed)) {
      const num = Number(trimmed);
      const d = new Date(num);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatSafeDate(
  dateVal: string | number | Date | null | undefined,
  formatStr: string,
  options?: any
): string | null {
  const d = parseSafeDate(dateVal);
  if (!d) return null;
  try {
    return format(d, formatStr, options);
  } catch {
    return null;
  }
}

export interface ProcessoGroup {
  label: string;
  items: ProcessoItem[];
}

// ═══ IMPRESSÃO ═══
// Opções não excludentes de tipo de impressão
export const IMPRESSAO_TIPOS: ProcessoItem[] = [
  { sigla: "CMYK", cor: "bg-blue-100 text-blue-800 border-blue-300" },
  { sigla: "CMYK+IR", cor: "bg-blue-100 text-blue-800 border-blue-300" },
  { sigla: "CMYK+VM", cor: "bg-blue-100 text-blue-800 border-blue-300" },
  { sigla: "PANTONE", cor: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800" },
];

// Processos de impressão (badges)
export const IMPRESSAO_PROCESSOS: ProcessoItem[] = [
  { sigla: "DIG", cor: "bg-green-100 text-green-800 border-green-300" },
  { sigla: "PLO", cor: "bg-green-100 text-green-800 border-green-300" },
  { sigla: "CTP", cor: "bg-sky-200 text-sky-900 border-sky-400" },
  { sigla: "OFF", cor: "bg-blue-700 text-white border-blue-900" },
];

// ═══ ACABAMENTOS ═══
// Tipos excludentes de acabamento (radio)
export const ACABAMENTO_TIPOS = ["Promocional", "Editorial", "Embalagem"] as const;
export type AcabamentoTipo = typeof ACABAMENTO_TIPOS[number];

// Processos de acabamento (badges)
export const ACABAMENTO_GROUPS: ProcessoGroup[] = [
  {
    label: "",
    items: [
      { sigla: "GUI", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
      { sigla: "LAM", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
      { sigla: "CAP", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
      { sigla: "VIN", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
      { sigla: "DOB", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
      { sigla: "ALC", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
      { sigla: "PUR", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
      { sigla: "ENC", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
    ],
  },
  {
    label: "",
    items: [
      { sigla: "MAN", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
      { sigla: "SHE", cor: "bg-red-200 text-red-900 border-red-400" },
      { sigla: "SEL", cor: "bg-red-200 text-red-900 border-red-400" },
      { sigla: "HOT", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
      { sigla: "CVM", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
      { sigla: "CVA", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
      { sigla: "DES", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
      { sigla: "CAR", cor: "bg-yellow-200 text-yellow-900 border-yellow-400" },
    ],
  },
  {
    label: "",
    items: [
      { sigla: "UV", cor: "bg-purple-100 text-purple-800 border-purple-300" },
      { sigla: "PLA", cor: "bg-purple-100 text-purple-800 border-purple-300" },
      { sigla: "COS", cor: "bg-purple-100 text-purple-800 border-purple-300" },
      { sigla: "WIR", cor: "bg-purple-100 text-purple-800 border-purple-300" },
      { sigla: "FEC", cor: "bg-purple-100 text-purple-800 border-purple-300" },
      { sigla: "CX", cor: "bg-purple-100 text-purple-800 border-purple-300" },
      { sigla: "NUM", cor: "bg-purple-100 text-purple-800 border-purple-300" },
      { sigla: "OUT", cor: "bg-purple-100 text-purple-800 border-purple-300" },
    ],
  },
];

// Legacy compat: PROCESSO_GROUPS combines all for display elsewhere
export const PROCESSO_GROUPS: ProcessoGroup[] = [
  { label: "", items: [...IMPRESSAO_PROCESSOS] },
  ...ACABAMENTO_GROUPS,
];

export const ALL_PROCESSOS = [
  ...IMPRESSAO_TIPOS,
  ...IMPRESSAO_PROCESSOS,
  ...ACABAMENTO_GROUPS.flatMap((g) => g.items),
];

export function getProcessoCor(sigla: string): string {
  const found = ALL_PROCESSOS.find((p) => p.sigla === sigla);
  return found?.cor || "bg-muted text-muted-foreground border-border";
}

// ═══ SUPRIMENTOS & PROCESSOS ESPECIAIS (CLICHÊ - FACA - FILME - PANTONE - OUTROS) ═══
export const SPECIAL_SUPPLIES = [
  { id: "CLICHE", label: "CLICHÊ", alt: ["CLICHE", "CLICHÊ", "cliche", "clichê"] },
  { id: "FACA", label: "FACA", alt: ["FACA", "faca"] },
  { id: "FILME", label: "FILME", alt: ["FILME", "filme"] },
  { id: "PANTONE", label: "PANTONE", alt: ["PANTONE", "pantone"] },
  { id: "OUTROS", label: "OUTROS", alt: ["OUTROS", "outros"] },
] as const;

export type SpecialSupplyId = "CLICHE" | "FACA" | "FILME" | "PANTONE" | "OUTROS";

export function isSpecialSupplyActive(processos: string[] | undefined | null, id: SpecialSupplyId): boolean {
  if (!processos || !Array.isArray(processos)) return false;
  const config = SPECIAL_SUPPLIES.find((s) => s.id === id);
  if (!config) return false;
  return config.alt.some((name) =>
    processos.some((p) => p === name || p.startsWith(`${name}:`))
  );
}

export function isSpecialSupplySent(processos: string[] | undefined | null, id: SpecialSupplyId): boolean {
  if (!processos || !Array.isArray(processos)) return false;
  const config = SPECIAL_SUPPLIES.find((s) => s.id === id);
  if (!config) return false;
  return config.alt.some((name) =>
    processos.some(
      (p) =>
        p === `${name}:enviado` ||
        p.startsWith(`${name}:enviado:`) ||
        p === `${name}:recebido` ||
        p.startsWith(`${name}:recebido:`) ||
        p === `${name}:chegou` ||
        p.startsWith(`${name}:chegou:`) ||
        p === `${name}:ok` ||
        p.startsWith(`${name}:ok:`)
    )
  );
}

export function isSpecialSupplyReceived(processos: string[] | undefined | null, id: SpecialSupplyId): boolean {
  if (!processos || !Array.isArray(processos)) return false;
  const config = SPECIAL_SUPPLIES.find((s) => s.id === id);
  if (!config) return false;
  return config.alt.some((name) =>
    processos.some(
      (p) =>
        p === `${name}:recebido` ||
        p.startsWith(`${name}:recebido:`) ||
        p === `${name}:chegou` ||
        p.startsWith(`${name}:chegou:`) ||
        p === `${name}:ok` ||
        p.startsWith(`${name}:ok:`)
    )
  );
}

export type OperationalSupplyState = "pendente" | "enviado" | "recebido";

export function getSpecialSupplyOperationalState(
  processos: string[] | undefined | null,
  id: SpecialSupplyId
): OperationalSupplyState {
  if (!processos || !Array.isArray(processos)) return "pendente";
  const config = SPECIAL_SUPPLIES.find((s) => s.id === id);
  if (!config) return "pendente";

  const match = processos.find((p) =>
    config.alt.some((name) => p === name || p.startsWith(`${name}:`))
  );
  if (!match) return "pendente";

  if (
    match.includes(":recebido:") ||
    match.endsWith(":recebido") ||
    match.includes(":chegou:") ||
    match.endsWith(":chegou") ||
    match.includes(":ok:") ||
    match.endsWith(":ok")
  ) {
    return "recebido";
  }

  if (match.includes(":enviado:") || match.endsWith(":enviado")) {
    return "enviado";
  }

  return "pendente";
}

/**
 * Verifica se a O.S. possui suprimentos necessários para ser enviada/exibida em Compras.
 * Regra: "Ela só chegará em COMPRAS quando HOUVER habilitado ou PANTONE ou OUTROS..."
 */
export function hasSpecialSuppliesForCompras(processos: string[] | undefined | null): boolean {
  return isSpecialSupplyActive(processos, "PANTONE") || isSpecialSupplyActive(processos, "OUTROS");
}

/**
 * Tipos e utilitários para integração de status de Compras para suprimentos (Pantone e Outros).
 */
export type SupplyComprasStatus = "entrada" | "cotacao" | "pedido" | "lancamento_ge" | "saida";
export type SpecialSupplyStatusColor = "magenta" | "amarelo" | "verde";

/**
 * Extrai o status atual do setor de Compras a partir dos processos da O.S.
 */
export function extractComprasStatusFromProcessos(
  processos: string[] | undefined | null
): SupplyComprasStatus | null {
  if (!processos || !Array.isArray(processos)) return null;
  for (const p of processos) {
    if (typeof p !== "string") continue;
    if (p.startsWith("COMPRAS:status:") || p.startsWith("COMPRA:status:")) {
      const parts = p.split(":");
      const st = parts[2]?.toLowerCase();
      if (st && ["entrada", "cotacao", "pedido", "lancamento_ge", "saida"].includes(st)) {
        return st as SupplyComprasStatus;
      }
    }
    if (p.startsWith("COMPRAS:") || p.startsWith("COMPRA:")) {
      const parts = p.split(":");
      const st = parts[1]?.toLowerCase();
      if (st && ["entrada", "cotacao", "pedido", "lancamento_ge", "saida"].includes(st)) {
        return st as SupplyComprasStatus;
      }
    }
  }
  // Se contiver COMPRADO ou COMPRA:ok, considera saída/concluído
  if (processos.some((p) => typeof p === "string" && (p.startsWith("COMPRADO") || p.startsWith("COMPRA:ok")))) {
    return "saida";
  }
  return null;
}

/**
 * Atualiza ou insere a tag de status de Compras nos processos.
 */
export function setComprasStatusInProcessos(
  processos: string[] | undefined | null,
  newStatus: SupplyComprasStatus | string
): string[] {
  const current = (processos || []).filter(
    (p) => typeof p === "string" && !p.startsWith("COMPRAS:status:") && !p.startsWith("COMPRA:status:")
  );
  const cleanStatus = newStatus.toLowerCase();
  return [...current, `COMPRAS:status:${cleanStatus}`];
}

/**
 * Retorna as classes Tailwind para a tarja do suprimento especial no card.
 * Regras do usuário:
 * 1. PANTONE e OUTROS (Integração com Compras):
 *    - MAGENTA: material em fase de entrada ou cotação.
 *    - AMARELO: material em fase de pedido.
 *    - VERDE: material com lançamento GE realizado ou saída registrada (ou marcado como comprado/enviado).
 * 2. CLICHÊ, FACA e FILME (Mecanismos operacionais da Pré-Impressão e Produção):
 *    - MAGENTA: Chegam (pendente de envio na pré-impressão).
 *    - AMARELO: Marcado que enviou (despachado pela pré-impressão).
 *    - VERDE: Marcado em produção que chegou / recebido.
 */
export function getSpecialSupplyBadgeClasses(
  id: SpecialSupplyId,
  isSent: boolean,
  comprasStatus?: string | null,
  operationalState?: OperationalSupplyState
): {
  badge: string;
  dot: string;
  border: string;
  label: string;
  statusColor: SpecialSupplyStatusColor;
} {
  // 1. SUPRIMENTOS VINCULADOS A COMPRAS: PANTONE & OUTROS
  if (id === "PANTONE" || id === "OUTROS") {
    const rawStatus = (comprasStatus || "").toLowerCase();
    const isCompleted = isSent || rawStatus === "lancamento_ge" || rawStatus === "saida";
    const isOrderPhase = !isCompleted && rawStatus === "pedido";

    if (isCompleted) {
      // VERDE: material com lançamento GE realizado ou saída registrada
      const statusLabel = rawStatus === "lancamento_ge" ? "Lançamento GE" : rawStatus === "saida" ? "Saída" : "Comprado";
      return {
        badge: "bg-emerald-500 text-white border-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.35)]",
        dot: "bg-white",
        border: "border-emerald-600",
        label: statusLabel,
        statusColor: "verde",
      };
    }

    if (isOrderPhase) {
      // AMARELO: material em fase de pedido
      return {
        badge: "bg-amber-400 text-amber-950 border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.25)]",
        dot: "bg-amber-950",
        border: "border-amber-500",
        label: "Pedido",
        statusColor: "amarelo",
      };
    }

    // MAGENTA: material em fase de entrada ou cotação (padrão inicial para Pantone e Outros)
    const statusLabel = rawStatus === "cotacao" ? "Cotação" : "Entrada";
    return {
      badge: "bg-[#d946ef] text-white border-[#c026d3] shadow-[0_0_8px_rgba(217,70,239,0.35)]",
      dot: "bg-white",
      border: "border-[#c026d3]",
      label: statusLabel,
      statusColor: "magenta",
    };
  }

  // 2. SUPRIMENTOS OPERACIONAIS (PRÉ-IMPRESSÃO E PRODUÇÃO): CLICHÊ, FACA, FILME
  // "ELES CHEGAM MAGENTA, QUANDO AGENTE MARCAR QUE ENVIOU ELE FICA AMARELO, E EM PRODUÇÃO QUANDO CHEGAR AGENTE AVISA E DA ELE FICA VERDE."
  const effectiveState: OperationalSupplyState =
    operationalState || (isSent ? "recebido" : "pendente");

  if (effectiveState === "recebido") {
    // VERDE: chegou / recebido na produção
    return {
      badge: "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.35)] active:scale-95",
      dot: "bg-white",
      border: "border-emerald-600",
      label: "Chegou",
      statusColor: "verde",
    };
  }

  if (effectiveState === "enviado") {
    // AMARELO: marcado que enviou pela pré-impressão
    return {
      badge: "bg-amber-400 hover:bg-amber-500 text-amber-950 border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.25)] active:scale-95",
      dot: "bg-amber-950",
      border: "border-amber-500",
      label: "Enviado",
      statusColor: "amarelo",
    };
  }

  // MAGENTA: chegam / pendente de envio
  return {
    badge: "bg-[#d946ef] hover:bg-[#c026d3] text-white border-[#c026d3] shadow-[0_0_8px_rgba(217,70,239,0.35)] active:scale-95",
    dot: "bg-white",
    border: "border-[#c026d3]",
    label: "Pendente",
    statusColor: "magenta",
  };
}

export function getSpecialSupplyCustomText(
  processos: string[] | undefined | null,
  id: SpecialSupplyId
): string {
  if (!processos || !Array.isArray(processos)) return "";
  const config = SPECIAL_SUPPLIES.find((s) => s.id === id);
  if (!config) return "";

  const match = processos.find((p) =>
    config.alt.some((name) => p === name || p.startsWith(`${name}:`))
  );
  if (!match) return "";

  const infoIdx = match.indexOf(":info:");
  if (infoIdx !== -1) {
    const raw = match.slice(infoIdx + 6);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return "";
}

export function setSpecialSupplyCustomText(
  processos: string[] | undefined | null,
  id: SpecialSupplyId,
  text: string
): string[] {
  const current = [...(processos || [])];
  const config = SPECIAL_SUPPLIES.find((s) => s.id === id);
  if (!config) return current;

  const match = current.find((p) =>
    config.alt.some((name) => p === name || p.startsWith(`${name}:`))
  );

  const filtered = current.filter(
    (p) => !config.alt.some((name) => p === name || p.startsWith(`${name}:`))
  );

  if (!match && !text) {
    return current;
  }

  const isSent = match ? isSpecialSupplySent(current, id) : false;
  let base = "";
  if (isSent && match) {
    const infoIdx = match.indexOf(":info:");
    base = infoIdx !== -1 ? match.slice(0, infoIdx) : match;
  } else {
    base = config.id;
  }

  if (text !== undefined && text !== null && text.length > 0) {
    return [...filtered, `${base}:info:${encodeURIComponent(text)}`];
  } else {
    return [...filtered, base];
  }
}

export function toggleSpecialSupplyActive(
  processos: string[] | undefined | null,
  id: SpecialSupplyId,
  initialCustomText?: string
): string[] {
  const current = [...(processos || [])];
  const config = SPECIAL_SUPPLIES.find((s) => s.id === id);
  if (!config) return current;

  const isActive = isSpecialSupplyActive(current, id);
  const filtered = current.filter(
    (p) => !config.alt.some((name) => p === name || p.startsWith(`${name}:`))
  );

  if (isActive) {
    return filtered;
  } else {
    if (initialCustomText && initialCustomText.trim()) {
      return [...filtered, `${config.id}:info:${encodeURIComponent(initialCustomText.trim())}`];
    }
    return [...filtered, config.id];
  }
}

export function toggleSpecialSupplySent(
  processos: string[] | undefined | null,
  id: SpecialSupplyId,
  operatorName?: string | null
): string[] {
  const current = [...(processos || [])];
  const config = SPECIAL_SUPPLIES.find((s) => s.id === id);
  if (!config) return current;

  const primaryName = config.id;
  const customText = getSpecialSupplyCustomText(current, id);
  const infoPart = customText ? `:info:${encodeURIComponent(customText)}` : "";
  const nowEpoch = Date.now().toString();
  const op = operatorName && operatorName.trim() ? `:${encodeURIComponent(operatorName.trim())}` : "";

  const filtered = current.filter(
    (p) => !config.alt.some((name) => p === name || p.startsWith(`${name}:`))
  );

  // CLICHÊ, FACA, FILME: ciclo de 3 estados operacionais manuais
  // 1. Pendente (Magenta) -> 2. Enviado (Amarelo) -> 3. Recebido (Verde) -> volta para Pendente (Magenta)
  if (id === "CLICHE" || id === "FACA" || id === "FILME") {
    const currentState = getSpecialSupplyOperationalState(current, id);
    if (currentState === "pendente") {
      // 1 -> 2: Pré-impressão marca que enviou (AMARELO)
      return [...filtered, `${primaryName}:enviado:${nowEpoch}${op}${infoPart}`];
    } else if (currentState === "enviado") {
      // 2 -> 3: Produção avisa que chegou (VERDE)
      return [...filtered, `${primaryName}:recebido:${nowEpoch}${op}${infoPart}`];
    } else {
      // 3 -> 1: Redefine de volta para Pendente (MAGENTA)
      return [...filtered, `${primaryName}${infoPart}`];
    }
  }

  // PANTONE e OUTROS: toggle binário
  const isSent = isSpecialSupplySent(current, id);
  if (isSent) {
    return [...filtered, `${primaryName}${infoPart}`];
  } else {
    return [...filtered, `${primaryName}:enviado:${nowEpoch}${op}${infoPart}`];
  }
}

export interface SpecialSupplyDetails {
  id: SpecialSupplyId;
  label: string;
  active: boolean;
  sent: boolean;
  sentAt: string | null;
  operator: string | null;
  customText: string | null;
  displayLabel: string;
  comprasStatus: SupplyComprasStatus | null;
  statusColor: SpecialSupplyStatusColor;
  statusLabel: string;
  operationalState?: OperationalSupplyState;
}

export function getSpecialSupplyDisplayLabel(
  input:
    | { id: SpecialSupplyId; label?: string; customText?: string | null }
    | SpecialSupplyId,
  customTextOrMaxLen?: string | null | number,
  optionalMaxLen?: number
): string {
  let id: SpecialSupplyId;
  let label: string;
  let customText: string | null = null;
  let maxLen = 22;

  if (typeof input === "object" && input !== null) {
    id = input.id;
    label = input.label || SPECIAL_SUPPLIES.find((s) => s.id === id)?.label || id;
    customText = input.customText || null;
    if (typeof customTextOrMaxLen === "number") {
      maxLen = customTextOrMaxLen;
    }
  } else {
    id = input;
    label = SPECIAL_SUPPLIES.find((s) => s.id === id)?.label || id;
    if (typeof customTextOrMaxLen === "string") {
      customText = customTextOrMaxLen;
    }
    if (typeof optionalMaxLen === "number") {
      maxLen = optionalMaxLen;
    }
  }

  if (!customText) return label;
  const txt =
    customText.length > maxLen
      ? `${customText.slice(0, Math.max(0, maxLen - 2))}...`
      : customText;

  if (id === "PANTONE") {
    return `PANTONE (${txt})`;
  }
  if (id === "OUTROS") {
    return `OUTROS: ${txt}`;
  }
  return `${label} (${txt})`;
}

export function getSpecialSupplyDetails(
  processos: string[] | undefined | null,
  id: SpecialSupplyId,
  comprasStatusOverride?: string | null
): SpecialSupplyDetails {
  const config = SPECIAL_SUPPLIES.find((s) => s.id === id);
  if (!config) {
    return {
      id,
      label: id,
      active: false,
      sent: false,
      sentAt: null,
      operator: null,
      customText: null,
      displayLabel: id,
      comprasStatus: null,
      statusColor: (id === "PANTONE" || id === "OUTROS") ? "magenta" : "magenta",
      statusLabel: (id === "PANTONE" || id === "OUTROS") ? "Entrada" : "Pendente",
      operationalState: "pendente",
    };
  }
  if (!processos || !Array.isArray(processos)) {
    return {
      id,
      label: config.label,
      active: false,
      sent: false,
      sentAt: null,
      operator: null,
      customText: null,
      displayLabel: config.label,
      comprasStatus: null,
      statusColor: (id === "PANTONE" || id === "OUTROS") ? "magenta" : "magenta",
      statusLabel: (id === "PANTONE" || id === "OUTROS") ? "Entrada" : "Pendente",
      operationalState: "pendente",
    };
  }

  const match = processos.find((p) =>
    config.alt.some((name) => p === name || p.startsWith(`${name}:`))
  );

  if (!match) {
    return {
      id,
      label: config.label,
      active: false,
      sent: false,
      sentAt: null,
      operator: null,
      customText: null,
      displayLabel: config.label,
      comprasStatus: null,
      statusColor: (id === "PANTONE" || id === "OUTROS") ? "magenta" : "magenta",
      statusLabel: (id === "PANTONE" || id === "OUTROS") ? "Entrada" : "Pendente",
      operationalState: "pendente",
    };
  }

  const isReceived = config.alt.some((name) =>
    match === `${name}:recebido` ||
    match.startsWith(`${name}:recebido:`) ||
    match === `${name}:chegou` ||
    match.startsWith(`${name}:chegou:`) ||
    match === `${name}:ok` ||
    match.startsWith(`${name}:ok:`)
  );

  const isEnviado = !isReceived && config.alt.some((name) =>
    match === `${name}:enviado` ||
    match.startsWith(`${name}:enviado:`)
  );

  const operationalState: OperationalSupplyState = isReceived
    ? "recebido"
    : isEnviado
    ? "enviado"
    : "pendente";

  const isSent = isReceived || isEnviado;

  let sentAt: string | null = null;
  let operator: string | null = null;

  if (isSent) {
    const prefixes = [":recebido:", ":chegou:", ":ok:", ":enviado:"];
    let payload = "";

    for (const pfx of prefixes) {
      const idx = match.indexOf(pfx);
      if (idx !== -1) {
        payload = match.slice(idx + pfx.length);
        break;
      }
    }

    const infoIdx = payload.indexOf(":info:");
    if (infoIdx !== -1) {
      payload = payload.slice(0, infoIdx);
    }

    if (payload) {
      const epochMatch = payload.match(/^(\d{10,})(?::(.*))?$/);
      if (epochMatch) {
        const parsed = parseSafeDate(epochMatch[1]);
        if (parsed) {
          sentAt = parsed.toISOString();
        }
        if (epochMatch[2]) {
          try {
            operator = decodeURIComponent(epochMatch[2]);
          } catch {
            operator = epochMatch[2];
          }
        }
      } else {
        const isoMatch = payload.match(/^(\d{4}-\d{2}-\d{2}T[0-9:.]+Z?)(?::(.*))?$/i);
        if (isoMatch) {
          const parsed = parseSafeDate(isoMatch[1]);
          if (parsed) {
            sentAt = parsed.toISOString();
          }
          if (isoMatch[2]) {
            try {
              operator = decodeURIComponent(isoMatch[2]);
            } catch {
              operator = isoMatch[2];
            }
          }
        } else {
          const parts = payload.split(":");
          for (let i = parts.length; i >= 1; i--) {
            const candidate = parts.slice(0, i).join(":");
            const parsed = parseSafeDate(candidate);
            if (parsed) {
              sentAt = parsed.toISOString();
              const opCandidate = parts.slice(i).join(":");
              if (opCandidate) {
                try {
                  operator = decodeURIComponent(opCandidate);
                } catch {
                  operator = opCandidate;
                }
              }
              break;
            }
          }
        }
      }
    }
  }

  const customText = getSpecialSupplyCustomText(processos, id) || null;
  const displayLabel = getSpecialSupplyDisplayLabel({
    id,
    label: config.label,
    customText,
  });

  const rawComprasStatus =
    comprasStatusOverride !== undefined
      ? (comprasStatusOverride as SupplyComprasStatus | null)
      : (id === "PANTONE" || id === "OUTROS")
      ? extractComprasStatusFromProcessos(processos) || "entrada"
      : null;

  const effectiveSent =
    isSent ||
    ((id === "PANTONE" || id === "OUTROS") &&
      (rawComprasStatus === "lancamento_ge" || rawComprasStatus === "saida"));

  const badgeClasses = getSpecialSupplyBadgeClasses(
    id,
    effectiveSent,
    rawComprasStatus,
    id === "CLICHE" || id === "FACA" || id === "FILME" ? operationalState : undefined
  );

  return {
    id,
    label: config.label,
    active: true,
    sent: effectiveSent,
    sentAt,
    operator,
    customText,
    displayLabel,
    comprasStatus: rawComprasStatus,
    statusColor: badgeClasses.statusColor,
    statusLabel: badgeClasses.label,
    operationalState,
  };
}

export const SPECIAL_SUPPLY_NAMES = SPECIAL_SUPPLIES.flatMap((s) => [
  ...s.alt,
  ...s.alt.map((a) => `${a}:enviado`),
  ...s.alt.map((a) => `${a}:recebido`),
  ...s.alt.map((a) => `${a}:chegou`),
  ...s.alt.map((a) => `${a}:ok`),
]);

export function isInternalProcessTag(p: string): boolean {
  if (!p || typeof p !== "string") return true;
  const trimmed = p.trim();
  if (!trimmed) return true;

  // Metadata de compras e controle interno (COMPRADO, COMPRA:ok, COMPRADO:timestamp:user, etc.)
  if (
    trimmed.startsWith("COMPRADO") ||
    trimmed.startsWith("COMPRA:") ||
    trimmed.includes("COMPRADO") ||
    trimmed.includes("COMPRA:")
  ) {
    return true;
  }

  // Suprimentos especiais tratados em quadros próprios (PANTONE, FACA, CLICHÊ, OUTROS)
  if (SPECIAL_SUPPLIES.some((s) => s.alt.some((a) => trimmed === a || trimmed.startsWith(`${a}:`)))) {
    return true;
  }

  // Tipos de acabamento
  if ((ACABAMENTO_TIPOS as readonly string[]).includes(trimmed)) {
    return true;
  }

  // Tipos de impressão
  if (IMPRESSAO_TIPOS.some((t) => t.sigla === trimmed)) {
    return true;
  }

  // Tags internas contendo ":" (ex: chave:valor ou id:timestamp:user)
  if (trimmed.includes(":")) {
    return true;
  }

  return false;
}

export function sortAndFilterProcessos(processos?: string[] | null): string[] {
  if (!processos || !Array.isArray(processos)) return [];
  const PROCESSO_ORDER = ALL_PROCESSOS.map((p) => p.sigla);
  return processos
    .filter((p) => !isInternalProcessTag(p))
    .sort((a, b) => {
      const ia = PROCESSO_ORDER.indexOf(a);
      const ib = PROCESSO_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
}
