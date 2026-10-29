import { getSharePointAccessToken, AZURE_CLIENT_ID } from "./msalClient";
import { supabase } from "@/integrations/supabase/client";
import type {
  DriveItemResponse,
  SharePointFolderInfo,
} from "@/types/sharepoint";

// Configurações do SharePoint corporativo da Primacor
export const SHAREPOINT_HOSTNAME =
  import.meta.env.VITE_SHAREPOINT_HOSTNAME || "primacorgraficaeditora.sharepoint.com";

export const SHAREPOINT_SITE_PATH =
  import.meta.env.VITE_SHAREPOINT_SITE_PATH || "/sites/Produo_grupo";

export const SHAREPOINT_LIBRARY_NAME = "Documentos Compartilhados";
export const SHAREPOINT_ROOT_FOLDER = "KABAN";
export const SHAREPOINT_PROTOCOLOS_FOLDER = "PROTOCOLOS ENTREGAS";
export const SHAREPOINT_PROTOCOLOS_URL =
  "https://primacorgraficaeditora.sharepoint.com/:f:/r/sites/Produo_grupo/Documentos%20Compartilhados/PROTOCOLOS%20ENTREGAS?d=w6d1c764f98fa415bb9da6ae45c5cd6c1&csf=1&web=1&e=N7qmhi";

// Limite para upload direto simples (4 MB). Acima disso, usa Upload Session em chunks.
const DIRECT_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

// Tamanho do chunk para upload session: 5 MB (múltiplo exato de 320 KiB = 16 * 327.680 bytes)
const CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

// Cache em memória de Site ID e Drive ID para evitar chamadas de descoberta repetidas
let cachedSiteId: string | null = null;
let cachedDriveId: string | null = null;
let cachedKabanFolderId: string | null = null;
let cachedProtocolosFolderId: string | null = null;

/**
 * Limpa o cache em memória de Site ID e Drive ID (útil após concessão de novas permissões)
 */
export function resetSharePointCache(): void {
  cachedSiteId = null;
  cachedDriveId = null;
  cachedKabanFolderId = null;
  cachedProtocolosFolderId = null;
}

/**
 * Formata o nome padronizado da pasta da O.S. no SharePoint.
 * Exemplo: "1045" ou "OS 1045" -> "OS-1045"
 */
