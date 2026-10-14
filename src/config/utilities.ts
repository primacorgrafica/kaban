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
    title: "", // Deixando direto ou com categoria caso deseje agrupar
    links: [
      {
        id: "packaging-cad-pro",
        label: "PACKAGING CAD PRO",
        url: "https://primacorembalagens.vercel.app/",
        badge: "CAD",
      },
    ],
  },
];
