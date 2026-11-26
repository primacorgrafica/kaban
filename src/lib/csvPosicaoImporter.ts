import { supabase } from "@/integrations/supabase/client";
import { Order } from "@/types/order";
import { cleanOsNumber } from "@/lib/orderRelationsService";

export interface CsvPosicaoRow {
  nroOs: string;
  posicaoAtual: string | null;
  dataPosicao: string | null;
  previsaoCliente: string | null;
}

export interface CsvImportResult {
  totalRows: number;
  updatedCount: number;
  skippedCount: number;
  updatedOrders: { os: string; id: string; posicaoAtual: string | null }[];
  notFoundOsList: string[];
  databaseColumnsMissing?: boolean;
}

export const POSICAO_CACHE_KEY = "kaban_producao_posicao_csv_cache_v1";

export interface PosicaoCacheEntry {
  posicaoAtual: string | null;
  dataPosicao: string | null;
  previsaoCliente: string | null;
  updatedAt: string;
}

/**
 * Lê o mapa em cache local de posições e previsões importadas via CSV.
 */
export function getPosicaoCache(): Record<string, PosicaoCacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(POSICAO_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn("[csvPosicaoImporter] Erro ao ler cache local de posições:", e);
    return {};
  }
}

/**
 * Salva ou mescla registros no cache persistente do navegador.
 */
export function savePosicaoCache(entries: Record<string, PosicaoCacheEntry>): void {
  if (typeof window === "undefined") return;
  try {
    const current = getPosicaoCache();
    const merged = { ...current, ...entries };
    localStorage.setItem(POSICAO_CACHE_KEY, JSON.stringify(merged));
  } catch (e) {
    console.warn("[csvPosicaoImporter] Erro ao salvar cache local de posições:", e);
  }
}

/**
 * Busca a posição/previsão em cache por UUID da ordem ou por número limpo de OS.
 */
export function getPosicaoFromCache(
  orderId?: string | null,
  osNumber?: string | null
): PosicaoCacheEntry | null {
  if (!orderId && !osNumber) return null;
  const cache = getPosicaoCache();
  if (orderId && cache[orderId]) return cache[orderId];
  if (osNumber && cache[osNumber]) return cache[osNumber];
  return null;
}

/**
 * Lê o conteúdo do arquivo com detecção preferencial para Windows-1252 (padrão Excel BR)
 * com fallback para UTF-8.
 */
export async function readFileWithEncoding(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();

  try {
    // Tenta primeiro Windows-1252 (comum em arquivos exportados do Excel no Brasil)
    const decoder1252 = new TextDecoder("windows-1252", { fatal: false });
    const text1252 = decoder1252.decode(buffer);

    // Se o texto não possui caracteres corrompidos óbvios e parece bom, usamos 1252
    // Mas se o arquivo era UTF-8 com acentos, podemos checar se UTF-8 é mais limpo
    try {
      const decoderUtf8 = new TextDecoder("utf-8", { fatal: true });
      const textUtf8 = decoderUtf8.decode(buffer);
      // Se decodificou UTF-8 estrito sem erro, preferimos UTF-8 se tiver acentos válidos
      if (/[ãáéíóúçõâêôü]/i.test(textUtf8)) {
        return textUtf8;
      }
    } catch {
      // Falhou utf-8 estrito, logo é windows-1252 com certeza
    }

    return text1252;
  } catch {
    // Fallback padrão se TextDecoder falhar
    return await file.text();
  }
}

/**
 * Faz o parse do texto bruto do CSV em linhas estruturadas.
 */
export function parsePosicaoCsv(csvText: string): CsvPosicaoRow[] {
  if (!csvText || !csvText.trim()) return [];

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Detecta o delimitador na primeira linha
  const firstLine = lines[0];
  const delimiter = firstLine.includes(";") ? ";" : ",";

  let startIndex = 0;
  let colOs = 0;
  let colPosicao = 1;
  let colDataPosicao = 2;
  let colPrevisao = 3;

  // Verifica se a primeira linha é o cabeçalho
  const headers = firstLine.split(delimiter).map((h) => h.trim().toLowerCase());
  const hasHeader = headers.some(
    (h) =>
      /nro|os|ordem/i.test(h) ||
      /posi/i.test(h) ||
      /dt/i.test(h) ||
      /previs/i.test(h)
  );

  if (hasHeader) {
    startIndex = 1;
    headers.forEach((h, idx) => {
      const clean = h
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

      if (/^nro|^os\b|numero.*os|ordem/i.test(clean)) {
        colOs = idx;
      } else if (/dt|data/i.test(clean) && /posi/i.test(clean)) {
        colDataPosicao = idx;
      } else if (/previs/i.test(clean)) {
        colPrevisao = idx;
      } else if (/posi/i.test(clean) && !/dt|data/i.test(clean)) {
        colPosicao = idx;
      }
    });
  }

  const results: CsvPosicaoRow[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;

    const cols = rawLine.split(delimiter);
    if (cols.length === 0) continue;

    const rawOs = cols[colOs]?.trim() || "";
    const cleanOs = cleanOsNumber(rawOs);
    if (!cleanOs) continue;

    const rawPosicao = cols[colPosicao]?.trim() || "";
    const rawDataPos = cols[colDataPosicao]?.trim() || "";
    const rawPrevisao = cols[colPrevisao]?.trim() || "";

    results.push({
      nroOs: cleanOs,
      posicaoAtual: rawPosicao.length > 0 ? rawPosicao : null,
      dataPosicao: rawDataPos.length > 0 ? rawDataPos : null,
      previsaoCliente: rawPrevisao.length > 0 ? rawPrevisao : null,
    });
  }

  return results;
}

