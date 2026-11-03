import { supabase } from "@/integrations/supabase/client";

export interface OperadorProfile {
  id: string;
  user_id?: string;
  nome: string;
  setor_vinculado?: string | null;
}

let cachedOperadores: OperadorProfile[] | null = null;
let lastFetchTime = 0;
let inFlightPromise: Promise<OperadorProfile[]> | null = null;
const CACHE_TTL_MS = 30000; // 30 segundos

export function clearOperadoresCache(): void {
  cachedOperadores = null;
  lastFetchTime = 0;
  inFlightPromise = null;
}

async function fetchBaseOperadores(): Promise<OperadorProfile[]> {
  // 1. Tenta chamar a RPC get_operadores (SECURITY DEFINER)
  try {
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("get_operadores");
    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      return rpcData.map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        nome: item.nome,
        setor_vinculado: item.setor_vinculado || null,
      }));
    }
  } catch (err) {
    console.warn("[operadores] Falha ao invocar RPC get_operadores, usando fallback:", err);
  }

  // 2. Fallback: Consulta direta cruzando user_roles com role = 'operador' e profiles
  try {
    const [{ data: roles }, { data: profiles }] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "operador"),
      supabase.from("profiles").select("id, user_id, nome, setor_vinculado").order("nome"),
    ]);

    const operadorUserIds = new Set((roles || []).map((r: any) => r.user_id));
    const filtered = (profiles || [])
      .filter((p) => p.user_id && operadorUserIds.has(p.user_id) && p.nome && p.nome.trim().length > 0)
      .map((p) => ({
        id: p.id,
        user_id: p.user_id,
        nome: p.nome,
        setor_vinculado: p.setor_vinculado || null,
      }));

    return filtered;
  } catch (err) {
    console.error("[operadores] Erro ao consultar operadores via tabelas:", err);
    return [];
  }
}

/**
 * Retorna exclusivamente os perfis que possuem papel de 'operador'.
 * Se `currentOperador` for informado e não estiver na lista (ex: atribuído historicamente),
 * inclui-o na lista de opções para manter a integridade visual da seleção.
 */
export async function fetchOperadoresList(currentOperador?: string | null): Promise<OperadorProfile[]> {
  const now = Date.now();
  if (cachedOperadores && now - lastFetchTime < CACHE_TTL_MS) {
    return prepareResult(cachedOperadores, currentOperador);
  }

  if (inFlightPromise) {
    const base = await inFlightPromise;
    return prepareResult(base, currentOperador);
  }

  inFlightPromise = fetchBaseOperadores()
    .then((result) => {
      cachedOperadores = result;
      lastFetchTime = Date.now();
      inFlightPromise = null;
      return result;
    })
    .catch((err) => {
      inFlightPromise = null;
      throw err;
    });

  const base = await inFlightPromise;
  return prepareResult(base, currentOperador);
}

function prepareResult(base: OperadorProfile[], currentOperador?: string | null): OperadorProfile[] {
  let list = [...base];
  if (currentOperador && currentOperador.trim().length > 0 && !list.some((o) => o.nome === currentOperador)) {
    list = [
      {
        id: "current-assigned-op",
        user_id: "",
        nome: currentOperador,
        setor_vinculado: null,
      },
      ...list,
    ];
  }
  return list;
}
