import { supabase } from "@/integrations/supabase/client";
import type { Localidade, LocalidadeComRegional, LocalidadeTipo, Regional } from "@/types/delivery";
import { REGIONAIS_SEED_DATA, slugifyRegionalText } from "./regionaisSeed";

export interface RegionalWithCount extends Regional {
  localidades_count: number;
}

export interface FetchLocalidadesParams {
  regionalId?: string | null;
  search?: string;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedLocalidadesResult {
  data: LocalidadeComRegional[];
  total: number;
  error: string | null;
}

function normalizeMatchText(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Busca todas as regionais cadastradas no Supabase (ordenadas por `ordem` e `nome`),
 * incluindo contagem agregada de localidades sem carregar payloads desnecessários.
 */
export async function fetchRegionais(
  includeInactive = false
): Promise<{ data: RegionalWithCount[]; error: string | null; missingTable?: boolean }> {
  try {
    let query = (supabase.from("regionais" as any) as any)
      .select("*, localidades(count)")
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });

    if (!includeInactive) {
      query = query.eq("ativo", true);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return {
          data: [],
          error: "Tabela 'regionais' ainda não implantada no Supabase.",
          missingTable: true,
        };
      }
      return { data: [], error: error.message };
    }

    const mapped: RegionalWithCount[] = ((data as any[]) || []).map((row) => ({
      id: row.id,
      nome: row.nome,
      slug: row.slug,
      ativo: row.ativo,
      ordem: row.ordem,
      created_at: row.created_at,
      updated_at: row.updated_at,
      localidades_count: Array.isArray(row.localidades) && row.localidades[0]?.count !== undefined
        ? Number(row.localidades[0].count)
        : 0,
    }));

    return { data: mapped, error: null };
  } catch (err: any) {
    return { data: [], error: err?.message || "Erro ao carregar regionais." };
  }
}

/**
 * Carrega somente as localidades vinculadas a uma regional (para seletores inteligentes).
 */
export async function fetchLocalidadesByRegional(
  regionalId: string,
  includeInactive = false
): Promise<{ data: Localidade[]; error: string | null }> {
  if (!regionalId) return { data: [], error: null };
  try {
    let query = (supabase.from("localidades" as any) as any)
      .select("*")
      .eq("regional_id", regionalId)
      .order("nome", { ascending: true });

    if (!includeInactive) {
      query = query.eq("ativo", true);
    }

    const { data, error } = await query;
    if (error) return { data: [], error: error.message };
    return { data: (data as Localidade[]) || [], error: null };
  } catch (err: any) {
    return { data: [], error: err?.message || "Erro ao carregar localidades da regional." };
  }
}

/**
 * Busca localidades paginadas com filtro por regional, busca textual e status.
 */
export async function fetchLocalidadesPaginated({
  regionalId,
  search,
  includeInactive = true,
  page = 1,
  pageSize = 30,
}: FetchLocalidadesParams): Promise<PaginatedLocalidadesResult> {
  try {
    const safePage = Math.max(1, page);
    const from = (safePage - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = (supabase.from("localidades" as any) as any)
      .select("*, regional:regionais(id, nome, slug, ativo, ordem)", { count: "exact" })
      .order("nome", { ascending: true })
      .range(from, to);

    if (regionalId) {
      query = query.eq("regional_id", regionalId);
    }

    if (!includeInactive) {
      query = query.eq("ativo", true);
    }

    if (search?.trim()) {
      const term = search.trim();
      query = query.ilike("nome", `%${term}%`);
    }

    const { data, count, error } = await query;

    if (error) {
      return { data: [], total: 0, error: error.message };
    }

    return {
      data: (data as LocalidadeComRegional[]) || [],
      total: count ?? 0,
      error: null,
    };
  } catch (err: any) {
    return { data: [], total: 0, error: err?.message || "Erro ao pesquisar localidades." };
  }
}

/**
 * Carrega todas as localidades ativas (com nome da regional) para classificação automática de endereços.
 */
export async function fetchAllActiveLocalidadesForMatching(): Promise<LocalidadeComRegional[]> {
  try {
    const { data, error } = await (supabase.from("localidades" as any) as any)
      .select("*, regional:regionais(id, nome, slug, ativo, ordem)")
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (error || !data) return [];
    return (data as LocalidadeComRegional[]).filter((loc) => loc.regional?.ativo !== false);
  } catch {
    return [];
  }
}

/**
 * Classifica um endereço de entrega contra as localidades cadastradas (ou seed fallback),
 * retornando regional_id, localidade_id e nome da regional.
 * Prioriza correspondências mais longas/específicas (ex.: "Novo São Lucas" antes de "São Lucas").
 */
export function matchRegionAndLocalityFromAddress(
  address: string | null | undefined,
  localidades: LocalidadeComRegional[] = []
): {
  regionalId: string | null;
  localidadeId: string | null;
  regionalNome: string | null;
  localidadeNome: string | null;
} {
  const normalizedAddr = normalizeMatchText(address || "");
  if (!normalizedAddr || normalizedAddr.length < 3) {
    return { regionalId: null, localidadeId: null, regionalNome: null, localidadeNome: null };
  }

  // Monta candidatos a partir do banco ou fallback do seed oficial
  const candidates: Array<{
    regionalId: string | null;
    localidadeId: string | null;
    regionalNome: string;
    localidadeNome: string;
    matchTerm: string;
  }> = [];

  if (localidades.length > 0) {
    for (const loc of localidades) {
      if (!loc.ativo) continue;
      const regionalNome = loc.regional?.nome || "";
      if (!regionalNome) continue;
      const cleanName = loc.nome.replace(/\s*\([^)]*\)/g, "").trim();
      const norm = normalizeMatchText(cleanName);
      if (norm.length < 3) continue;
      candidates.push({
        regionalId: loc.regional_id,
        localidadeId: loc.id,
        regionalNome,
        localidadeNome: loc.nome,
        matchTerm: norm,
      });
    }
  } else {
    for (const reg of REGIONAIS_SEED_DATA) {
      for (const loc of reg.localidades) {
        const cleanName = loc.nome.replace(/\s*\([^)]*\)/g, "").trim();
        const norm = normalizeMatchText(cleanName);
        if (norm.length < 3) continue;
        candidates.push({
          regionalId: null,
          localidadeId: null,
          regionalNome: reg.nome,
          localidadeNome: loc.nome,
          matchTerm: norm,
        });
      }
    }
  }

  // Mais longos primeiro para evitar falso positivo (ex: "Novo São Lucas" antes de "São Lucas", "Centro" por último entre os curtos)
  candidates.sort((a, b) => b.matchTerm.length - a.matchTerm.length);

  for (const cand of candidates) {
    const regex = new RegExp(`(?:^|\\s)${escapeRegExp(cand.matchTerm)}(?:$|\\s)`, "i");
    if (regex.test(normalizedAddr)) {
      return {
        regionalId: cand.regionalId,
        localidadeId: cand.localidadeId,
        regionalNome: cand.regionalNome,
        localidadeNome: cand.localidadeNome,
      };
    }
  }

  return { regionalId: null, localidadeId: null, regionalNome: null, localidadeNome: null };
}

