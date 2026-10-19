export type Department = 
  | "ctp"
  | "offset" 
  | "digital" 
  | "plotter" 
  | "acabamento" 
  | "expedicao" 
  | "terceiros"
  | "faturamento"
  | "compras"
  | "manutencao"
  | "qualidade";

export interface DepartmentStatusConfig {
  id: string;
  label: string;
  colorKey: string;
}

export interface MachineConfig {
  id: string;
  label: string;
}

export interface DepartmentConfig {
  id: Department;
  label: string;
  statuses: DepartmentStatusConfig[];
  machines?: MachineConfig[];
}

export const DEPARTMENTS: DepartmentConfig[] = [
  {
    id: "ctp",
    label: "CTP",
    statuses: [
      { id: "entrada", label: "Entrada", colorKey: "entrada" },
      { id: "gravando", label: "Gravando", colorKey: "andamento" },
      { id: "saida", label: "Saída", colorKey: "concluido" },
    ],
  },
  {
    id: "offset",
    label: "Off-Set",
    statuses: [
      { id: "entrada", label: "Entrada", colorKey: "entrada" },
      { id: "komori_s29", label: "Komori S29", colorKey: "andamento" },
      { id: "ryobi_685", label: "Ryobi 685", colorKey: "andamento" },
      { id: "ryobi_754", label: "Ryobi 754", colorKey: "andamento" },
      { id: "ryobi_524", label: "Ryobi 524", colorKey: "andamento" },
      { id: "saida", label: "Saída", colorKey: "concluido" },
    ],
  },
  {
    id: "digital",
    label: "Digital",
    statuses: [
      { id: "entrada", label: "Entrada", colorKey: "entrada" },
      { id: "digital_color", label: "Color", colorKey: "andamento" },
      { id: "pb", label: "PB", colorKey: "andamento" },
      { id: "plotter", label: "Plotter", colorKey: "andamento" },
      { id: "saida", label: "Saída", colorKey: "concluido" },
    ],
  },
  {
    id: "acabamento",
    label: "Acabamento",
    statuses: [
      { id: "entrada", label: "Entrada", colorKey: "entrada" },
      { id: "laminacao", label: "Laminação", colorKey: "andamento" },
      { id: "capa_dura", label: "Capa-Dura", colorKey: "andamento" },
      { id: "vincadeira", label: "Vincadeira", colorKey: "andamento" },
      { id: "dobra", label: "Dobra", colorKey: "andamento" },
      { id: "alceadeira", label: "Alceadeira", colorKey: "andamento" },
      { id: "cola_pur", label: "Cola PUR", colorKey: "andamento" },
      { id: "manual", label: "Manual", colorKey: "andamento" },
      { id: "hot_stamping", label: "Hot", colorKey: "andamento" },
      { id: "corte_vinco", label: "Corte Vinco", colorKey: "andamento" },
      { id: "corte_vinco_auto", label: "Corte Vinco Auto", colorKey: "andamento" },
      { id: "destaque", label: "Destaque", colorKey: "andamento" },
      { id: "cartucheira", label: "Cartucheira", colorKey: "andamento" },
      { id: "saida", label: "Saída", colorKey: "concluido" },
    ],
  },
  {
    id: "terceiros",
    label: "Terceiros",
    statuses: [
      { id: "entrada", label: "Entrada", colorKey: "entrada" },
      { id: "producao", label: "Produção", colorKey: "andamento" },
      { id: "saida", label: "Saída", colorKey: "concluido" },
    ],
  },
];

export const FATURAMENTO_DEPARTMENT: DepartmentConfig = {
  id: "faturamento",
  label: "Faturamento",
  statuses: [
    { id: "entrada", label: "Entrada", colorKey: "entrada" },
    { id: "cadastro", label: "Cadastro", colorKey: "novo" },
    { id: "analise", label: "Análise", colorKey: "aguardando" },
    { id: "pendencia", label: "Pendência", colorKey: "urgente" },
    { id: "emissao_nf", label: "Emissão NF", colorKey: "andamento" },
    { id: "saida", label: "Saída", colorKey: "concluido" },
  ],
};

export const COMPRAS_DEPARTMENT: DepartmentConfig = {
  id: "compras",
  label: "Compras",
  statuses: [
    { id: "entrada", label: "Entrada", colorKey: "entrada" },
    { id: "cotacao", label: "Cotação", colorKey: "novo" },
    { id: "pedido", label: "Pedido", colorKey: "andamento" },
    { id: "lancamento_ge", label: "Lançamento GE", colorKey: "revisao" },
    { id: "saida", label: "Saída", colorKey: "concluido" },
  ],
};

export const MANUTENCAO_DEPARTMENT: DepartmentConfig = {
  id: "manutencao",
  label: "Manutenção",
  statuses: [
    { id: "entrada", label: "Entrada", colorKey: "entrada" },
    { id: "em_andamento", label: "Em Andamento", colorKey: "andamento" },
    { id: "aguardando_visita", label: "Aguardando Visita Técnica", colorKey: "aguardando" },
    { id: "aguardando_material", label: "Aguardando Material", colorKey: "novo" },
    { id: "parado", label: "Parado", colorKey: "revisao" },
    { id: "lancamento_ge_m", label: "Lançamento GE", colorKey: "revisao" },
    { id: "saida", label: "Saída", colorKey: "concluido" },
  ],
};


export const EXPEDICAO_DEPARTMENT: DepartmentConfig = {
  id: "expedicao",
  label: "Expedição",
  statuses: [
    { id: "entrada", label: "Entrada", colorKey: "entrada" },
    { id: "rota_manha", label: "Rota Manhã", colorKey: "novo" },
    { id: "rota_tarde", label: "Rota Tarde", colorKey: "aguardando" },
    { id: "saida", label: "Saída", colorKey: "concluido" },
  ],
};

export const QUALIDADE_DEPARTMENT: DepartmentConfig = {
  id: "qualidade",
  label: "Qualidade",
  statuses: [
    { id: "entrada", label: "Entrada", colorKey: "entrada" },
    { id: "saida", label: "Saída", colorKey: "concluido" },
  ],
};

export const DEPARTMENT_MAP: Record<Department, DepartmentConfig> = 
  [...DEPARTMENTS, EXPEDICAO_DEPARTMENT, FATURAMENTO_DEPARTMENT, COMPRAS_DEPARTMENT, MANUTENCAO_DEPARTMENT, QUALIDADE_DEPARTMENT].reduce((acc, dept) => {
    acc[dept.id] = dept;
    return acc;
  }, {} as Record<Department, DepartmentConfig>);