export function formatOsFolderName(osIdentifier: string, osNumberDisplay?: string): string {
  const candidate = osNumberDisplay?.trim();
  if (candidate) {
    // Remove prefixos redundantes "OS-", "OS ", "OS."
    const cleanNumber = candidate.replace(/^OS[\s._-]*/i, "").trim();
    // Sanitiza caracteres proibidos no SharePoint (\ / : * ? " < > | # %)
    const sanitized = cleanNumber.replace(/[\/\\:*?"<>|#%]/g, "_").trim();
    if (sanitized) return `OS-${sanitized}`;
  }
  // Fallback para identificador persistente caso não haja número informado
  const fallback = osIdentifier.length > 8 ? osIdentifier.slice(0, 8) : osIdentifier;
  return `OS-${fallback}`;
}

/**
 * Resolve o Site ID e Drive ID do SharePoint corporativo via Microsoft Graph API
 */
export async function resolveSharePointSiteAndDrive(interactiveFallback = true): Promise<{ siteId: string; driveId: string }> {
  if (cachedSiteId && cachedDriveId) {
    return { siteId: cachedSiteId, driveId: cachedDriveId };
  }

  const token = await getSharePointAccessToken(interactiveFallback);

  // 1. Obter Site ID
  const cleanSitePath = SHAREPOINT_SITE_PATH.startsWith("/")
    ? SHAREPOINT_SITE_PATH
    : `/${SHAREPOINT_SITE_PATH}`;
  const siteUrl = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_HOSTNAME}:${cleanSitePath}`;
  const siteRes = await fetch(siteUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!siteRes.ok) {
    const errorBody = await siteRes.json().catch(() => ({}));
    if (siteRes.status === 403 || siteRes.status === 401) {
      throw new Error(
        `Permissão negada no SharePoint (${siteRes.status}). O aplicativo "Kaban - Integração SharePoint" requer permissão no site "${SHAREPOINT_SITE_PATH}". Se usar Sites.Selected, o administrador precisa conceder acesso no site via PowerShell ou Graph API.`
      );
    }
    throw new Error(
      `Falha ao localizar site do SharePoint (${siteRes.status}): ${errorBody?.error?.message || siteRes.statusText}`
    );
  }

  const siteData = await siteRes.json();
  const foundSiteId = siteData.id;
  console.info("[SharePoint] Site localizado com sucesso:", {
    id: siteData.id,
    name: siteData.name,
    displayName: siteData.displayName,
    webUrl: siteData.webUrl,
  });

  // 2. Obter Drive ID (Documentos Compartilhados)
  // Tentativa 1: Endpoint canônico da biblioteca padrão do site (/drive)
  try {
    const defaultDriveUrl = `https://graph.microsoft.com/v1.0/sites/${foundSiteId}/drive`;
    const defaultDriveRes = await fetch(defaultDriveUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (defaultDriveRes.ok) {
      const defaultDriveData = await defaultDriveRes.json();
      if (defaultDriveData?.id) {
        cachedSiteId = foundSiteId;
        cachedDriveId = defaultDriveData.id;
        console.info("[SharePoint] Biblioteca padrão identificada via /drive:", {
          id: defaultDriveData.id,
          name: defaultDriveData.name,
        });
        return { siteId: cachedSiteId, driveId: cachedDriveId };
      }
    } else {
      const defaultErr = await defaultDriveRes.json().catch(() => ({}));
      console.warn("[SharePoint] /drive padrão retornou status", defaultDriveRes.status, defaultErr);
    }
  } catch (err) {
    console.warn("[SharePoint] Falha ao consultar /drive padrão:", err);
  }

  // Tentativa 2: Listar todas as bibliotecas de documentos do site (/drives)
  try {
    const drivesUrl = `https://graph.microsoft.com/v1.0/sites/${foundSiteId}/drives`;
    const drivesRes = await fetch(drivesUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (drivesRes.ok) {
      const drivesData = await drivesRes.json();
      const drives: Array<{ id: string; name: string }> = drivesData.value || [];

      // Localiza "Documentos Compartilhados" ou "Documentos" ou "Documents" ou primeira biblioteca
      const targetDrive =
        drives.find(
          (d) =>
            d.name?.toLowerCase() === "documentos compartilhados" ||
            d.name?.toLowerCase() === "documentos" ||
            d.name?.toLowerCase() === "documents"
        ) || drives[0];

      if (targetDrive?.id) {
        cachedSiteId = foundSiteId;
        cachedDriveId = targetDrive.id;
        console.info("[SharePoint] Biblioteca identificada via /drives:", targetDrive);
        return { siteId: cachedSiteId, driveId: cachedDriveId };
      }
    } else {
      const drivesErr = await drivesRes.json().catch(() => ({}));
      console.warn("[SharePoint] /drives retornou status", drivesRes.status, drivesErr);
    }
  } catch (err) {
    console.warn("[SharePoint] Falha ao consultar /drives:", err);
  }

  // Tentativa 3: Listas com biblioteca expandida (/lists?$expand=drive)
  try {
    const listsUrl = `https://graph.microsoft.com/v1.0/sites/${foundSiteId}/lists?$expand=drive($select=id,name)`;
    const listsRes = await fetch(listsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (listsRes.ok) {
      const listsData = await listsRes.json();
      const listsWithDrives = (listsData.value || []).filter((l: any) => l.drive && l.drive.id);
      const targetList =
        listsWithDrives.find(
          (l: any) =>
            l.name?.toLowerCase() === "documentos compartilhados" ||
            l.displayName?.toLowerCase() === "documentos compartilhados" ||
            l.name?.toLowerCase() === "documentos" ||
            l.displayName?.toLowerCase() === "documentos" ||
            l.name?.toLowerCase() === "documents"
        ) || listsWithDrives[0];

      if (targetList?.drive?.id) {
        cachedSiteId = foundSiteId;
        cachedDriveId = targetList.drive.id;
        console.info("[SharePoint] Biblioteca identificada via /lists expand:", targetList.drive);
        return { siteId: cachedSiteId, driveId: cachedDriveId };
      }
    }
  } catch (err) {
    console.warn("[SharePoint] Falha ao consultar /lists:", err);
  }

  // Se nenhuma biblioteca foi localizada após todas as tentativas
  throw new Error(
    `Nenhuma biblioteca de documentos acessível no site "${siteData.displayName || SHAREPOINT_SITE_PATH}". ` +
    `Se o aplicativo utiliza "Sites.Selected", um administrador do Microsoft 365 precisa conceder permissão de escrita (Write) no site para o App ID "${AZURE_CLIENT_ID}".`
  );
}

/**
 * Garante que a pasta raiz KABAN existe dentro de Documentos Compartilhados
 */
export async function ensureKabanRootFolder(): Promise<string> {
  if (cachedKabanFolderId) return cachedKabanFolderId;

  const { siteId, driveId } = await resolveSharePointSiteAndDrive();
  const token = await getSharePointAccessToken();

  // 1. Tenta obter pasta KABAN existente
  const checkUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${SHAREPOINT_ROOT_FOLDER}`;
  const checkRes = await fetch(checkUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (checkRes.ok) {
    const kabanData = await checkRes.json();
    cachedKabanFolderId = kabanData.id;
    return cachedKabanFolderId!;
  }

  // 2. Se não existir (404), cria a pasta raiz KABAN
  if (checkRes.status === 404) {
    const createUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root/children`;
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: SHAREPOINT_ROOT_FOLDER,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });

    if (createRes.ok) {
      const createdData = await createRes.json();
      cachedKabanFolderId = createdData.id;
      return cachedKabanFolderId!;
    }

    // Se houve concorrência e já foi criada (409)
    if (createRes.status === 409) {
      const retryRes = await fetch(checkUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (retryRes.ok) {
        const retryData = await retryRes.json();
        cachedKabanFolderId = retryData.id;
        return cachedKabanFolderId!;
      }
    }
  }

  throw new Error(`Não foi possível acessar ou criar a pasta raiz ${SHAREPOINT_ROOT_FOLDER} no SharePoint.`);
}

/**
 * Garante que a pasta 'PROTOCOLOS ENTREGAS' existe na raiz da biblioteca Documentos Compartilhados.
 */
export async function getOrCreateProtocolosFolder(interactiveFallback = true): Promise<SharePointFolderInfo> {
  if (cachedProtocolosFolderId) {
    const { siteId, driveId } = await resolveSharePointSiteAndDrive(interactiveFallback);
    return {
      folderId: cachedProtocolosFolderId,
      folderName: SHAREPOINT_PROTOCOLOS_FOLDER,
      siteId,
      driveId,
    };
  }

  const { siteId, driveId } = await resolveSharePointSiteAndDrive(interactiveFallback);
  const token = await getSharePointAccessToken(interactiveFallback);

  // 1. Tenta obter pasta PROTOCOLOS ENTREGAS existente na raiz
  const checkUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${encodeURIComponent(
    SHAREPOINT_PROTOCOLOS_FOLDER
  )}`;
  const checkRes = await fetch(checkUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (checkRes.ok) {
    const folderData: DriveItemResponse = await checkRes.json();
    cachedProtocolosFolderId = folderData.id;
    return {
      folderId: folderData.id,
      folderName: folderData.name,
      folderWebUrl: folderData.webUrl,
      driveId,
      siteId,
    };
  }

  // 2. Se não existir (404), cria na raiz
  if (checkRes.status === 404) {
    const createUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root/children`;
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: SHAREPOINT_PROTOCOLOS_FOLDER,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });

    if (createRes.ok) {
      const createdFolder: DriveItemResponse = await createRes.json();
      cachedProtocolosFolderId = createdFolder.id;
      return {
        folderId: createdFolder.id,
        folderName: createdFolder.name,
        folderWebUrl: createdFolder.webUrl,
        driveId,
        siteId,
      };
    }

    if (createRes.status === 409) {
      const retryRes = await fetch(checkUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (retryRes.ok) {
        const folderData: DriveItemResponse = await retryRes.json();
        cachedProtocolosFolderId = folderData.id;
        return {
          folderId: folderData.id,
          folderName: folderData.name,
          folderWebUrl: folderData.webUrl,
          driveId,
          siteId,
        };
      }
    }
  }

  throw new Error(`Não foi possível acessar ou criar a pasta ${SHAREPOINT_PROTOCOLOS_FOLDER} no SharePoint.`);
}

