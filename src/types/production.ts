export type Department = 
  | "qualidade"
  | "expedicao" 
  | "compras"
  | "manutencao";

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

export const QUALIDADE_DEPARTMENT: DepartmentConfig = {
  id: "qualidade",
  label: "Qualidade",
  statuses: [
    { id: "entrada", label: "Entrada", colorKey: "entrada" },
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

export const DEPARTMENTS: DepartmentConfig[] = [
  QUALIDADE_DEPARTMENT,
];

export const DEPARTMENT_MAP: Record<Department, DepartmentConfig> = 
  [...DEPARTMENTS, EXPEDICAO_DEPARTMENT, COMPRAS_DEPARTMENT, MANUTENCAO_DEPARTMENT].reduce((acc, dept) => {
    acc[dept.id] = dept;
    return acc;
  }, {} as Record<Department, DepartmentConfig>);
