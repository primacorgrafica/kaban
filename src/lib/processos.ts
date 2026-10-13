export interface ProcessoItem {
  sigla: string;
  cor: string;
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