/**
 * Realiza o upload da foto/comprovante do protocolo de entrega diretamente para a pasta
 * 'PROTOCOLOS ENTREGAS' no SharePoint corporativo.
 */
export async function uploadDeliveryProtocolToSharePoint(
  file: File,
  osTitulo: string,
  recebedor?: string,
  onProgress?: (percent: number) => void,
  interactiveFallback = true
): Promise<{ success: boolean; driveItem?: DriveItemResponse; folderInfo?: SharePointFolderInfo; error?: string }> {
  try {
    const folderInfo = await getOrCreateProtocolosFolder(interactiveFallback);

    const cleanOs = osTitulo.replace(/^OS[\s._-]*/i, "").trim() || "SEM_OS";
    const timestamp = Date.now();
    const cleanRecebedor = recebedor ? `_${recebedor.replace(/[^a-zA-Z0-9]/g, "_")}` : "";
    const rawExt = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    const ext = rawExt && rawExt.length <= 5 ? rawExt : ".jpg";
    const targetFileName = `OS_${cleanOs}_Protocolo_${timestamp}${cleanRecebedor}${ext}`;

    const protocolFile = new File([file], targetFileName, { type: file.type || "image/jpeg" });
    const driveItem = await uploadFileToSharePoint(protocolFile, folderInfo, onProgress, undefined, interactiveFallback);

    return { success: true, driveItem, folderInfo };
  } catch (err: any) {
    console.warn("[SharePoint] Falha no upload de protocolo para o SharePoint:", err?.message);
    return { success: false, error: err.message || "Falha no envio para o SharePoint." };
  }
}

