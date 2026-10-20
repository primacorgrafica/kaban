import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  getOrCreateOsFolder,
  uploadFileToSharePoint,
  deleteFileFromSharePoint,
  SHAREPOINT_ROOT_FOLDER,
} from "@/lib/sharepointService";
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
  const [uploadQueue, setUploadQueue] = useState<Record<string, PendingUploadItem>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [folderInfo, setFolderInfo] = useState<SharePointFolderInfo | null>(null);

  const isMountedRef = useRef(true);

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

      if (error) {
        console.warn("Erro ao buscar anexos:", error);
      } else if (isMountedRef.current && data) {
        setAttachments(data as OrderAttachment[]);
      }
    } catch (err) {
      console.warn("Falha de rede ao consultar anexos:", err);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [orderId]);

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
          // Upload direto ao SharePoint com progresso em tempo real
          const driveItem = await uploadFileToSharePoint(
            file,
            activeFolder,
            (percent) => {
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
            itemState.abortController?.signal
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
    uploadQueue,
    isUploading,
    folderInfo,
    uploadFiles,
    cancelUpload,
    dismissQueueItem,
    deleteAttachment,
    refresh: fetchAttachments,
  };
}
