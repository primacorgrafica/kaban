import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        status: {
          novo: "hsl(var(--status-novo))",
          "novo-bg": "hsl(var(--status-novo-bg))",
          andamento: "hsl(var(--status-andamento))",
          "andamento-bg": "hsl(var(--status-andamento-bg))",
          aguardando: "hsl(var(--status-aguardando))",
          "aguardando-bg": "hsl(var(--status-aguardando-bg))",
          revisao: "hsl(var(--status-revisao))",
          "revisao-bg": "hsl(var(--status-revisao-bg))",
          concluido: "hsl(var(--status-concluido))",
          "concluido-bg": "hsl(var(--status-concluido-bg))",
          arquivado: "hsl(var(--status-arquivado))",
          "arquivado-bg": "hsl(var(--status-arquivado-bg))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "card-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "card-pop": {
          "0%": { transform: "scale(0.92)", opacity: "0.6" },
          "60%": { transform: "scale(1.03)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "column-pulse": {
          "0%": { boxShadow: "inset 0 0 0 0 hsl(var(--primary) / 0)" },
          "50%": { boxShadow: "inset 0 0 0 2px hsl(var(--primary) / 0.2)" },
          "100%": { boxShadow: "inset 0 0 0 0 hsl(var(--primary) / 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "card-in": "card-in 0.25s ease-out",
        "card-pop": "card-pop 0.3s ease-out",
        "column-pulse": "column-pulse 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