/**
 * Sincroniza fotos de comprovantes de entrega armazenadas temporariamente
 * para a pasta corporativa 'PROTOCOLOS ENTREGAS' no SharePoint.
 * Remove os arquivos temporários do Supabase Storage após o upload bem-sucedido.
 */
export async function syncPendingProtocolsToSharePoint(
  interactiveFallback = false
): Promise<{
  total: number;
  synced: number;
  failed: number;
  errors: string[];
}> {
  const result = { total: 0, synced: 0, failed: 0, errors: [] as string[] };

  try {
    // 1. Busca ordens com comprovante pendente de envio para o SharePoint
    const { data: pendingOrders, error: ordersErr } = await supabase
      .from("orders")
      .select("id, titulo, entregue_para, status_comprovante_sync")
      .in("status_comprovante_sync", ["pendente_sharepoint", "pendente"])
      .limit(50);

    if (ordersErr || !pendingOrders || pendingOrders.length === 0) {
      return result;
    }

    result.total = pendingOrders.length;

    // 2. Garante acesso à pasta PROTOCOLOS ENTREGAS no SharePoint
    const folderInfo = await getOrCreateProtocolosFolder(interactiveFallback);

    for (const order of pendingOrders) {
      try {
        // Lista arquivos temporários no bucket 'comprovantes-entrega' para esta ordem
        const { data: files, error: listErr } = await supabase.storage
          .from("comprovantes-entrega")
          .list(order.id, { limit: 10, sortBy: { column: "created_at", order: "desc" } });

        if (listErr || !files || files.length === 0) {
          // Se não há arquivos temporários no bucket, verifica se já existe registro em order_attachments
          const { count } = await supabase
            .from("order_attachments" as any)
            .select("id", { count: "exact", head: true })
            .eq("order_id", order.id);

          if (count && count > 0) {
            await supabase
              .from("orders")
              .update({ status_comprovante_sync: "sincronizado" } as any)
              .eq("id", order.id);
            result.synced++;
          }
          continue;
        }

        // Filtra arquivos válidos (ignora placeholders)
        const validFiles = files.filter((f) => f.name && !f.name.startsWith("."));

        if (validFiles.length === 0) {
          continue;
        }

        for (const item of validFiles) {
          const filePath = `${order.id}/${item.name}`;
          const { data: blob, error: downloadErr } = await supabase.storage
            .from("comprovantes-entrega")
            .download(filePath);

          if (downloadErr || !blob) {
            console.warn(`[SharePoint Sync] Falha ao baixar arquivo temporário ${filePath}:`, downloadErr);
            continue;
          }

          const cleanOs = (order.titulo || order.id).replace(/^OS[\s._-]*/i, "").trim() || "SEM_OS";
          const rawExt = item.name.substring(item.name.lastIndexOf(".")).toLowerCase();
          const ext = rawExt && rawExt.length <= 5 ? rawExt : ".jpg";
          const cleanRecebedor = order.entregue_para
            ? `_${order.entregue_para.replace(/[^a-zA-Z0-9]/g, "_")}`
            : "";
          const targetFileName = `OS_${cleanOs}_Protocolo_${Date.now()}${cleanRecebedor}${ext}`;

          const fileToUpload = new File([blob], targetFileName, { type: blob.type || "image/jpeg" });

          // Upload do arquivo para a pasta PROTOCOLOS ENTREGAS no SharePoint
          const driveItem = await uploadFileToSharePoint(
            fileToUpload,
            folderInfo,
            undefined,
            undefined,
            interactiveFallback
          );

          if (driveItem) {
            // Registra os metadados do arquivo em order_attachments
            await supabase.from("order_attachments" as any).insert({
              order_id: order.id,
              nome_arquivo: driveItem.name || targetFileName,
              tamanho_bytes: driveItem.size || blob.size,
              content_type: blob.type || "image/jpeg",
              sharepoint_item_id: driveItem.id,
              sharepoint_folder_id: folderInfo.folderId,
              sharepoint_folder_name: folderInfo.folderName,
              sharepoint_drive_id: folderInfo.driveId,
              sharepoint_site_id: folderInfo.siteId,
              sharepoint_web_url: driveItem.webUrl,
              sharepoint_path: `${SHAREPOINT_PROTOCOLOS_FOLDER}/${driveItem.name}`,
              status: "sincronizado",
            });

            // Remove o arquivo temporário do bucket para manter o storage limpo
            await supabase.storage.from("comprovantes-entrega").remove([filePath]);
          }
        }

        // Atualiza a ordem como sincronizada
        await supabase
          .from("orders")
          .update({ status_comprovante_sync: "sincronizado" } as any)
          .eq("id", order.id);

        result.synced++;
      } catch (orderErr: any) {
        console.warn(`[SharePoint Sync] Erro ao sincronizar O.S. ${order.id}:`, orderErr);
        result.failed++;
        result.errors.push(`O.S. ${order.titulo || order.id}: ${orderErr?.message || orderErr}`);
      }
    }
  } catch (err: any) {
    console.warn("[SharePoint Sync] Erro geral na rotina de sincronização:", err);
    result.errors.push(err?.message || "Falha geral de sincronização.");
  }

  return result;
}

