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
  { sigla: "PANTONE", cor: "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-950/60 dark:text-pink-300 dark:border-pink-800" },
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
        p === `${name}:ok` ||
        p.startsWith(`${name}:ok:`)
    )
  );
}

/**
 * Verifica se a O.S. possui suprimentos necessários para ser enviada/exibida em Compras.
 * Regra: "Ela só chegará em COMPRAS quando HOUVER habilitado ou PANTONE ou OUTROS..."
 */
export function hasSpecialSuppliesForCompras(processos: string[] | undefined | null): boolean {
  return isSpecialSupplyActive(processos, "PANTONE") || isSpecialSupplyActive(processos, "OUTROS");
}

/**
 * Retorna as classes Tailwind para a tarja do suprimento especial no card.
 * Regra do usuário:
 * - FACA e CLICHÊ: continuam AMARELOS quando pendentes;
 * - PANTONE e OUTROS: agora ficam ROSA CLARINHO quando pendentes;
 * - Quando enviados (isSent), ficam VERDE esmeralda.
 */
export function getSpecialSupplyBadgeClasses(
  id: SpecialSupplyId,
  isSent: boolean
): {
  badge: string;
  dot: string;
  border: string;
  label: string;
} {
  if (isSent) {
    return {
      badge: "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.35)] active:scale-95",
      dot: "bg-white",
      border: "border-emerald-600",
      label: "Enviado",
    };
  }

  if (id === "PANTONE" || id === "OUTROS") {
    // ROSA CLARINHO
    return {
      badge: "bg-pink-100 hover:bg-pink-200 text-pink-950 border-pink-300 dark:bg-pink-950/80 dark:text-pink-100 dark:border-pink-600/60 shadow-[0_0_8px_rgba(244,114,182,0.25)] active:scale-95",
      dot: "bg-pink-700 dark:bg-pink-300",
      border: "border-pink-300 dark:border-pink-600/60",
      label: "Pendente",
    };
  }

  // FACA, CLICHÊ e FILME: AMARELO
  return {
    badge: "bg-amber-400 hover:bg-amber-500 text-amber-950 border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.25)] active:scale-95",
    dot: "bg-amber-950",
    border: "border-amber-500",
    label: "Pendente",
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

  const cleanText = text.trim();
  const filtered = current.filter(
    (p) => !config.alt.some((name) => p === name || p.startsWith(`${name}:`))
  );

  if (!match && !cleanText) {
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

  if (cleanText) {
    return [...filtered, `${base}:info:${encodeURIComponent(cleanText)}`];
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

  const isSent = isSpecialSupplySent(current, id);
  const primaryName = config.id;
  const customText = getSpecialSupplyCustomText(current, id);

  const filtered = current.filter(
    (p) => !config.alt.some((name) => p === name || p.startsWith(`${name}:`))
  );

  const infoPart = customText ? `:info:${encodeURIComponent(customText)}` : "";

  if (isSent) {
    return [...filtered, `${primaryName}${infoPart}`];
  } else {
    const nowEpoch = Date.now().toString();
    const op = operatorName && operatorName.trim() ? `:${encodeURIComponent(operatorName.trim())}` : "";
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
  id: SpecialSupplyId
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
    };
  }

  const isSent = config.alt.some((name) =>
    match === `${name}:enviado` ||
    match.startsWith(`${name}:enviado:`) ||
    match === `${name}:ok` ||
    match.startsWith(`${name}:ok:`)
  );

  let sentAt: string | null = null;
  let operator: string | null = null;

  if (isSent) {
    const enviadoPrefix = ":enviado:";
    const okPrefix = ":ok:";
    let payload = "";

    const envIdx = match.indexOf(enviadoPrefix);
    if (envIdx !== -1) {
      payload = match.slice(envIdx + enviadoPrefix.length);
    } else {
      const okIdx = match.indexOf(okPrefix);
      if (okIdx !== -1) {
        payload = match.slice(okIdx + okPrefix.length);
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

  return {
    id,
    label: config.label,
    active: true,
    sent: isSent,
    sentAt,
    operator,
    customText,
    displayLabel,
  };
}


export const SPECIAL_SUPPLY_NAMES = SPECIAL_SUPPLIES.flatMap((s) => [
  ...s.alt,
  ...s.alt.map((a) => `${a}:enviado`),
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
