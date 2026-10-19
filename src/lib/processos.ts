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
  { sigla: "PANTONE", cor: "bg-blue-100 text-blue-800 border-blue-300" },
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

// ═══ SUPRIMENTOS & PROCESSOS ESPECIAIS (PANTONE - FACA - CLICHÊ) ═══
export const SPECIAL_SUPPLIES = [
  { id: "PANTONE", label: "PANTONE", alt: ["PANTONE", "pantone"] },
  { id: "FACA", label: "FACA", alt: ["FACA", "faca"] },
  { id: "CLICHE", label: "CLICHÊ", alt: ["CLICHE", "CLICHÊ", "cliche", "clichê"] },
] as const;

export type SpecialSupplyId = "PANTONE" | "FACA" | "CLICHE";

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

export function toggleSpecialSupplyActive(processos: string[] | undefined | null, id: SpecialSupplyId): string[] {
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

  const filtered = current.filter(
    (p) => !config.alt.some((name) => p === name || p.startsWith(`${name}:`))
  );

  if (isSent) {
    // Se estava enviado (verde), volta a pendente (amarelo)
    return [...filtered, primaryName];
  } else {
    // Se estava pendente (amarelo), passa a enviado (verde) gravando timestamp epoch e operador
    const nowEpoch = Date.now().toString();
    const op = operatorName && operatorName.trim() ? `:${encodeURIComponent(operatorName.trim())}` : "";
    return [...filtered, `${primaryName}:enviado:${nowEpoch}${op}`];
  }
}

export interface SpecialSupplyDetails {
  id: SpecialSupplyId;
  label: string;
  active: boolean;
  sent: boolean;
  sentAt: string | null;
  operator: string | null;
}

export function getSpecialSupplyDetails(
  processos: string[] | undefined | null,
  id: SpecialSupplyId
): SpecialSupplyDetails {
  const config = SPECIAL_SUPPLIES.find((s) => s.id === id);
  if (!config) {
    return { id, label: id, active: false, sent: false, sentAt: null, operator: null };
  }
  if (!processos || !Array.isArray(processos)) {
    return { id, label: config.label, active: false, sent: false, sentAt: null, operator: null };
  }

  const match = processos.find((p) =>
    config.alt.some((name) => p === name || p.startsWith(`${name}:`))
  );

  if (!match) {
    return { id, label: config.label, active: false, sent: false, sentAt: null, operator: null };
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

    if (payload) {
      // Caso 1: Timestamp numérico epoch (ex: "1729359670000" ou "1729359670000:Operador")
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
        // Caso 2: Formato ISO ou string com colons (ex: "2026-10-19T17:40:00.000Z:Operador")
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
          // Caso 3: Fallback genérico testando partes
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

  return {
    id,
    label: config.label,
    active: true,
    sent: isSent,
    sentAt,
    operator,
  };
}