/**
 * Localiza ou cria a pasta da O.S. (ex.: KABAN/OS-1045) sem duplicidades.
 */
export async function getOrCreateOsFolder(
  osIdentifier: string,
  osNumberDisplay?: string
): Promise<SharePointFolderInfo> {
  const { siteId, driveId } = await resolveSharePointSiteAndDrive();
  const kabanFolderId = await ensureKabanRootFolder();
  const token = await getSharePointAccessToken();

  const folderName = formatOsFolderName(osIdentifier, osNumberDisplay);

  // 1. Verifica se a pasta da O.S. já existe dentro de KABAN
  const checkUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${kabanFolderId}:/${encodeURIComponent(
    folderName
  )}`;
  const checkRes = await fetch(checkUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (checkRes.ok) {
    const folderData: DriveItemResponse = await checkRes.json();
    return {
      folderId: folderData.id,
      folderName: folderData.name,
      folderWebUrl: folderData.webUrl,
      driveId,
      siteId,
    };
  }

  // 2. Se não existir, cria a pasta da O.S. dentro de KABAN
  const createUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${kabanFolderId}/children`;
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });

  if (createRes.ok) {
    const createdFolder: DriveItemResponse = await createRes.json();
    return {
      folderId: createdFolder.id,
      folderName: createdFolder.name,
      folderWebUrl: createdFolder.webUrl,
      driveId,
      siteId,
    };
  }

  // Se retornou 409 (pasta já existia por concorrência simultânea), busca a pasta existente
  if (createRes.status === 409) {
    const retryRes = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (retryRes.ok) {
      const folderData: DriveItemResponse = await retryRes.json();
      return {
        folderId: folderData.id,
        folderName: folderData.name,
        folderWebUrl: folderData.webUrl,
        driveId,
        siteId,
      };
    }
  }

  const errData = await createRes.json().catch(() => ({}));
  throw new Error(`Falha ao criar pasta ${folderName} no SharePoint: ${errData?.error?.message || createRes.statusText}`);
}

/**
 * Envia um arquivo diretamente do navegador para a pasta correspondente no SharePoint.
 * Arquivos < 4 MB: Upload direto via PUT no Microsoft Graph.
 * Arquivos >= 4 MB: Upload session em fatias (chunks de 5 MB) com progresso em tempo real.
 */
