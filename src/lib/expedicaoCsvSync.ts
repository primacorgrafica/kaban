import { supabase } from "@/integrations/supabase/client";
import { cleanOsNumber } from "@/lib/orderRelationsService";
import { getActiveMicrosoftAccount, getSharePointAccessToken } from "@/lib/msalClient";
import {
  resolveSharePointSiteAndDrive,
  SHAREPOINT_EXPEDICAO_FOLDER,
} from "@/lib/sharepointService";

export interface ExpedicaoCsvSyncResult {
  success: boolean;
  fileName?: string;
  totalRows: number;
  updatedCount: number;
  skippedNoSession?: boolean;
  error?: string;
}

const LAST_SYNC_KEY = "kaban_expedicao_csv_last_modified_v1";

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
 * Tenta converter string de data DD/MM/YYYY ou YYYY-MM-DD para ISO.
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
 * Lê automaticamente o arquivo CSV (ex.: "OS Ge-kanban.csv") da pasta EXPEDICAO no SharePoint
 * e atualiza as O.S. correspondentes no Supabase.
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

    // Baixa o conteúdo do CSV
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

    const rawText = (await fileRes.text()).replace(/^\uFEFF/, "");
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

    const findCol = (candidates: string[]) =>
      headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

    const idxOs = findCol(["nro os", "numero os", "os", "pedido", "nro"]);
    const idxPosicao = findCol(["posicao", "etapa", "status"]);
    const idxPrevisao = findCol(["previsao", "data entrega", "entrega"]);
    const idxEndereco = findCol(["endereco", "logradouro"]);

    if (idxOs === -1) {
      return {
        success: false,
        fileName: targetFile.name,
        totalRows: lines.length - 1,
        updatedCount: 0,
        error: `Coluna de OS não encontrada no arquivo ${targetFile.name}.`,
      };
    }

    // Busca ordens ativas no Supabase para cruzar pelo número da OS
    const { data: activeOrders, error: ordersErr } = await supabase
      .from("orders")
      .select("id, titulo, entrega_endereco, entrega_data_limite, posicao_atual, previsao_cliente")
      .eq("arquivado", false);

    if (ordersErr || !activeOrders) {
      return {
        success: false,
        fileName: targetFile.name,
        totalRows: lines.length - 1,
        updatedCount: 0,
        error: ordersErr?.message || "Erro ao consultar ordens no Supabase.",
      };
    }

    const orderByCleanOs = new Map<string, any>();
    for (const o of activeOrders) {
      const clean = cleanOsNumber(o.titulo);
      if (clean) orderByCleanOs.set(clean, o);
    }

    let updatedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i], sep);
      const rawOs = cols[idxOs] || "";
      const cleanOs = cleanOsNumber(rawOs);
      if (!cleanOs) continue;

      const matchedOrder = orderByCleanOs.get(cleanOs);
      if (!matchedOrder) continue;

      const deliveryUpdates: Record<string, any> = {};
      const extraUpdates: Record<string, any> = {};

      if (idxPosicao !== -1 && cols[idxPosicao]) {
        const pos = cols[idxPosicao].trim();
        if (pos && pos !== matchedOrder.posicao_atual) {
          extraUpdates.posicao_atual = pos;
        }
      }

      if (idxPrevisao !== -1 && cols[idxPrevisao]) {
        const prevStr = cols[idxPrevisao].trim();
        if (prevStr && prevStr !== matchedOrder.previsao_cliente) {
          extraUpdates.previsao_cliente = prevStr;
        }
        const isoDate = parseDateToIso(prevStr);
        if (isoDate && !matchedOrder.entrega_data_limite) {
          deliveryUpdates.entrega_data_limite = isoDate;
        }
      }

      if (idxEndereco !== -1 && cols[idxEndereco]) {
        const addr = cols[idxEndereco].trim();
        if (addr && !matchedOrder.entrega_endereco) {
          deliveryUpdates.entrega_endereco = addr;
        }
      }

      let rowUpdated = false;

      if (Object.keys(deliveryUpdates).length > 0) {
        const { error: updErr } = await (supabase.from("orders") as any)
          .update(deliveryUpdates)
          .eq("id", matchedOrder.id);

        if (!updErr) rowUpdated = true;
      }

      if (Object.keys(extraUpdates).length > 0) {
        const { error: extraErr } = await (supabase.from("orders") as any)
          .update(extraUpdates)
          .eq("id", matchedOrder.id);

        if (!extraErr) rowUpdated = true;
      }

      if (rowUpdated) updatedCount++;
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
      updatedCount,
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
