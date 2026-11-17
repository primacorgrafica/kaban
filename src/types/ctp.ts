export interface CtpChecklistItem {
  checked: boolean;
  checked_at?: string | null;
  checked_by?: string | null;
}

export type CtpChecklist = Record<string, CtpChecklistItem>;

export interface CtpChecklistConfigItem {
  id: string; // "01", "02", ... "13"
  numero: string;
  descricao: string;
}

export const CTP_CHECKLIST_ITEMS: CtpChecklistConfigItem[] = [
  { id: "01", numero: "01", descricao: "A montagem corresponde à OS e à versão final aprovada do trabalho." },
  { id: "02", numero: "02", descricao: "O formato da folha e a máquina de impressão estão corretos." },
  { id: "03", numero: "03", descricao: "O formato da chapa, a orientação e o posicionamento da montagem estão corretos." },
  { id: "04", numero: "04", descricao: "A quantidade de peças por folha, os espaçamentos e o aproveitamento estão corretos." },
  { id: "05", numero: "05", descricao: "A paginação, a sequência dos cadernos e a orientação das páginas estão corretas." },
  { id: "06", numero: "06", descricao: "Frente e verso estão correspondentes, considerando o sistema de virada previsto." },
  { id: "07", numero: "07", descricao: "A posição de pinça e a referência lateral seguem o padrão da máquina." },
  { id: "08", numero: "08", descricao: "O formato final, as sangrias e as margens de segurança estão corretos na montagem." },
  { id: "09", numero: "09", descricao: "As marcas de corte, dobra e registro estão posicionadas corretamente." },
  { id: "10", numero: "10", descricao: "As barras de controle estão posicionadas corretamente, sem invadir a área útil." },
  { id: "11", numero: "11", descricao: "Facas, vincos e vernizes estão posicionados e identificados corretamente na montagem." },
  { id: "12", numero: "12", descricao: "A prova de montagem ou o boneco foi conferido quanto a corte, dobra e sequência." },
  { id: "13", numero: "13", descricao: "A quantidade e a identificação das formas e chapas correspondem à OS." },
];

export function getCtpChecklistStatus(checklist?: CtpChecklist | null): {
  total: number;
  checkedCount: number;
  complete: boolean;
  missingItems: CtpChecklistConfigItem[];
} {
  const safe = checklist || {};
  const missingItems: CtpChecklistConfigItem[] = [];
  let checkedCount = 0;

  for (const item of CTP_CHECKLIST_ITEMS) {
    if (safe[item.id]?.checked) {
      checkedCount++;
    } else {
      missingItems.push(item);
    }
  }

  return {
    total: CTP_CHECKLIST_ITEMS.length,
    checkedCount,
    complete: checkedCount === CTP_CHECKLIST_ITEMS.length,
    missingItems,
  };
}

export function isCtpChecklistComplete(checklist?: CtpChecklist | null): boolean {
  return getCtpChecklistStatus(checklist).complete;
}