export async function uploadFileToSharePoint(
  file: File,
  folderInfo: SharePointFolderInfo,
  onProgress?: (percent: number) => void,
  abortSignal?: AbortSignal,
  interactiveFallback = true
): Promise<DriveItemResponse> {
  const token = await getSharePointAccessToken(interactiveFallback);
  const { siteId, driveId, folderId } = folderInfo;
  const fileName = file.name;

  // Sanitiza nome do arquivo para o SharePoint (remove : * ? " < > | # %)
  const safeFileName = fileName.replace(/[:*?"<>|#%]/g, "_");

  // CASO 1: Arquivos menores que 4 MB (Upload direto)
  if (file.size < DIRECT_UPLOAD_LIMIT_BYTES) {
    return uploadSmallFile(file, siteId, driveId, folderId, safeFileName, token, onProgress, abortSignal);
  }

  // CASO 2: Arquivos grandes (>= 4 MB) via Upload Session em Chunks
  return uploadLargeFileInChunks(file, siteId, driveId, folderId, safeFileName, token, onProgress, abortSignal);
}

/**
 * Upload direto de arquivo pequeno (< 4 MB) com XHR para acompanhamento de progresso
 */
function uploadSmallFile(
  file: File,
  siteId: string,
  driveId: string,
  folderId: string,
  fileName: string,
  token: string,
  onProgress?: (percent: number) => void,
  abortSignal?: AbortSignal
): Promise<DriveItemResponse> {
  return new Promise((resolve, reject) => {
    const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${folderId}:/${encodeURIComponent(
      fileName
    )}:/content`;

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        xhr.abort();
        reject(new Error("Upload cancelado pelo usuário."));
      });
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data: DriveItemResponse = JSON.parse(xhr.responseText);
          if (onProgress) onProgress(100);
          resolve(data);
        } catch {
          reject(new Error("Erro ao interpretar resposta do SharePoint."));
        }
      } else {
        let errMsg = `Falha no upload (${xhr.status}): ${xhr.statusText}`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed?.error?.message) errMsg = parsed.error.message;
        } catch {}
        reject(new Error(errMsg));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Erro de rede ao enviar arquivo ao SharePoint. Verifique sua conexão."));
    };

    xhr.send(file);
  });
}

/**
 * Upload de arquivos grandes via Microsoft Graph createUploadSession
 */
async function uploadLargeFileInChunks(
  file: File,
  siteId: string,
  driveId: string,
  folderId: string,
  fileName: string,
  token: string,
  onProgress?: (percent: number) => void,
  abortSignal?: AbortSignal
): Promise<DriveItemResponse> {
  // 1. Criar Upload Session no Microsoft Graph
  const sessionUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${folderId}:/${encodeURIComponent(
    fileName
  )}:/createUploadSession`;

  const sessionRes = await fetch(sessionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      item: {
        "@microsoft.graph.conflictBehavior": "rename",
        name: fileName,
      },
    }),
  });

  if (!sessionRes.ok) {
    const err = await sessionRes.json().catch(() => ({}));
    throw new Error(`Falha ao iniciar sessão de upload no SharePoint: ${err?.error?.message || sessionRes.statusText}`);
  }

  const sessionData = await sessionRes.json();
  const uploadUrl: string = sessionData.uploadUrl;
  const totalSize = file.size;

  let byteStart = 0;
  let finalDriveItem: DriveItemResponse | null = null;

  // 2. Loop de envio de cada chunk
  while (byteStart < totalSize) {
    if (abortSignal?.aborted) {
      // Cancela a sessão no SharePoint
      fetch(uploadUrl, { method: "DELETE" }).catch(() => {});
      throw new Error("Upload cancelado pelo usuário.");
    }

    const byteEnd = Math.min(byteStart + CHUNK_SIZE_BYTES, totalSize);
    const chunkBlob = file.slice(byteStart, byteEnd);
    const chunkSize = byteEnd - byteStart;

    // Retry com até 3 tentativas por chunk em caso de oscilação de rede
    let attempts = 0;
    let chunkSuccess = false;

    while (attempts < 3 && !chunkSuccess) {
      attempts++;
      try {
        const chunkRes = await uploadSingleChunk(
          uploadUrl,
          chunkBlob,
          byteStart,
          byteEnd - 1,
          totalSize,
          (chunkLoaded) => {
            if (onProgress) {
              const currentOverallBytes = byteStart + chunkLoaded;
              const percent = Math.min(99, Math.round((currentOverallBytes / totalSize) * 100));
              onProgress(percent);
            }
          },
          abortSignal
        );

        if (chunkRes.status === 200 || chunkRes.status === 201) {
          // Último chunk completado com sucesso!
          finalDriveItem = chunkRes.data;
          chunkSuccess = true;
        } else if (chunkRes.status === 202) {
          // Chunk intermediário recebido com sucesso pelo SharePoint
          chunkSuccess = true;
        } else {
          throw new Error(`SharePoint retornou status inesperado ${chunkRes.status}`);
        }
      } catch (chunkErr) {
        if (abortSignal?.aborted) throw chunkErr;
        if (attempts >= 3) {
          throw new Error(`Falha ao transmitir bloco do arquivo (${byteStart}-${byteEnd}) após 3 tentativas: ${chunkErr}`);
        }
        // Espera 1s antes da nova tentativa
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    byteStart = byteEnd;
  }

  if (onProgress) onProgress(100);
  if (!finalDriveItem) {
    throw new Error("O upload foi concluído, mas o SharePoint não retornou os metadados do arquivo.");
  }

  return finalDriveItem;
}

/**
 * Envia um chunk individual via XMLHttpRequest para medição precisa de bytes transmitidos
 */
function uploadSingleChunk(
  uploadUrl: string,
  chunk: Blob,
  rangeStart: number,
  rangeEnd: number,
  totalSize: number,
  onChunkProgress?: (bytesLoaded: number) => void,
  abortSignal?: AbortSignal
): Promise<{ status: number; data?: DriveItemResponse }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Length", chunk.size.toString());
    xhr.setRequestHeader("Content-Range", `bytes ${rangeStart}-${rangeEnd}/${totalSize}`);

    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        xhr.abort();
        reject(new Error("Upload cancelado"));
      });
    }

    if (xhr.upload && onChunkProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onChunkProgress(e.loaded);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ status: xhr.status, data });
        } catch {
          resolve({ status: xhr.status });
        }
      } else if (xhr.status === 202) {
        resolve({ status: xhr.status });
      } else {
        reject(new Error(`Erro ao enviar bloco do arquivo (${xhr.status}): ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Erro de conexão durante o envio do bloco ao SharePoint."));
    };

    xhr.send(chunk);
  });
}

/**
 * Exclui um arquivo definitivamente do SharePoint pelo ID do item
 */
export async function deleteFileFromSharePoint(itemId: string): Promise<void> {
  const token = await getSharePointAccessToken();
  const { siteId, driveId } = await resolveSharePointSiteAndDrive();

  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${itemId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  // 204 No Content indica sucesso. 404 também consideramos resolvido pois o arquivo já não existe.
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Falha ao excluir arquivo do SharePoint: ${err?.error?.message || res.statusText}`);
  }
}

