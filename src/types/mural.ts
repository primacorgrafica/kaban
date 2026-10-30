export type MuralTipo = "urgente" | "importante" | "info";

export interface MuralAlerta {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: MuralTipo;
  ativo: boolean;
  criado_por?: string | null;
  autor_nome?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface MuralAlertaInput {
  titulo: string;
  mensagem: string;
  tipo?: MuralTipo;
  ativo?: boolean;
  created_at?: string;
}
