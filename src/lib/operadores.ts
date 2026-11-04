import { supabase } from "@/integrations/supabase/client";

export interface OperadorProfile {
  id: string;
  user_id?: string;
  nome: string;
  email?: string | null;
  setor_vinculado?: string | null;
}

/**
 * E-mails de administradores autorizados a operar ordens de serviço
 * e serem selecionados no campo "OPERADOR DA O.S."
 */
export const ADMIN_OPERATOR_EMAILS = [
  "embalagens@primacorgrafica.com.br",
  "coordenadorpre@primacorgrafica.com.br",
] as const;

export const ADMIN_OPERATOR_USER_IDS = [
  "0926b9b3-fe98-4a45-b449-79ed850b469f", // Leonardo (embalagens@primacorgrafica.com.br)
  "586b96f9-8ecf-4f69-8e68-4540c741d787", // Carlos Coelho (coordenadorpre@primacorgrafica.com.br)
] as const;

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
  const extraAllowedEmails = new Set(
    ADMIN_OPERATOR_EMAILS.map((e) => e.toLowerCase().trim())
  );
  const extraAllowedUserIds = new Set(ADMIN_OPERATOR_USER_IDS as readonly string[]);

  let baseList: OperadorProfile[] = [];

  // 1. Tenta chamar a RPC get_operadores (SECURITY DEFINER)
  try {
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("get_operadores");
    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      baseList = rpcData.map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        nome: item.nome,
        email: item.email || null,
        setor_vinculado: item.setor_vinculado || null,
      }));
    }
  } catch (err) {
    console.warn("[operadores] Falha ao invocar RPC get_operadores, usando fallback:", err);
  }

  // 2. Fallback: Consulta direta cruzando user_roles com role = 'operador' + administradores autorizados
  if (baseList.length === 0) {
    try {
      const [{ data: roles }, { data: profiles }] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "operador"),
        supabase.from("profiles").select("id, user_id, nome, email, setor_vinculado" as any).order("nome"),
      ]);

      const operadorUserIds = new Set((roles || []).map((r: any) => r.user_id));
      const filtered = (profiles || [])
        .filter((p: any) => {
          if (!p.user_id || !p.nome || p.nome.trim().length === 0) return false;
          if (operadorUserIds.has(p.user_id)) return true;
          if (extraAllowedUserIds.has(p.user_id)) return true;
          const email = (p.email || "").toLowerCase().trim();
          if (email && extraAllowedEmails.has(email)) return true;
          return false;
        })
        .map((p: any) => ({
          id: p.id,
          user_id: p.user_id,
          nome: p.nome,
          email: p.email || null,
          setor_vinculado: p.setor_vinculado || null,
        }));

      baseList = filtered;
    } catch (err) {
      console.error("[operadores] Erro ao consultar operadores via tabelas:", err);
      return [];
    }
  } else {
    // Se a RPC retornou, garante que os administradores autorizados também estejam na lista
    const missingAdminUserIds = Array.from(extraAllowedUserIds).filter(
      (uid) => !baseList.some((op) => op.user_id === uid)
    );
    if (missingAdminUserIds.length > 0) {
      try {
        const { data: adminProfiles } = await supabase
          .from("profiles")
          .select("id, user_id, nome, email, setor_vinculado" as any)
          .in("user_id", missingAdminUserIds);

        if (adminProfiles && adminProfiles.length > 0) {
          for (const ap of adminProfiles as any[]) {
            if (!baseList.some((op) => op.user_id === ap.user_id || op.nome === ap.nome)) {
              baseList.push({
                id: ap.id,
                user_id: ap.user_id,
                nome: ap.nome,
                email: ap.email || null,
                setor_vinculado: ap.setor_vinculado || null,
              });
            }
          }
          baseList.sort((a, b) => a.nome.localeCompare(b.nome));
        }
      } catch {
        // Fallback silencioso
      }
    }
  }

  return baseList;
}

/**
 * Retorna os perfis que possuem papel de 'operador' somados aos administradores autorizados
 * (embalagens@primacorgrafica.com.br e coordenadorpre@primacorgrafica.com.br).
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
