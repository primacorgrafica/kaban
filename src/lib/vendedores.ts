import { supabase } from "@/integrations/supabase/client";

export interface VendedorProfile {
  id: string;
  user_id?: string;
  nome: string;
  email?: string | null;
}

/**
 * 6 Vendedores Oficiais Reais do Primacor Kaban (perfis de usuário reais)
 */
export const DEFAULT_VENDEDORES: VendedorProfile[] = [
  {
    id: "3011f0f8-e3a7-4ba7-9d9c-11a39614bd60",
    user_id: "3011f0f8-e3a7-4ba7-9d9c-11a39614bd60",
    nome: "Bianca",
    email: "bianca@primacorgrafica.com.br",
  },
  {
    id: "8713c922-2c4c-419e-ae73-0bc1c9ea989f",
    user_id: "8713c922-2c4c-419e-ae73-0bc1c9ea989f",
    nome: "deborah",
    email: "deborah@primacorgrafica.com.br",
  },
  {
    id: "dfcf8a88-b38f-4fa8-af2b-c36f69e56df2",
    user_id: "dfcf8a88-b38f-4fa8-af2b-c36f69e56df2",
    nome: "Ozeas",
    email: "ozeas@primacorgrafica.com.br",
  },
  {
    id: "09dfa978-8d68-47aa-8a81-14e9c6891ca1",
    user_id: "09dfa978-8d68-47aa-8a81-14e9c6891ca1",
    nome: "Ronaldo",
    email: "ronaldo@primacorgrafica.com.br",
  },
  {
    id: "cac0c4fa-f98f-47fa-b16d-61a3e23e4408",
    user_id: "cac0c4fa-f98f-47fa-b16d-61a3e23e4408",
    nome: "well",
    email: "well@primacorgrafica.com.br",
  },
  {
    id: "primacor-comercial-profile",
    user_id: "primacor-comercial-profile",
    nome: "Primacor",
    email: "comercial@primacorgrafica.com.br",
  },
];

let cachedVendedores: VendedorProfile[] | null = null;
let lastFetchTime = 0;
let inFlightPromise: Promise<VendedorProfile[]> | null = null;
const CACHE_TTL_MS = 15000; // 15 segundos de cache

export function clearVendedoresCache(): void {
  cachedVendedores = null;
  lastFetchTime = 0;
  inFlightPromise = null;
}

/**
 * Sanitiza e normaliza nomes de vendedores para garantir que:
 * - "Wellington" seja corrigido para "well" (perfil real)
 */
export function sanitizeVendedorNome(rawName: string): string {
  const clean = (rawName || "").trim();
  if (clean.toLowerCase() === "wellington") {
    return "well";
  }
  return clean;
}

/**
 * Valida se é um nome válido de vendedor
 */
export function isRealVendedor(nome: string): boolean {
  const clean = (nome || "").trim();
  if (!clean) return false;
  return true;
}

async function fetchBaseVendedores(): Promise<VendedorProfile[]> {
  const mapByUserOrName = new Map<string, VendedorProfile>();

  const addItems = (items: (VendedorProfile | any)[]) => {
    for (const item of items) {
      if (!item || !item.nome) continue;
      const cleanName = sanitizeVendedorNome(item.nome);
      if (!isRealVendedor(cleanName)) continue;
      const key = cleanName.toLowerCase().trim();
      const existing = mapByUserOrName.get(key);
      if (!existing) {
        mapByUserOrName.set(key, {
          id: item.id || item.user_id || key,
          user_id: item.user_id || (item.id && typeof item.id === "string" && item.id.length === 36 ? item.id : undefined),
          nome: cleanName,
          email: item.email || null,
        });
      } else {
        // Enriquecer email ou user_id se faltava
        if (!existing.email && item.email) existing.email = item.email;
        if (!existing.user_id && item.user_id) existing.user_id = item.user_id;
      }
    }
  };

  // 1. Fonte Primária: Consulta em tempo real aos usuários com role = 'vendedor' + perfis
  try {
    const [{ data: roles, error: rolesErr }, { data: profiles, error: profsErr }] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "vendedor"),
      supabase.from("profiles").select("id, user_id, nome, email" as any).order("nome"),
    ]);

    if (!rolesErr && !profsErr && roles && profiles) {
      const vendedorUserIds = new Set((roles || []).map((r: any) => r.user_id));
      const currentVendedores = profiles
        .filter((p: any) => p.user_id && vendedorUserIds.has(p.user_id) && p.nome)
        .map((p: any) => ({
          id: p.id || p.user_id,
          user_id: p.user_id,
          nome: p.nome,
          email: p.email || null,
        }));

      if (currentVendedores.length > 0) {
        addItems(currentVendedores);
      }
    }
  } catch (err) {
    console.warn("[vendedores] Erro ao consultar via user_roles/profiles:", err);
  }

  // 2. Consulta complementar via RPC get_vendedores
  try {
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("get_vendedores");
    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      addItems(rpcData);
    }
  } catch (err) {
    console.warn("[vendedores] Falha ao invocar RPC get_vendedores:", err);
  }

  // 3. Consulta complementar na tabela 'vendedores'
  try {
    const { data: tableData, error: tableErr } = await supabase
      .from("vendedores")
      .select("id, nome, email, user_id" as any)
      .order("nome");

    if (!tableErr && tableData && tableData.length > 0) {
      addItems(tableData);
    }
  } catch (err) {
    console.warn("[vendedores] Erro ao consultar tabela vendedores:", err);
  }

  // 4. Se a lista ainda estiver completamente vazia, fallback seguro com os vendedores oficiais
  if (mapByUserOrName.size === 0) {
    addItems(DEFAULT_VENDEDORES);
  }

  return Array.from(mapByUserOrName.values()).sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function fetchVendedores(forceRefresh = false): Promise<VendedorProfile[]> {
  const now = Date.now();
  if (!forceRefresh && cachedVendedores && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedVendedores;
  }

  if (inFlightPromise && !forceRefresh) {
    return inFlightPromise;
  }

  inFlightPromise = fetchBaseVendedores()
    .then((result) => {
      cachedVendedores = result;
      lastFetchTime = Date.now();
      inFlightPromise = null;
      return result;
    })
    .catch((err) => {
      inFlightPromise = null;
      console.error("[vendedores] Falha crítica ao buscar vendedores:", err);
      return DEFAULT_VENDEDORES;
    });

  return inFlightPromise;
}

// Configura monitoramento realtime global para invalidar cache automaticamente em caso de alteração de papel
if (typeof window !== "undefined" && typeof supabase?.channel === "function") {
  try {
    supabase
      .channel("vendedores-realtime-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => {
        clearVendedoresCache();
        window.dispatchEvent(new CustomEvent("vendedores-updated"));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "vendedores" }, () => {
        clearVendedoresCache();
        window.dispatchEvent(new CustomEvent("vendedores-updated"));
      })
      .subscribe();
  } catch (e) {
    console.warn("[vendedores] Não foi possível registrar channel realtime de vendedores:", e);
  }
}
