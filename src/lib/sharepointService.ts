import { getSharePointAccessToken } from "./msalClient";
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

// Limite para upload direto simples (4 MB). Acima disso, usa Upload Session em chunks.
const DIRECT_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

// Tamanho do chunk para upload session: 5 MB (múltiplo exato de 320 KiB = 16 * 327.680 bytes)
const CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

// Cache em memória de Site ID e Drive ID para evitar chamadas de descoberta repetidas
let cachedSiteId: string | null = null;
let cachedDriveId: string | null = null;
let cachedKabanFolderId: string | null = null;

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
export async function resolveSharePointSiteAndDrive(): Promise<{ siteId: string; driveId: string }> {
  if (cachedSiteId && cachedDriveId) {
    return { siteId: cachedSiteId, driveId: cachedDriveId };
  }

  const token = await getSharePointAccessToken();

  // 1. Obter Site ID
  const siteUrl = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_HOSTNAME}:${SHAREPOINT_SITE_PATH}`;
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
        `Permissão negada no SharePoint (${siteRes.status}). O aplicativo "Kaban - Integração SharePoint" requer que um administrador do Microsoft 365 conceda acesso de escrita no site "Produo_grupo" via permissão Sites.Selected.`
      );
    }
    throw new Error(
      `Falha ao localizar site do SharePoint (${siteRes.status}): ${errorBody?.error?.message || siteRes.statusText}`
    );
  }

  const siteData = await siteRes.json();
  cachedSiteId = siteData.id;

  // 2. Obter Drive ID (Documentos Compartilhados)
  const drivesUrl = `https://graph.microsoft.com/v1.0/sites/${cachedSiteId}/drives`;
  const drivesRes = await fetch(drivesUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!drivesRes.ok) {
    throw new Error(`Falha ao listar bibliotecas do site (${drivesRes.status}).`);
  }

  const drivesData = await drivesRes.json();
  const drives: Array<{ id: string; name: string }> = drivesData.value || [];

  // Localiza "Documentos Compartilhados" ou "Documents" ou usa o default
  const targetDrive =
    drives.find(
      (d) =>
        d.name.toLowerCase() === "documentos compartilhados" ||
        d.name.toLowerCase() === "documentos" ||
        d.name.toLowerCase() === "documents"
    ) || drives[0];

  if (!targetDrive) {
    throw new Error("Nenhuma biblioteca de documentos encontrada no site do SharePoint.");
  }

  cachedDriveId = targetDrive.id;
  return { siteId: cachedSiteId!, driveId: cachedDriveId! };
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
  abortSignal?: AbortSignal
): Promise<DriveItemResponse> {
  const token = await getSharePointAccessToken();
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
