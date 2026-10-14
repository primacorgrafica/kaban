export interface UtilityLink {
  id: string;
  label: string;
  url: string;
  description?: string;
  badge?: string;
}

export interface UtilitySubMenu {
  id: string;
  title?: string;
  links: UtilityLink[];
}

/**
 * Configuração dos Menus e Sub-menus de Utilidades.
 * Os links configurados aqui abrirão em uma nova aba (_blank).
 */
export const UTILITIES_CONFIG: UtilitySubMenu[] = [
  {
    id: "utilidades-primacor",
    title: "", // Exibe direto os botões
    links: [
      {
        id: "packaging-cad-pro",
        label: "PACKAGING CAD PRO",
        url: "https://primacorembalagens.vercel.app/",
        badge: "CAD",
      },
      {
        id: "estamparia",
        label: "ESTAMPARIA",
        url: "https://estamparia.vercel.app",
      },
      {
        id: "aprovacao-cliente",
        label: "APROVAÇÃO CLIENTE",
        url: "https://embalagensprimacor.lovable.app/admin",
      },
      {
        id: "calcular-lombada",
        label: "CALCULAR LOMBADA",
        url: "https://calcularlombada.vercel.app/",
      },
    ],
  },
];
