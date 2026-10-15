import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: true,
    port: 8080,
  },
  optimizeDeps: {
    include: [
      "cmdk",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-popover",
      "@radix-ui/react-tooltip",
      "next-themes",
    ],
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "radix-vendor": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-select",
            "@radix-ui/react-alert-dialog",
          ],
          "charts-vendor": ["recharts"],
          "pdf-vendor": ["jspdf", "jspdf-autotable"],
          "icons-vendor": ["lucide-react"],
          "supabase-vendor": ["@supabase/supabase-js"],
          "msal-vendor": ["@azure/msal-browser"],
        },
      },
    },
  },
}));