/**
 * Importa e sincroniza os dados do CSV com as ordens do Kaban no Supabase.
 * Apenas atualiza as ordens que já existem no Kaban; ignora as não encontradas.
 */
export async function importPosicaoCsv(
  parsedRows: CsvPosicaoRow[],
  currentOrders: Order[],
  onProgress?: (processed: number, total: number) => void
): Promise<{
  result: CsvImportResult;
  updatedOrdersMap: Map<string, Partial<Order>>;
}> {
  // Cria índice rápido de O.S. existentes: cleanOsNumber -> Order
  const orderMap = new Map<string, Order>();
  currentOrders.forEach((o) => {
    const osNum = cleanOsNumber(o.titulo);
    if (osNum) {
      orderMap.set(osNum, o);
    }
  });

  const updatesToApply: {
    order: Order;
    posicaoAtual: string | null;
    dataPosicao: string | null;
    previsaoCliente: string | null;
  }[] = [];

  const notFoundOsList: string[] = [];
  const updatedOrdersMap = new Map<string, Partial<Order>>();

  for (const row of parsedRows) {
    const matchedOrder = orderMap.get(row.nroOs);
    if (matchedOrder) {
      updatesToApply.push({
        order: matchedOrder,
        posicaoAtual: row.posicaoAtual,
        dataPosicao: row.dataPosicao,
        previsaoCliente: row.previsaoCliente,
      });

      updatedOrdersMap.set(matchedOrder.id, {
        posicao_atual: row.posicaoAtual,
        data_posicao: row.dataPosicao,
        previsao_cliente: row.previsaoCliente,
      });
    } else {
      notFoundOsList.push(row.nroOs);
    }
  }

  // 1. Salva imediatamente no cache local persistente (localStorage) para que os dados NUNCA sumam
  const cacheEntries: Record<string, PosicaoCacheEntry> = {};
  const nowIso = new Date().toISOString();
  for (const item of updatesToApply) {
    const entry: PosicaoCacheEntry = {
      posicaoAtual: item.posicaoAtual,
      dataPosicao: item.dataPosicao,
      previsaoCliente: item.previsaoCliente,
      updatedAt: nowIso,
    };
    cacheEntries[item.order.id] = entry;
    const cleanNum = cleanOsNumber(item.order.titulo);
    if (cleanNum) {
      cacheEntries[cleanNum] = entry;
    }
  }
  savePosicaoCache(cacheEntries);

  // 2. Executa os updates no Supabase em lotes concorrentes para alta performance
  const CHUNK_SIZE = 15;
  const total = updatesToApply.length;
  let processed = 0;
  let databaseColumnsMissing = false;

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = updatesToApply.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (item) => {
        const payload: Record<string, any> = {
          posicao_atual: item.posicaoAtual,
          data_posicao: item.dataPosicao,
          previsao_cliente: item.previsaoCliente,
          updated_at: new Date().toISOString(),
        };

        if (item.previsaoCliente && !item.order.entrega_data_limite) {
          const brMatch = item.previsaoCliente.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
          if (brMatch) {
            const iso = new Date(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}T18:00:00`);
            if (!isNaN(iso.getTime())) {
              payload.entrega_data_limite = iso.toISOString();
            }
          }
        }

        const { error } = await (supabase.from("orders") as any)
          .update(payload)
          .eq("id", item.order.id);

        if (error) {
          if (
            error.code === "PGRST204" ||
            error.code === "42703" ||
            error.message?.includes("column")
          ) {
            databaseColumnsMissing = true;
          }
          console.warn(`[csvPosicaoImporter] Aviso ao atualizar O.S #${item.order.titulo} no Supabase:`, error);
        }
      })
    );

    processed += chunk.length;
    if (onProgress) {
      onProgress(processed, total);
    }
  }

  const result: CsvImportResult = {
    totalRows: parsedRows.length,
    updatedCount: updatesToApply.length,
    skippedCount: notFoundOsList.length,
    updatedOrders: updatesToApply.map((u) => ({
      os: cleanOsNumber(u.order.titulo) || u.order.titulo,
      id: u.order.id,
      posicaoAtual: u.posicaoAtual,
    })),
    notFoundOsList,
    databaseColumnsMissing,
  };

  return { result, updatedOrdersMap };
}
