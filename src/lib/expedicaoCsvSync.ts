import { supabase } from "@/integrations/supabase/client";
import { cleanOsNumber } from "@/lib/orderRelationsService";
import { getActiveMicrosoftAccount, getSharePointAccessToken } from "@/lib/msalClient";
import {
  resolveSharePointSiteAndDrive,
  SHAREPOINT_EXPEDICAO_FOLDER,
} from "@/lib/sharepointService";
import { savePosicaoCache, type PosicaoCacheEntry } from "@/lib/csvPosicaoImporter";

export interface ExpedicaoCsvSyncResult {
  success: boolean;
  fileName?: string;
  totalRows: number;
  matchedCount?: number;
  updatedCount: number;
  skippedNoSession?: boolean;
  error?: string;
}

const LAST_SYNC_KEY = "kaban_expedicao_csv_last_modified_v2";

/**
 * Faz o parse de uma linha CSV respeitando aspas e separador ';' ou ','.
 */
function parseCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Converte string de data DD/MM/YYYY ou YYYY-MM-DD para ISO.
 */
function parseDateToIso(raw?: string | null): string | null {
  const s = (raw || "").trim();
  if (!s) return null;

  // DD/MM/YYYY (com ou sem hora)
  const brMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (brMatch) {
    const [, dd, mm, yyyy, hh = "18", min = "00"] = brMatch;
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T18:00:00`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}

/**
 * Busca todas as ordens não arquivadas paginando de 1000 em 1000 para nunca sofrer
 * truncamento pelo limite padrão de 1000 linhas do PostgREST/Supabase.
 */
async function fetchAllActiveOrdersPaginated(): Promise<{ data: any[]; error: string | null }> {
  const allRows: any[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await (supabase.from("orders") as any)
      .select("id, titulo, setor, entrega_endereco, entrega_data_limite, posicao_atual, data_posicao, previsao_cliente")
      .eq("arquivado", false)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      // Fallback caso colunas opcionais (posicao_atual / data_posicao / previsao_cliente) não existam no banco
      if (error.message?.includes("column") || error.code === "42703" || error.code === "PGRST204") {
        const fb = await (supabase.from("orders") as any)
          .select("id, titulo, setor, entrega_endereco, entrega_data_limite")
          .eq("arquivado", false)
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);

        if (fb.error) return { data: allRows, error: fb.error.message };
        if (fb.data) allRows.push(...fb.data);
        if (!fb.data || fb.data.length < pageSize) break;
        from += pageSize;
        continue;
      }
      return { data: allRows, error: error.message };
    }

    if (data) allRows.push(...data);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return { data: allRows, error: null };
}

/**
 * Lê automaticamente o arquivo CSV (ex.: "OS Ge-kanban.csv") da pasta EXPEDICAO no SharePoint
 * e atualiza as O.S. correspondentes no Supabase e no cache do Kanban.
 */
export async function syncExpedicaoCsvFromSharePoint(
  interactiveFallback = false
): Promise<ExpedicaoCsvSyncResult> {
  try {
    const account = await getActiveMicrosoftAccount();
    if (!account && !interactiveFallback) {
      return {
        success: false,
        totalRows: 0,
        updatedCount: 0,
        skippedNoSession: true,
      };
    }

    const token = await getSharePointAccessToken(interactiveFallback);
    if (!token) {
      return {
        success: false,
        totalRows: 0,
        updatedCount: 0,
        skippedNoSession: !interactiveFallback,
        error: "Token Microsoft 365 não disponível.",
      };
    }

    const { driveId } = await resolveSharePointSiteAndDrive(interactiveFallback);

    // Lista arquivos na pasta EXPEDICAO
    const listUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(
      SHAREPOINT_EXPEDICAO_FOLDER
    )}:/children?$select=id,name,lastModifiedDateTime,size,@microsoft.graph.downloadUrl`;

    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!listRes.ok) {
      const errText = await listRes.text().catch(() => "");
      return {
        success: false,
        totalRows: 0,
        updatedCount: 0,
        error: `Erro ao acessar pasta ${SHAREPOINT_EXPEDICAO_FOLDER} no SharePoint (${listRes.status}): ${errText}`,
      };
    }

    const listJson = await listRes.json();
    const items: any[] = listJson?.value || [];

    // Prioriza "OS Ge-kanban.csv" ou qualquer .csv mais recente
    const csvFiles = items
      .filter((it) => typeof it.name === "string" && it.name.toLowerCase().endsWith(".csv"))
      .sort((a, b) => {
        const aExact = a.name.toLowerCase() === "os ge-kanban.csv" ? 1 : 0;
        const bExact = b.name.toLowerCase() === "os ge-kanban.csv" ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        return String(b.lastModifiedDateTime || "").localeCompare(String(a.lastModifiedDateTime || ""));
      });

    if (csvFiles.length === 0) {
      return {
        success: true,
        totalRows: 0,
        updatedCount: 0,
        error: `Nenhum arquivo .csv encontrado na pasta ${SHAREPOINT_EXPEDICAO_FOLDER}.`,
      };
    }

    const targetFile = csvFiles[0];

    // Se não for execução manual, evita reprocessar o mesmo arquivo se não foi modificado
    if (!interactiveFallback && typeof window !== "undefined") {
      const lastMod = localStorage.getItem(LAST_SYNC_KEY);
      if (lastMod && lastMod === `${targetFile.id}:${targetFile.lastModifiedDateTime}`) {
        return {
          success: true,
          fileName: targetFile.name,
          totalRows: 0,
          updatedCount: 0,
        };
      }
    }

    // Baixa o conteúdo do CSV (decodifica Windows-1252 / UTF-8)
    const downloadUrl =
      targetFile["@microsoft.graph.downloadUrl"] ||
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${targetFile.id}/content`;

    const fileRes = await fetch(
      downloadUrl,
      targetFile["@microsoft.graph.downloadUrl"]
        ? undefined
        : { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!fileRes.ok) {
      return {
        success: false,
        fileName: targetFile.name,
        totalRows: 0,
        updatedCount: 0,
        error: `Falha ao baixar ${targetFile.name} (${fileRes.status}).`,
      };
    }

    const buffer = await fileRes.arrayBuffer();
    let rawText = "";
    try {
      const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      rawText = utf8;
    } catch {
      rawText = new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
    }
    rawText = rawText.replace(/^\uFEFF/, "");

    const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      return {
        success: true,
        fileName: targetFile.name,
        totalRows: 0,
        updatedCount: 0,
      };
    }

    const headerLine = lines[0];
    const sep = headerLine.includes(";") ? ";" : ",";
    const headers = parseCsvLine(headerLine, sep).map((h) =>
      h
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
    );

    const findCol = (candidates: string[], exclude?: string[]) =>
      headers.findIndex(
        (h) =>
          candidates.some((c) => h === c || h.includes(c)) &&
          (!exclude || !exclude.some((ex) => h.includes(ex)))
      );

    const idxOs = findCol(["nro os", "numero os", "os", "pedido", "nro"]);
    const idxDataPosicao = findCol(["dt.posicao", "dt posicao", "data posicao"]);
    const idxPosicao = findCol(["posicao", "etapa", "status"], ["dt", "data"]);
    const idxPrevisao = findCol(["previsao", "data entrega", "entrega"]);
    const idxEndereco = findCol(["endereco", "logradouro"]);

    if (idxOs === -1) {
      return {
        success: false,
        fileName: targetFile.name,
        totalRows: lines.length - 1,
        updatedCount: 0,
        error: `Coluna de OS não encontrada no arquivo ${targetFile.name}. Cabeçalhos lidos: ${headers.join(" | ")}`,
      };
    }

    // Busca TODAS as ordens ativas no Supabase (paginado de 1000 em 1000)
    const { data: activeOrders, error: ordersErr } = await fetchAllActiveOrdersPaginated();

    if (ordersErr) {
      return {
        success: false,
        fileName: targetFile.name,
        totalRows: lines.length - 1,
        updatedCount: 0,
        error: ordersErr || "Erro ao consultar ordens no Supabase.",
      };
    }

    // Agrupa TODAS as linhas do Supabase por número de OS limpo (evita atualizar apenas cópia de faturamento)
    const ordersByCleanOs = new Map<string, any[]>();
    for (const o of activeOrders) {
      const clean = cleanOsNumber(o.titulo);
      if (!clean) continue;
      const list = ordersByCleanOs.get(clean) || [];
      list.push(o);
      ordersByCleanOs.set(clean, list);
    }

    let matchedCount = 0;
    let updatedCount = 0;
    let firstError: string | undefined;
    const cacheEntries: Record<string, PosicaoCacheEntry> = {};
    const nowIso = new Date().toISOString();

    interface PendingOrderUpdate {
      id: string;
      cleanOs: string;
      isFaturamento: boolean;
      deliveryUpdates: Record<string, any>;
      extraUpdates: Record<string, any>;
    }

    const pendingUpdates: PendingOrderUpdate[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i], sep);
      const rawOs = cols[idxOs] || "";
      const cleanOs = cleanOsNumber(rawOs);
      if (!cleanOs) continue;

      const matchedList = ordersByCleanOs.get(cleanOs);
      if (!matchedList || matchedList.length === 0) continue;

      matchedCount++;

      const pos = idxPosicao !== -1 ? (cols[idxPosicao] || "").trim() : "";
      const dtPos = idxDataPosicao !== -1 ? (cols[idxDataPosicao] || "").trim() : "";
      const prevStr = idxPrevisao !== -1 ? (cols[idxPrevisao] || "").trim() : "";
      const addr = idxEndereco !== -1 ? (cols[idxEndereco] || "").trim() : "";
      const isoDate = parseDateToIso(prevStr);

      for (const matchedOrder of matchedList) {
        cacheEntries[matchedOrder.id] = {
          posicaoAtual: pos || null,
          dataPosicao: dtPos || null,
          previsaoCliente: prevStr || null,
          updatedAt: nowIso,
        };
        cacheEntries[cleanOs] = cacheEntries[matchedOrder.id];

        const deliveryUpdates: Record<string, any> = {};
        const extraUpdates: Record<string, any> = {};

        if (pos && pos !== (matchedOrder.posicao_atual || "")) {
          extraUpdates.posicao_atual = pos;
        }
        if (dtPos && dtPos !== (matchedOrder.data_posicao || "")) {
          extraUpdates.data_posicao = dtPos;
        }
        if (prevStr && prevStr !== (matchedOrder.previsao_cliente || "")) {
          extraUpdates.previsao_cliente = prevStr;
        }

        // Atualiza entrega_data_limite se estiver vazia OU se a previsão no CSV mudou
        if (
          isoDate &&
          (!matchedOrder.entrega_data_limite ||
            (prevStr && prevStr !== (matchedOrder.previsao_cliente || "")))
        ) {
          deliveryUpdates.entrega_data_limite = isoDate;
        }

        if (addr && !matchedOrder.entrega_endereco) {
          deliveryUpdates.entrega_endereco = addr;
        }

        if (Object.keys(deliveryUpdates).length > 0 || Object.keys(extraUpdates).length > 0) {
          pendingUpdates.push({
            id: matchedOrder.id,
            cleanOs,
            isFaturamento: matchedOrder.setor === "faturamento",
            deliveryUpdates,
            extraUpdates,
          });
        }
      }
    }

    // Executa atualizações em lotes paralelos de 25 para máxima velocidade
    const CHUNK_SIZE = 25;
    for (let i = 0; i < pendingUpdates.length; i += CHUNK_SIZE) {
      const chunk = pendingUpdates.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (item) => {
          let orderWasUpdated = false;

          if (Object.keys(item.deliveryUpdates).length > 0) {
            const { error: updErr } = await (supabase.from("orders") as any)
              .update(item.deliveryUpdates)
              .eq("id", item.id);

            if (!updErr) {
              orderWasUpdated = true;
            } else {
              console.warn(`[expedicaoCsvSync] Erro ao atualizar entrega OS ${item.cleanOs}:`, updErr);
              if (!firstError) firstError = updErr.message;
            }
          }

          if (Object.keys(item.extraUpdates).length > 0) {
            const { error: extraErr } = await (supabase.from("orders") as any)
              .update(item.extraUpdates)
              .eq("id", item.id);

            if (!extraErr) orderWasUpdated = true;
          }

          if (orderWasUpdated && !item.isFaturamento) {
            updatedCount++;
          }
        })
      );
    }

    if (Object.keys(cacheEntries).length > 0) {
      savePosicaoCache(cacheEntries);
    }

    if (typeof window !== "undefined") {
      localStorage.setItem(
        LAST_SYNC_KEY,
        `${targetFile.id}:${targetFile.lastModifiedDateTime}`
      );
    }

    return {
      success: true,
      fileName: targetFile.name,
      totalRows: lines.length - 1,
      matchedCount,
      updatedCount,
      error: updatedCount === 0 && firstError ? `Erro ao gravar no banco: ${firstError}` : undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      totalRows: 0,
      updatedCount: 0,
      error: err?.message || "Erro ao sincronizar CSV da Expedição.",
    };
  }
}
