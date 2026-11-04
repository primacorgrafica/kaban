import { supabase } from "@/integrations/supabase/client";

export interface VendedorProfile {
  id: string;
  user_id?: string;
  nome: string;
  email?: string | null;
}

/**
 * 5 Vendedores Oficiais Reais do Primacor Kaban (perfis de usuário reais)
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
];

let cachedVendedores: VendedorProfile[] | null = null;
let lastFetchTime = 0;
let inFlightPromise: Promise<VendedorProfile[]> | null = null;
const CACHE_TTL_MS = 30000; // 30 segundos de cache

export function clearVendedoresCache(): void {
  cachedVendedores = null;
  lastFetchTime = 0;
  inFlightPromise = null;
}

/**
 * Sanitiza e normaliza nomes de vendedores para garantir que:
 * - "Wellington" seja corrigido para "well" (perfil real)
 * - "Primacor" e outros nomes que não sejam vendedores sejam removidos
 */
export function sanitizeVendedorNome(rawName: string): string {
  const clean = (rawName || "").trim();
  if (clean.toLowerCase() === "wellington") {
    return "well";
  }
  return clean;
}

export function isRealVendedor(nome: string): boolean {
  const clean = (nome || "").trim().toLowerCase();
  if (!clean || clean === "primacor") return false;
  return true;
}

async function fetchBaseVendedores(): Promise<VendedorProfile[]> {
  let list: VendedorProfile[] = [];

  // 1. Tenta chamar a RPC get_vendedores (SECURITY DEFINER)
  try {
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("get_vendedores");
    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      list = rpcData
        .filter((item: any) => item.nome && isRealVendedor(item.nome))
        .map((item: any) => ({
          id: item.id || item.user_id,
          user_id: item.user_id,
          nome: sanitizeVendedorNome(item.nome),
          email: item.email || null,
        }));
    }
  } catch (err) {
    console.warn("[vendedores] Falha ao invocar RPC get_vendedores, usando fallback:", err);
  }

  // 2. Fallback: Consulta direta cruzando user_roles com role = 'vendedor' + profiles
  if (list.length === 0) {
    try {
      const [{ data: roles }, { data: profiles }] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "vendedor"),
        supabase.from("profiles").select("id, user_id, nome, email" as any).order("nome"),
      ]);

      const vendedorUserIds = new Set((roles || []).map((r: any) => r.user_id));
      if (vendedorUserIds.size > 0 && profiles && profiles.length > 0) {
        const filtered = (profiles || [])
          .filter((p: any) => p.user_id && vendedorUserIds.has(p.user_id) && p.nome && isRealVendedor(p.nome))
          .map((p: any) => ({
            id: p.id || p.user_id,
            user_id: p.user_id,
            nome: sanitizeVendedorNome(p.nome),
            email: p.email || null,
          }));

        if (filtered.length > 0) {
          list = filtered;
        }
      }
    } catch (err) {
      console.warn("[vendedores] Erro ao consultar via profiles/user_roles:", err);
    }
  }

  // 3. Fallback: Tabela vendedores
  if (list.length === 0) {
    try {
      const { data: tableData, error: tableErr } = await supabase
        .from("vendedores")
        .select("id, nome, email, user_id" as any)
        .order("nome");

      if (!tableErr && tableData && tableData.length > 0) {
        list = tableData
          .filter((item: any) => item.nome && isRealVendedor(item.nome))
          .map((item: any) => ({
            id: item.id,
            user_id: item.user_id,
            nome: sanitizeVendedorNome(item.nome),
            email: item.email || null,
          }));
      }
    } catch (err) {
      console.warn("[vendedores] Erro ao consultar tabela vendedores:", err);
    }
  }

  // 4. Se a lista ainda estiver vazia ou com dados incompletos, usa a lista oficial dos 5 vendedores
  if (list.length === 0) {
    list = [...DEFAULT_VENDEDORES];
  }

  // Remove eventuais duplicatas por nome normalizado
  const seenNames = new Set<string>();
  const uniqueList: VendedorProfile[] = [];
  for (const item of list) {
    const key = item.nome.toLowerCase().trim();
    if (!seenNames.has(key)) {
      seenNames.add(key);
      uniqueList.push(item);
    }
  }

  // Ordena por nome alfabeticamente
  return uniqueList.sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function fetchVendedores(): Promise<VendedorProfile[]> {
  const now = Date.now();
  if (cachedVendedores && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedVendedores;
  }

  if (inFlightPromise) {
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
