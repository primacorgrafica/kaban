import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const STAGING_URL = "https://msyelkzcmarpdazqfkri.supabase.co";
export const STAGING_PUBLISHABLE_KEY = "sb_publishable_LYRM1fqlirI0qsOn7KGyHQ_lGzHx2W1";

export const PROD_URL = "https://zkpfuotxkdbokytqtjgj.supabase.co";
export const PROD_PUBLISHABLE_KEY = "sb_publishable_TVmaFLWNi5gRGc6O_e6eHg_JkKzoEWA";

export function getActiveSupabaseConfig() {
  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    const envParam = urlParams.get("env") || urlParams.get("ambiente");

    if (envParam === "staging" || envParam === "homologacao") {
      localStorage.setItem("kaban_active_env", "staging");
      return { url: STAGING_URL, key: STAGING_PUBLISHABLE_KEY, env: "staging" };
    }
    if (envParam === "prod" || envParam === "producao") {
      localStorage.setItem("kaban_active_env", "prod");
      return { url: PROD_URL, key: PROD_PUBLISHABLE_KEY, env: "prod" };
    }

    // A rota do entregador usa staging por padrão para a homologação em nuvem
    if (window.location.pathname.startsWith("/entregador")) {
      localStorage.setItem("kaban_active_env", "staging");
      return { url: STAGING_URL, key: STAGING_PUBLISHABLE_KEY, env: "staging" };
    }

    const savedEnv = localStorage.getItem("kaban_active_env");
    if (savedEnv === "staging") {
      return { url: STAGING_URL, key: STAGING_PUBLISHABLE_KEY, env: "staging" };
    }
    if (savedEnv === "prod") {
      return { url: PROD_URL, key: PROD_PUBLISHABLE_KEY, env: "prod" };
    }
  }

  const defaultUrl = import.meta.env.VITE_SUPABASE_URL || PROD_URL;
  const defaultKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    PROD_PUBLISHABLE_KEY;

  return { url: defaultUrl, key: defaultKey, env: "default" };
}

export const activeSupabaseConfig = getActiveSupabaseConfig();

export const supabase = createClient<Database>(activeSupabaseConfig.url, activeSupabaseConfig.key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: activeSupabaseConfig.url.includes("msyelkzcmarpdazqfkri")
      ? "sb-msyelkzcmarpdazqfkri-auth-token"
      : "sb-zkpfuotxkdbokytqtjgj-auth-token",
  },
});
