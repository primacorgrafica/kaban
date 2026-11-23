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
      if (/nro\s*os|n[úu]mero\s*os|^\s*os\b/i.test(h)) colOs = idx;
      else if (/posi[çc][ãa]o\s*atual|posi[çc][ãa]o/i.test(h)) colPosicao = idx;
      else if (/dt\.?\s*posi|data\s*posi/i.test(h)) colDataPosicao = idx;
      else if (/previs[ãa]o\s*cliente|previs[ãa]o/i.test(h)) colPrevisao = idx;
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

  // Executa os updates no Supabase em lotes concorrentes para alta performance
  const CHUNK_SIZE = 15;
  const total = updatesToApply.length;
  let processed = 0;

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = updatesToApply.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (item) => {
        const payload = {
          posicao_atual: item.posicaoAtual,
          data_posicao: item.dataPosicao,
          previsao_cliente: item.previsaoCliente,
          updated_at: new Date().toISOString(),
        };

        const { error } = await (supabase.from("orders") as any)
          .update(payload)
          .eq("id", item.order.id);

        if (error) {
          console.warn(`[csvPosicaoImporter] Erro ao atualizar O.S #${item.order.titulo}:`, error);
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
  };

  return { result, updatedOrdersMap };
}