/**
 * Baixa um arquivo do SharePoint diretamente pelo Microsoft Graph
 */
export async function downloadFileFromSharePoint(
  itemId: string,
  fileName: string,
  driveId?: string
): Promise<void> {
  const token = await getSharePointAccessToken();
  const resolved = await resolveSharePointSiteAndDrive();
  const effectiveDriveId = driveId || resolved.driveId;

  // 1. Tenta obter a URL de download direto (CDN pré-autenticada da Microsoft)
  const metaUrl = `https://graph.microsoft.com/v1.0/sites/${resolved.siteId}/drives/${effectiveDriveId}/items/${itemId}?select=id,name,@microsoft.graph.downloadUrl`;
  try {
    const metaRes = await fetch(metaUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (metaRes.ok) {
      const data = await metaRes.json();
      const downloadUrl = data["@microsoft.graph.downloadUrl"];
      if (downloadUrl) {
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = fileName;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
    }
  } catch (metaErr) {
    console.warn("[SharePoint] Falha ao obter @microsoft.graph.downloadUrl, tentando stream binário:", metaErr);
  }

  // 2. Fallback: Baixa os bytes via Graph API e cria um Object URL local
  const contentUrl = `https://graph.microsoft.com/v1.0/sites/${resolved.siteId}/drives/${effectiveDriveId}/items/${itemId}/content`;
  const contentRes = await fetch(contentUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!contentRes.ok) {
    throw new Error(`Falha ao baixar arquivo do SharePoint (${contentRes.status})`);
  }

  const blob = await contentRes.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
}

