import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const PROD_URL = "https://zkpfuotxkdbokytqtjgj.supabase.co";
export const PROD_PUBLISHABLE_KEY = "sb_publishable_TVmaFLWNi5gRGc6O_e6eHg_JkKzoEWA";

export function getActiveSupabaseConfig() {
  if (typeof window !== "undefined") {
    // Limpa qualquer resquício residual de staging salvo em navegadores locais/produção
    try {
      const savedEnv = localStorage.getItem("kaban_active_env");
      if (savedEnv === "staging") {
        localStorage.removeItem("kaban_active_env");
      }
    } catch {
      // Ignora restrições de localStorage em ambientes isolados
    }
  }

  const defaultUrl = import.meta.env.VITE_SUPABASE_URL || PROD_URL;
  const defaultKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    PROD_PUBLISHABLE_KEY;

  return { url: defaultUrl, key: defaultKey, env: "prod" };
}

export const activeSupabaseConfig = getActiveSupabaseConfig();

export const supabase = createClient<Database>(activeSupabaseConfig.url, activeSupabaseConfig.key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "sb-zkpfuotxkdbokytqtjgj-auth-token",
  },
});
