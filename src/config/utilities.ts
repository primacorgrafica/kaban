export interface UtilityLink {
  id: string;
  label: string;
  url: string;
  description?: string;
  badge?: string;
}

export interface UtilitySubMenu {
  id: string;
  title: string;
  links: UtilityLink[];
}

/**
 * Configuração dos Menus e Sub-menus de Utilidades.
 * Os links configurados aqui abrirão em uma nova aba (_blank).
 */
export const UTILITIES_CONFIG: UtilitySubMenu[] = [
  {
    id: "consultas",
    title: "Consultas & Portais",
    links: [
      {
        id: "link-1",
        label: "Portal de Exemplo 1",
        url: "https://www.google.com",
      },
      {
        id: "link-2",
        label: "Portal de Exemplo 2",
        url: "https://www.google.com",
      },
    ],
  },
  {
    id: "ferramentas",
    title: "Ferramentas & Sistemas",
    links: [
      {
        id: "link-3",
        label: "Sistema Externo 1",
        url: "https://www.google.com",
      },
    ],
  },
];
