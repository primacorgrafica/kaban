import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  getOrCreateOsFolder,
  uploadFileToSharePoint,
  deleteFileFromSharePoint,
  listFilesInOsFolder,
  SHAREPOINT_ROOT_FOLDER,
} from "@/lib/sharepointService";
import { uploadWithResilience } from "@/lib/autonomousEngine/uploadQueue";
import type {
  OrderAttachment,
  PendingUploadItem,
  SharePointFolderInfo,
} from "@/types/sharepoint";
import { toast } from "sonner";

export function useOrderAttachments(orderId: string | null, orderTitulo?: string) {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<Record<string, PendingUploadItem>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [folderInfo, setFolderInfo] = useState<SharePointFolderInfo | null>(null);

  const isMountedRef = useRef(true);

  /**
   * Sincroniza ativamente os arquivos existentes na pasta do SharePoint com o Supabase.
   * Auto-reconcilia arquivos colocados diretamente no SharePoint ou que falharam na gravação de metadados.
   */
  const syncWithSharePoint = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!orderId) return;
      setIsSyncing(true);
      try {
        const result = await listFilesInOsFolder(orderId, orderTitulo);
        if (!result || !result.files || result.files.length === 0) {
          if (!options?.silent) {
            toast.info("Nenhum arquivo encontrado na pasta do SharePoint desta O.S.");
          }
          return;
        }

        const { folder, files } = result;

        if (isMountedRef.current) {
          setFolderInfo(folder);
        }

        // Atualiza a O.S. com a URL e dados da pasta do SharePoint
        try {
          await (supabase.from("orders") as any)
            .update({
              sharepoint_folder_id: folder.folderId,
              sharepoint_folder_url: folder.folderWebUrl,
              sharepoint_folder_name: folder.folderName,
            })
            .eq("id", orderId);
        } catch (_) {}

        // Busca anexos que já estão gravados no Supabase para esta O.S. ou pasta
        const { data: existingRows } = await (supabase
          .from("order_attachments" as any)
          .select("id, order_id, sharepoint_item_id, nome_arquivo")
          .or(`order_id.eq.${orderId},sharepoint_folder_name.eq.${folder.folderName}`) as any);

        const existingItemIds = new Set((existingRows || []).map((r: any) => r.sharepoint_item_id).filter(Boolean));
        const existingNames = new Set((existingRows || []).map((r: any) => (r.nome_arquivo || "").trim().toLowerCase()));

        let newlySynced = 0;
        for (const fileItem of files) {
          const fileNameLower = (fileItem.name || "").trim().toLowerCase();
          if (existingItemIds.has(fileItem.id) || existingNames.has(fileNameLower)) {
            // Reconcilia order_id caso estivesse desvinculado
            const matchedRow = (existingRows || []).find(
              (r: any) => r.sharepoint_item_id === fileItem.id || (r.nome_arquivo || "").trim().toLowerCase() === fileNameLower
            );
            if (matchedRow && matchedRow.order_id !== orderId) {
              await (supabase.from("order_attachments" as any) as any)
                .update({ order_id: orderId })
                .eq("id", matchedRow.id);
            }
            continue;
          }

          const attachmentPayload = {
            order_id: orderId,
            nome_arquivo: fileItem.name,
            tamanho_bytes: fileItem.size || 0,
            content_type: fileItem.file?.mimeType || "application/octet-stream",
            sharepoint_item_id: fileItem.id,
            sharepoint_folder_id: folder.folderId,
            sharepoint_folder_name: folder.folderName,
            sharepoint_drive_id: folder.driveId,
            sharepoint_site_id: folder.siteId,
            sharepoint_web_url: fileItem.webUrl,
            sharepoint_path: `${SHAREPOINT_ROOT_FOLDER}/${folder.folderName}/${fileItem.name}`,
            status: "concluido",
            criado_por: user?.id || null,
          };

          const { error: insErr } = await (supabase
            .from("order_attachments" as any)
            .insert(attachmentPayload) as any);

          if (!insErr) {
            newlySynced++;
          } else {
            console.warn(`[useOrderAttachments] Falha ao registrar arquivo ${fileItem.name} no banco:`, insErr);
          }
        }

        // Recarrega lista consolidada do banco
        const { data: refreshedData } = await (supabase
          .from("order_attachments" as any)
          .select("*")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false }) as any);

        if (isMountedRef.current && refreshedData) {
          setAttachments(refreshedData as OrderAttachment[]);
        }

        if (newlySynced > 0) {
          toast.success(`${newlySynced} anexo(s) do SharePoint sincronizado(s) com este card!`);
        } else if (!options?.silent) {
          toast.info("Todos os arquivos da pasta do SharePoint já estão vinculados a este card.");
        }
      } catch (err: any) {
        console.warn("[useOrderAttachments] Erro durante sincronização com SharePoint:", err);
        if (!options?.silent) {
          toast.error(`Falha ao sincronizar com SharePoint: ${err?.message || err}`);
        }
      } finally {
        if (isMountedRef.current) setIsSyncing(false);
      }
    },
    [orderId, orderTitulo, user?.id]
  );

  // Busca anexos salvos no banco de dados
  const fetchAttachments = useCallback(async () => {
    if (!orderId) {
      setAttachments([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from("order_attachments" as any)
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }) as any);

      let foundAttachments: OrderAttachment[] = [];
      if (error) {
        console.warn("Erro ao buscar anexos:", error);
      } else if (data && data.length > 0) {
        foundAttachments = data as OrderAttachment[];
      }

      // Se não encontrou por order_id mas temos o título da OS (ex: "73515"), tenta localizar por pasta
      if (foundAttachments.length === 0 && orderTitulo) {
        const cleanOs = orderTitulo.replace(/^OS[\s._-]*/i, "").trim();
        const expectedFolderName = `OS-${cleanOs}`;
        const { data: byFolder } = await (supabase
          .from("order_attachments" as any)
          .select("*")
          .eq("sharepoint_folder_name", expectedFolderName)
          .order("created_at", { ascending: false }) as any);

        if (byFolder && byFolder.length > 0) {
          foundAttachments = byFolder as OrderAttachment[];
          // Auto-reconcilia o order_id correto se estava desvinculado
          void (supabase.from("order_attachments" as any) as any)
            .update({ order_id: orderId })
            .eq("sharepoint_folder_name", expectedFolderName);
        }
      }

      if (isMountedRef.current) {
        setAttachments(foundAttachments);
      }

      // Auto-reconciliação silenciosa com SharePoint se não há anexos no banco
      if (foundAttachments.length === 0 && orderId) {
        void syncWithSharePoint({ silent: true });
      }
    } catch (err) {
      console.warn("Falha de rede ao consultar anexos:", err);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [orderId, orderTitulo, syncWithSharePoint]);

  // Carregamento inicial e subscrição Realtime
  useEffect(() => {
    isMountedRef.current = true;
    void fetchAttachments();

    if (!orderId) return;

    let channel: any = null;
    try {
      const uniqueChannelName = `order_attachments_${orderId}_${Math.random().toString(36).substring(2, 9)}`;
      channel = supabase
        .channel(uniqueChannelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "order_attachments",
            filter: `order_id=eq.${orderId}`,
          },
          () => {
            void fetchAttachments();
          }
        )
        .subscribe();
    } catch (subErr) {
      console.warn("[useOrderAttachments] Falha ao registrar realtime:", subErr);
    }

    return () => {
      isMountedRef.current = false;
      if (channel) {
        try {
          void supabase.removeChannel(channel);
        } catch (_) {}
      }
    };
  }, [orderId, fetchAttachments]);

  /**
   * Envia múltiplos arquivos para o SharePoint vinculados a esta O.S.
   */
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!orderId) {
        toast.error("O.S. não identificada para upload.");
        return;
      }
      if (files.length === 0) return;

      setIsUploading(true);

      // Prepara itens de fila inicial
      const initialQueue: Record<string, PendingUploadItem> = {};
      const fileList: { id: string; file: File }[] = [];

      files.forEach((file) => {
        const itemId = `${file.name}_${file.size}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        fileList.push({ id: itemId, file });
        initialQueue[itemId] = {
          id: itemId,
          file,
          progress: 0,
          status: "queued",
          abortController: new AbortController(),
        };
      });

      setUploadQueue((prev) => ({ ...prev, ...initialQueue }));

      let activeFolder = folderInfo;

      // 1. Localiza ou cria a pasta da O.S. no SharePoint
      try {
        if (!activeFolder) {
          activeFolder = await getOrCreateOsFolder(orderId, orderTitulo);
          if (isMountedRef.current) setFolderInfo(activeFolder);

          // Salva metadados da pasta no registro da O.S. para acesso instantâneo futuro
          await (supabase.from("orders") as any)
            .update({
              sharepoint_folder_id: activeFolder.folderId,
              sharepoint_folder_url: activeFolder.folderWebUrl,
              sharepoint_folder_name: activeFolder.folderName,
            })
            .eq("id", orderId);
        }
      } catch (folderErr: any) {
        console.error("Erro ao preparar pasta da O.S. no SharePoint:", folderErr);
        toast.error(folderErr.message || "Não foi possível preparar a pasta no SharePoint.");

        // Marca todos como erro
        setUploadQueue((prev) => {
          const next = { ...prev };
          fileList.forEach(({ id }) => {
            if (next[id]) {
              next[id] = { ...next[id], status: "error", error: folderErr.message };
            }
          });
          return next;
        });
        setIsUploading(false);
        return;
      }

      // 2. Upload de cada arquivo sequencialmente para controle de banda
      for (const { id: itemId, file } of fileList) {
        const itemState = uploadQueue[itemId] || initialQueue[itemId];
        if (itemState.abortController?.signal.aborted) continue;

        setUploadQueue((prev) => ({
          ...prev,
          [itemId]: { ...prev[itemId], status: "uploading", progress: 1 },
        }));

        try {
          // Upload resiliente ao SharePoint com auto-recuperação e progresso em tempo real
          const driveItem = await uploadWithResilience(
            file,
            activeFolder,
            {
              onProgress: (percent) => {
                if (isMountedRef.current) {
                  setUploadQueue((prev) => {
                    if (!prev[itemId]) return prev;
                    return {
                      ...prev,
                      [itemId]: { ...prev[itemId], progress: percent },
                    };
                  });
                }
              },
              abortSignal: itemState.abortController?.signal,
              onStatusChange: (status) => {
                if (status === "RETRYING" && isMountedRef.current) {
                  setUploadQueue((prev) => ({
                    ...prev,
                    [itemId]: { ...prev[itemId], error: "Instabilidade transitória. Retentando..." },
                  }));
                }
              },
            }
          );

          // 3. Salva os metadados do anexo no Supabase
          setUploadQueue((prev) => ({
            ...prev,
            [itemId]: { ...prev[itemId], status: "saving_metadata", progress: 99 },
          }));

          const attachmentPayload = {
            order_id: orderId,
            nome_arquivo: driveItem.name || file.name,
            tamanho_bytes: driveItem.size || file.size,
            content_type: driveItem.file?.mimeType || file.type || "application/octet-stream",
            sharepoint_item_id: driveItem.id,
            sharepoint_folder_id: activeFolder.folderId,
            sharepoint_folder_name: activeFolder.folderName,
            sharepoint_drive_id: activeFolder.driveId,
            sharepoint_site_id: activeFolder.siteId,
            sharepoint_web_url: driveItem.webUrl,
            sharepoint_path: `${SHAREPOINT_ROOT_FOLDER}/${activeFolder.folderName}/${driveItem.name}`,
            status: "concluido",
            criado_por: user?.id || null,
          };

          const { data: inserted, error: dbError } = await (supabase
            .from("order_attachments" as any)
            .insert(attachmentPayload)
            .select()
            .single() as any);

          if (dbError) {
            console.error("Erro ao registrar metadados no Supabase:", dbError);
            toast.warning(`Arquivo "${file.name}" gravado no SharePoint, mas houve falha ao registrar no banco.`);
            setUploadQueue((prev) => ({
              ...prev,
              [itemId]: {
                ...prev[itemId],
                status: "error",
                error: "Arquivo gravado no SharePoint, falha no banco de dados.",
              },
            }));
          } else {
            setUploadQueue((prev) => ({
              ...prev,
              [itemId]: {
                ...prev[itemId],
                status: "success",
                progress: 100,
                uploadedAttachment: inserted,
              },
            }));
            // Atualiza lista local
            setAttachments((prev) => [inserted, ...prev.filter((a) => a.id !== inserted.id)]);
          }
        } catch (uploadErr: any) {
          console.error(`Erro no envio de "${file.name}":`, uploadErr);
          const isCancelled = uploadErr?.message?.includes("cancelado");
          setUploadQueue((prev) => ({
            ...prev,
            [itemId]: {
              ...prev[itemId],
              status: isCancelled ? "cancelled" : "error",
              error: uploadErr?.message || "Falha no envio para o SharePoint",
            },
          }));
          if (!isCancelled) {
            toast.error(`Falha no envio de "${file.name}": ${uploadErr.message}`);
          }
        }
      }

      setIsUploading(false);
      void fetchAttachments();
    },
    [orderId, orderTitulo, folderInfo, uploadQueue, user?.id, fetchAttachments]
  );

  /**
   * Cancela o envio de um arquivo na fila
   */
  const cancelUpload = useCallback((itemId: string) => {
    setUploadQueue((prev) => {
      const item = prev[itemId];
      if (item?.abortController) {
        item.abortController.abort();
      }
      return {
        ...prev,
        [itemId]: { ...item, status: "cancelled", error: "Envio cancelado." },
      };
    });
  }, []);

  /**
   * Remove item concluído ou cancelado da fila visual
   */
  const dismissQueueItem = useCallback((itemId: string) => {
    setUploadQueue((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  /**
   * Exclui um anexo (do banco e opcionalmente do SharePoint)
   */
  const deleteAttachment = useCallback(
    async (attachment: OrderAttachment, deleteFromSharePoint = true) => {
      try {
        // 1. Exclui do SharePoint se solicitado
        if (deleteFromSharePoint && attachment.sharepoint_item_id) {
          try {
            await deleteFileFromSharePoint(attachment.sharepoint_item_id);
          } catch (spErr: any) {
            console.warn("Aviso ao remover do SharePoint:", spErr);
            // Prossegue para remoção do banco caso o arquivo já tenha sido apagado lá
          }
        }

        // 2. Remove do Supabase
        const { error } = await (supabase
          .from("order_attachments" as any)
          .delete()
          .eq("id", attachment.id) as any);

        if (error) {
          toast.error("Erro ao remover registro do banco de dados.");
          throw error;
        }

        setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
        toast.success(`Anexo "${attachment.nome_arquivo}" removido com sucesso.`);
      } catch (err: any) {
        console.error("Erro ao excluir anexo:", err);
      }
    },
    []
  );

  return {
    attachments,
    loading,
    isSyncing,
    uploadQueue,
    isUploading,
    folderInfo,
    uploadFiles,
    cancelUpload,
    dismissQueueItem,
    deleteAttachment,
    refresh: fetchAttachments,
    syncWithSharePoint,
  };
}