export async function createRegional(input: {
  nome: string;
  ordem?: number;
  ativo?: boolean;
}): Promise<{ data?: Regional; error?: string }> {
  const nome = input.nome.trim();
  if (!nome) return { error: "Informe o nome da regional." };
  const slug = slugifyRegionalText(nome);
  if (!slug) return { error: "Nome inválido para gerar identificador." };

  const { data, error } = await (supabase.from("regionais" as any) as any)
    .insert({
      nome,
      slug,
      ordem: input.ordem ?? 99,
      ativo: input.ativo ?? true,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data: data as Regional };
}

export async function updateRegional(
  id: string,
  updates: { nome?: string; ordem?: number; ativo?: boolean }
): Promise<{ data?: Regional; error?: string }> {
  const payload: Record<string, any> = {};
  if (updates.nome !== undefined) {
    const nome = updates.nome.trim();
    if (!nome) return { error: "Nome da regional não pode ser vazio." };
    payload.nome = nome;
    payload.slug = slugifyRegionalText(nome);
  }
  if (updates.ordem !== undefined) payload.ordem = updates.ordem;
  if (updates.ativo !== undefined) payload.ativo = updates.ativo;

  const { data, error } = await (supabase.from("regionais" as any) as any)
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { data: data as Regional };
}

export async function deleteRegional(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await (supabase.from("regionais" as any) as any)
    .delete()
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function createLocalidade(input: {
  regional_id: string;
  nome: string;
  tipo: LocalidadeTipo;
  ativo?: boolean;
}): Promise<{ data?: Localidade; error?: string }> {
  const nome = input.nome.trim();
  if (!input.regional_id) return { error: "Selecione a regional." };
  if (!nome) return { error: "Informe o nome do bairro ou cidade." };
  const slug = slugifyRegionalText(nome);
  if (!slug) return { error: "Nome inválido para gerar identificador." };

  const { data, error } = await (supabase.from("localidades" as any) as any)
    .insert({
      regional_id: input.regional_id,
      nome,
      tipo: input.tipo || "bairro",
      slug,
      ativo: input.ativo ?? true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Esta localidade já está cadastrada nesta regional." };
    }
    return { error: error.message };
  }
  return { data: data as Localidade };
}

export async function updateLocalidade(
  id: string,
  updates: { regional_id?: string; nome?: string; tipo?: LocalidadeTipo; ativo?: boolean }
): Promise<{ data?: Localidade; error?: string }> {
  const payload: Record<string, any> = {};
  if (updates.regional_id !== undefined) payload.regional_id = updates.regional_id;
  if (updates.nome !== undefined) {
    const nome = updates.nome.trim();
    if (!nome) return { error: "Nome da localidade não pode ser vazio." };
    payload.nome = nome;
    payload.slug = slugifyRegionalText(nome);
  }
  if (updates.tipo !== undefined) payload.tipo = updates.tipo;
  if (updates.ativo !== undefined) payload.ativo = updates.ativo;

  const { data, error } = await (supabase.from("localidades" as any) as any)
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe uma localidade com esse nome na regional selecionada." };
    }
    return { error: error.message };
  }
  return { data: data as Localidade };
}

export async function deleteLocalidade(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await (supabase.from("localidades" as any) as any)
    .delete()
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
