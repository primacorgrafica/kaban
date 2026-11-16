import { useState, useEffect, useRef } from "react";
import { Order } from "@/types/order";
import {
  InspecaoChecklist,
  InspecaoChecklistItem,
  InspecaoItemKey,
  InspecaoItemStatus,
  InspecaoFoto,
  InspecaoHistoryEntry,
  INSPECAO_CHECKLIST_ITEMS,
  validateInspecaoConditions,
} from "@/types/inspecao";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Camera,
  UploadCloud,
  Trash2,
  ExternalLink,
  History,
  Check,
  RotateCcw,
  Clock,
  User,
  Image as ImageIcon,
  FileText,
  AlertOctagon,
  Cloud,
  LogIn,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cleanOsNumber } from "@/lib/orderRelationsService";
import {
  uploadInspecaoPhotoToSharePoint,
  uploadInspecaoPhotoTemporary,
  syncPendingInspecaoPhotosToSharePoint,
} from "@/lib/sharepointService";
import {
  getStoredMicrosoftUser,
  getActiveMicrosoftAccount,
  loginMicrosoft,
  loginMicrosoftRedirect,
  type StoredMicrosoftUser,
} from "@/lib/msalClient";

interface InspecaoWorkspaceDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, data: Partial<Order>) => void | Promise<any>;
  onMoveToStatus?: (id: string, newStatus: string) => void | Promise<any>;
  currentUserName?: string | null;
  readOnly?: boolean;
}

interface PendingUpload {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: "compressing" | "uploading" | "error" | "done";
  error?: string;
  abortController?: AbortController;
}

export function InspecaoWorkspaceDialog({
  order,
  open,
  onOpenChange,
  onUpdate,
  onMoveToStatus,
  currentUserName,
  readOnly = false,
}: InspecaoWorkspaceDialogProps) {
  const [checklist, setChecklist] = useState<InspecaoChecklist>({});
  const [fotos, setFotos] = useState<InspecaoFoto[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [history, setHistory] = useState<InspecaoHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msUser, setMsUser] = useState<StoredMicrosoftUser | null>(() => getStoredMicrosoftUser());
  const [isConnectingMs, setIsConnectingMs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sincroniza estado de autenticação da conta Microsoft / SharePoint
  useEffect(() => {
    void getActiveMicrosoftAccount().then((acc) => {
      if (acc) {
        setMsUser({ name: acc.name || acc.username, username: acc.username });
      }
    });

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "kaban_msal_user_info") {
        setMsUser(getStoredMicrosoftUser());
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const handleConnectMicrosoft = async () => {
    setIsConnectingMs(true);
    try {
      const acc = await loginMicrosoft();
      if (acc) {
        const u = { name: acc.name || acc.username, username: acc.username };
        setMsUser(u);
        toast.success(`Conectado ao Microsoft 365 como ${u.name}`);
        // Retenta uploads que falharam por popup/sessão
        const failedItems = pendingUploads.filter((p) => p.status === "error");
        for (const p of failedItems) {
          handleRetryUpload(p);
        }
      }
    } catch (err: any) {
      console.warn("Falha ao conectar Microsoft:", err);
      const rawMsg = err?.message || String(err);
      const isPopupBlocked =
        err?.errorCode === "popup_window_error" ||
        rawMsg.includes("popup_window_error") ||
        rawMsg.includes("popup window") ||
        rawMsg.includes("Pop-up");
      if (isPopupBlocked) {
        toast.error(
          "Pop-up bloqueado pelo navegador. Toque em 'Sempre mostrar' na notificação superior do Chrome ou use a opção 'Entrar sem pop-up'."
        );
      } else {
        toast.error(`Falha ao conectar Microsoft: ${rawMsg}`);
      }
    } finally {
      setIsConnectingMs(false);
    }
  };

  const handleConnectMicrosoftRedirect = async () => {
    try {
      await loginMicrosoftRedirect();
    } catch (err: any) {
      toast.error(`Falha ao redirecionar para Microsoft: ${err?.message || err}`);
    }
  };

  // Inicializa estado quando o order for alterado
  useEffect(() => {
    if (order) {
      setChecklist((order.inspecao_checklist as InspecaoChecklist) || {});
      setFotos((order.inspecao_fotos as InspecaoFoto[]) || []);
      setPendingUploads([]);
      void fetchHistory(order.id);
      if (open) {
        void syncPendingInspecaoPhotosToSharePoint(false).catch(() => {});
      }
    }
  }, [order?.id, open]);

  const fetchHistory = async (orderId: string) => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("order_inspecao_history" as any)
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setHistory(data as any as InspecaoHistoryEntry[]);
      }
    } catch (err) {
      console.warn("Histórico de inspeção não disponível:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const recordHistory = async (
    tipoEvento: InspecaoHistoryEntry["tipo_evento"],
    descricao: string,
    detalhes?: Record<string, any>
  ) => {
    if (!order) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const newEntry = {
        order_id: order.id,
        tipo_evento: tipoEvento,
        descricao,
        detalhes: detalhes || {},
        usuario_id: user?.id || null,
        usuario_nome: currentUserName || user?.email || "Operador",
      };
      await supabase.from("order_inspecao_history" as any).insert(newEntry);
      void fetchHistory(order.id);
    } catch (err) {
      console.warn("Falha ao registrar histórico de inspeção:", err);
    }
  };

  if (!order) return null;

  const cleanNum = cleanOsNumber(order.titulo) || order.titulo;
  const validation = validateInspecaoConditions(checklist, fotos);

  // Mudança de status em um item do checklist
  const handleItemStatusChange = (key: InspecaoItemKey, status: InspecaoItemStatus) => {
    if (readOnly) return;
    setChecklist((prev) => {
      const existing = prev[key] || { status };
      return {
        ...prev,
        [key]: {
          ...existing,
          status,
          avaliado_por: currentUserName || "Operador",
          avaliado_em: new Date().toISOString(),
        },
      };
    });
  };

  // Mudança de observação em um item do checklist
  const handleItemObsChange = (key: InspecaoItemKey, obs: string) => {
    if (readOnly) return;
    setChecklist((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      return {
        ...prev,
        [key]: {
          ...existing,
          observacao: obs,
        },
      };
    });
  };

  // Upload de fotos
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || readOnly) return;

    const selectedFiles = Array.from(e.target.files);
    const totalExisting = fotos.length;
    const totalPending = pendingUploads.filter((p) => p.status !== "error").length;
    const currentTotal = totalExisting + totalPending;

    if (currentTotal + selectedFiles.length > 5) {
      toast.error(
        `Limite de fotos excedido! Máximo de 5 fotos permitidas por O.S. (Você já possui ${totalExisting} foto(s)).`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const uploadId = `upload_${Date.now()}_${i}`;
      const objectUrl = URL.createObjectURL(file);
      const abortCtrl = new AbortController();

      const newPending: PendingUpload = {
        id: uploadId,
        file,
        previewUrl: objectUrl,
        progress: 10,
        status: "uploading",
        abortController: abortCtrl,
      };

      setPendingUploads((prev) => [...prev, newPending]);

      // Dispara o upload
      void processAndUploadPhoto(newPending, totalExisting + i + 1);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenAddPhotos = async () => {
    if (fotos.length >= 5) {
      toast.warning(
        "Limite máximo de 5 fotos atingido. Remova uma foto antes de adicionar outra."
      );
      return;
    }

    // Se a conta Microsoft ainda não estiver identificada, tenta restaurar silenciosamente
    if (!msUser) {
      const active = await getActiveMicrosoftAccount();
      if (active) {
        setMsUser({ name: active.name || active.username, username: active.username });
      }
    }

    fileInputRef.current?.click();
  };

  const processAndUploadPhoto = async (pending: PendingUpload, photoIndex: number) => {
    try {
      setPendingUploads((prev) =>
        prev.map((p) => (p.id === pending.id ? { ...p, progress: 30 } : p))
      );

      // 1. Tenta upload direto no SharePoint (apenas se houver sessão Microsoft silenciosa ativa)
      try {
        const result = await uploadInspecaoPhotoToSharePoint(
          pending.file,
          cleanNum,
          photoIndex,
          (progressPercent) => {
            setPendingUploads((prev) =>
              prev.map((p) => (p.id === pending.id ? { ...p, progress: progressPercent } : p))
            );
          },
          pending.abortController?.signal,
          false // NÃO abre pop-up! Silencioso
        );

        if (result?.driveItem) {
          const newFoto: InspecaoFoto = {
            id: result.driveItem.id,
            nome_arquivo: result.driveItem.name,
            web_url: result.driveItem.webUrl,
            sharepoint_item_id: result.driveItem.id,
            sharepoint_folder_id: result.folderInfo.folderId,
            tamanho_bytes: result.driveItem.size,
            created_at: new Date().toISOString(),
            criado_por: currentUserName || "Operador",
            thumbnail_url: pending.previewUrl,
            status: "sincronizado",
          };

          const updatedFotos = [...fotos, newFoto];
          setFotos(updatedFotos);
          setPendingUploads((prev) => prev.filter((p) => p.id !== pending.id));
          await onUpdate(order.id, { inspecao_fotos: updatedFotos });
          await recordHistory(
            "foto_anexada",
            `Foto "${newFoto.nome_arquivo}" anexada com sucesso à inspeção no SharePoint`,
            { foto_id: newFoto.id, sharepoint_url: newFoto.web_url }
          );

          toast.success(`Foto ${newFoto.nome_arquivo} enviada ao SharePoint!`);
          return;
        }
      } catch (directErr) {
        console.info("[Inspecao] Upload direto sem sessão MS. Utilizando sincronização transparente de retaguarda:", directErr);
      }

      // 2. Modo transparente de retaguarda (igual a Entregas, sem exigir login no celular)
      const tempRes = await uploadInspecaoPhotoTemporary(
        order.id,
        pending.file,
        cleanNum,
        photoIndex
      );

      if (!tempRes.success || !tempRes.fileName) {
        throw new Error(tempRes.error || "Falha ao preparar foto da inspeção.");
      }

      const tempFoto: InspecaoFoto = {
        id: `temp_${Date.now()}_${photoIndex}`,
        nome_arquivo: tempRes.fileName,
        web_url: "",
        sharepoint_item_id: "",
        tamanho_bytes: tempRes.finalFile?.size || pending.file.size,
        created_at: new Date().toISOString(),
        criado_por: currentUserName || "Operador",
        thumbnail_url: pending.previewUrl,
        status: "pendente_sharepoint",
        storage_path: tempRes.filePath,
      };

      const updatedFotos = [...fotos, tempFoto];
      setFotos(updatedFotos);
      setPendingUploads((prev) => prev.filter((p) => p.id !== pending.id));
      await onUpdate(order.id, { inspecao_fotos: updatedFotos });
      await recordHistory(
        "foto_anexada",
        `Foto "${tempFoto.nome_arquivo}" anexada à inspeção (sincronizando com SharePoint)`,
        { foto_id: tempFoto.id, arquivo: tempFoto.nome_arquivo }
      );

      toast.success("Foto salva! Sincronizando com SharePoint em segundo plano.");

      // Dispara sincronização silenciosa se alguma estação estiver disponível
      void syncPendingInspecaoPhotosToSharePoint(false).catch(() => {});
    } catch (err: any) {
      console.error("Falha no upload da foto de inspeção:", err);
      const rawMsg = err?.message || "Falha no salvamento da foto.";
      setPendingUploads((prev) =>
        prev.map((p) =>
          p.id === pending.id ? { ...p, status: "error", error: rawMsg } : p
        )
      );
      toast.error(`Erro ao salvar foto: ${rawMsg}`);
    }
  };

  const handleRetryUpload = (pending: PendingUpload) => {
    setPendingUploads((prev) =>
      prev.map((p) => (p.id === pending.id ? { ...p, status: "uploading", error: undefined, progress: 10 } : p))
    );
    void processAndUploadPhoto(pending, fotos.length + 1);
  };

  const handleCancelPendingUpload = (pendingId: string) => {
    const item = pendingUploads.find((p) => p.id === pendingId);
    if (item?.abortController) {
      item.abortController.abort();
    }
    setPendingUploads((prev) => prev.filter((p) => p.id !== pendingId));
  };

  const handleRemoveFoto = async (fotoId: string) => {
    if (readOnly) return;
    const targetFoto = fotos.find((f) => f.id === fotoId);
    if (!targetFoto) return;

    if (targetFoto.storage_path) {
      void supabase.storage.from("comprovantes-entrega").remove([targetFoto.storage_path]).catch(() => {});
    }

    const updated = fotos.filter((f) => f.id !== fotoId);
    setFotos(updated);
    await onUpdate(order.id, { inspecao_fotos: updated });
    await recordHistory("foto_removida", `Foto "${targetFoto.nome_arquivo}" removida da inspeção`, {
      foto_id: fotoId,
    });
    toast.info("Foto removida da inspeção.");
  };

  // Salvar alterações manuais do checklist
  const handleSaveChecklist = async () => {
    // Valida se algum item marcado como reprovado está sem observação
    for (const item of INSPECAO_CHECKLIST_ITEMS) {
      const chk = checklist[item.key];
      if (chk?.status === "reprovado" && (!chk.observacao || !chk.observacao.trim())) {
        toast.error(`O item "${item.label}" está Reprovado e exige observação obrigatória!`);
        return;
      }
    }

    setSaving(true);
    try {
      await onUpdate(order.id, {
        inspecao_checklist: checklist,
      });
      await recordHistory("checklist_item", "Checklist de inspeção atualizado", { checklist });
      toast.success("Checklist de Inspeção salvo com sucesso!");
    } catch (err: any) {
      toast.error(`Erro ao salvar checklist: ${err?.message || "Erro desconhecido"}`);
    } finally {
      setSaving(false);
    }
  };

  // Concluir e Mover para Saída
  const handleConcludeAndMoveSaida = async () => {
    if (!validation.canMoveToSaida) {
      toast.error(
        `Não é possível mover para Saída:\n${validation.errorMessages.join("\n")}`
      );
      return;
    }

    setSaving(true);
    try {
      await onUpdate(order.id, {
        inspecao_checklist: checklist,
        inspecao_status: "aprovado",
      });

      if (onMoveToStatus) {
        await onMoveToStatus(order.id, "saida");
      }

      await recordHistory("saida", "O.S. aprovada na inspeção e movida para SAÍDA");
      toast.success("O.S. liberada com sucesso para a coluna SAÍDA!");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Erro ao mover para Saída: ${err?.message || "Erro desconhecido"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:w-full max-sm:max-w-full max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:p-3 sm:max-w-3xl sm:max-h-[90vh] flex flex-col overflow-hidden bg-card border-border text-card-foreground shadow-2xl rounded-2xl p-6">
        <DialogHeader className="border-b border-border pb-3 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <span>Inspeção de Qualidade — O.S. #{cleanNum}</span>
                  <Badge variant="outline" className="text-[10px] font-mono-tech border-border uppercase">
                    {order.setor_status || "entrada"}
                  </Badge>
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cliente: <strong className="text-foreground">{order.cliente}</strong> • Título: {order.titulo}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                  validation.canMoveToSaida
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                    : validation.reprovedItems.length > 0
                    ? "bg-rose-500/15 text-rose-400 border-rose-500/40"
                    : "bg-amber-500/15 text-amber-400 border-amber-500/40"
                }`}
              >
                {validation.canMoveToSaida
                  ? "APTO P/ SAÍDA ✓"
                  : validation.reprovedItems.length > 0
                  ? "REPROVADO ⚠️"
                  : "PENDÊNCIAS ⏳"}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4 flex-1 overflow-y-auto">
          {/* ══════════════════════════════════════════════════════════════
              SEÇÃO 1: UPLOAD DE FOTOS (MÍNIMO 1, MÁXIMO 5)
             ══════════════════════════════════════════════════════════════ */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Camera className="h-4 w-4 text-sky-400 shrink-0" />
                <Label className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Fotos da Inspeção ({fotos.length}/5)
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  (Mínimo 1 foto obrigatória para liberação)
                </span>
                {msUser ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3" />
                    SharePoint Conectado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] text-sky-400 font-medium bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
                    <Cloud className="h-3 w-3" />
                    SharePoint Integrado
                  </span>
                )}
              </div>

              {/* Botão de Anexar Foto / Abrir Câmera */}
              {!readOnly && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic"
                    multiple
                    disabled={fotos.length >= 5}
                    onChange={handleFileSelect}
                    className="hidden"
                    id={`inspecao-file-input-${order.id}`}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={fotos.length >= 5}
                    onClick={handleOpenAddPhotos}
                    className="text-xs h-8 gap-1.5 font-semibold bg-background hover:bg-muted"
                  >
                    <UploadCloud className="h-3.5 w-3.5 text-sky-400" />
                    <span>Adicionar Fotos</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Informação sobre sincronização direta com a pasta INSPEÇÃO */}
            {!msUser && !readOnly && (
              <div className="p-3 rounded-xl border border-sky-500/20 bg-sky-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-start gap-2.5">
                  <Cloud className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-sky-300">
                      Sincronização com o SharePoint Ativa
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      As fotos são salvas e sincronizadas automaticamente com a pasta <strong>INSPEÇÃO</strong> no SharePoint corporativo.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isConnectingMs}
                    onClick={handleConnectMicrosoft}
                    className="h-7 text-xs px-2.5 text-muted-foreground hover:text-foreground font-semibold rounded-lg"
                    title="Conectar sua conta Microsoft individual se desejar sincronização direta nesta máquina"
                  >
                    <LogIn className="h-3.5 w-3.5 mr-1.5" />
                    {isConnectingMs ? "Conectando..." : "Conectar Conta (Opcional)"}
                  </Button>
                </div>
              </div>
            )}

            {fotos.length >= 5 && (
              <p className="text-[11px] text-amber-500 font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Limite máximo de 5 fotos atingido.
              </p>
            )}

            {/* Uploads em andamento / Erros */}
            {pendingUploads.length > 0 && (
              <div className="space-y-2 pt-1">
                {pendingUploads.map((pending) => (
                  <div
                    key={pending.id}
                    className="p-2.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-xs flex flex-col gap-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <span className="font-mono-tech text-[11px] truncate max-w-[280px]">
                        {pending.file.name}
                      </span>
                      {pending.status === "error" ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-rose-400 text-[10px] font-bold">Falha no envio</span>
                          {(!msUser || pending.error?.includes("Pop-up") || pending.error?.includes("popup")) && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={handleConnectMicrosoft}
                              className="h-6 text-[10px] px-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                            >
                              <LogIn className="h-3 w-3 mr-1" /> Conectar Microsoft
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetryUpload(pending)}
                            className="h-6 text-[10px] px-2"
                          >
                            Tentar de novo
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCancelPendingUpload(pending.id)}
                            className="h-6 text-[10px] px-2 text-muted-foreground"
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-sky-400 font-semibold animate-pulse">
                          Enviando ao SharePoint ({pending.progress}%)...
                        </span>
                      )}
                    </div>
                    <Progress value={pending.progress} className="h-1.5" />
                    {pending.error && (
                      <p className="text-[10px] text-rose-400 leading-tight">{pending.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Grade de Fotos Anexadas com Preview e Remoção */}
            {fotos.length === 0 && pendingUploads.length === 0 ? (
              <div className="p-6 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
                <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <span>Nenhuma foto anexada ainda. Adicione pelo menos 1 foto para liberar a O.S.</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-1">
                {fotos.map((foto, idx) => (
                  <div
                    key={foto.id || idx}
                    className="group relative rounded-xl border border-border overflow-hidden bg-background flex flex-col justify-between"
                  >
                    <div className="aspect-square w-full bg-black/40 overflow-hidden relative flex items-center justify-center">
                      <img
                        src={foto.thumbnail_url || foto.web_url}
                        alt={foto.nome_arquivo}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        onError={(e) => {
                          // Fallback se a imagem direta falhar
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                      <div className="absolute top-1.5 left-1.5">
                        <Badge className="text-[9px] px-1.5 py-0 bg-black/70 text-white font-mono-tech border-0">
                          #{idx + 1}
                        </Badge>
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFoto(foto.id)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-md bg-rose-600/90 text-white hover:bg-rose-500 shadow-md cursor-pointer transition-colors"
                          title="Remover foto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="p-1.5 border-t border-border flex items-center justify-between text-[10px]">
                      <span className="truncate max-w-[85px] font-mono-tech text-muted-foreground" title={foto.nome_arquivo}>
                        {foto.nome_arquivo}
                      </span>
                      {foto.web_url ? (
                        <a
                          href={foto.web_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 hover:text-sky-300 inline-flex items-center"
                          title="Ver no SharePoint"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span
                          className="text-sky-400 inline-flex items-center gap-1 text-[9px] font-mono-tech"
                          title="Foto salva. Sincronizando com SharePoint em segundo plano..."
                        >
                          <Cloud className="h-3 w-3 animate-pulse" />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════
              SEÇÃO 2: CHECKLIST OBRIGATÓRIO (5 ITENS)
             ══════════════════════════════════════════════════════════════ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <Label className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Checklist de Inspeção (5 itens obrigatórios)
                </Label>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Nenhum item pré-selecionado • Opções mutuamente exclusivas
              </span>
            </div>

            <div className="space-y-3">
              {INSPECAO_CHECKLIST_ITEMS.map((itemConfig, index) => {
                const currentItem = checklist[itemConfig.key];
                const currentStatus = currentItem?.status;
                const requiresObs = currentStatus === "reprovado";
                const isObsMissing = requiresObs && (!currentItem?.observacao || !currentItem.observacao.trim());

                return (
                  <div
                    key={itemConfig.key}
                    className={`p-3.5 rounded-xl border transition-colors ${
                      currentStatus === "aprovado"
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : currentStatus === "aprovado_restricao"
                        ? "border-amber-500/30 bg-amber-500/5"
                        : currentStatus === "reprovado"
                        ? "border-rose-500/40 bg-rose-500/10"
                        : "border-border bg-muted/10"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono-tech font-bold text-muted-foreground">
                          0{index + 1}.
                        </span>
                        <span className="text-xs font-bold text-foreground">
                          {itemConfig.label}
                        </span>
                        {!currentStatus && (
                          <Badge variant="outline" className="text-[9px] text-amber-500 border-amber-500/40 px-1 py-0">
                            Pendente
                          </Badge>
                        )}
                      </div>

                      {/* 3 Opções Mutuamente Exclusivas */}
                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 shrink-0 pl-0 sm:pl-0 max-sm:w-full">
                        <Button
                          type="button"
                          size="sm"
                          variant={currentStatus === "aprovado" ? "default" : "outline"}
                          disabled={readOnly}
                          onClick={() => handleItemStatusChange(itemConfig.key, "aprovado")}
                          className={`text-xs max-sm:text-sm h-7 max-sm:min-h-[40px] px-2.5 rounded-lg cursor-pointer max-sm:flex-1 ${
                            currentStatus === "aprovado"
                              ? "bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Aprovado
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant={currentStatus === "aprovado_restricao" ? "default" : "outline"}
                          disabled={readOnly}
                          onClick={() => handleItemStatusChange(itemConfig.key, "aprovado_restricao")}
                          className={`text-xs max-sm:text-sm h-7 max-sm:min-h-[40px] px-2.5 rounded-lg cursor-pointer max-sm:flex-1 ${
                            currentStatus === "aprovado_restricao"
                              ? "bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                          Restrição
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant={currentStatus === "reprovado" ? "default" : "outline"}
                          disabled={readOnly}
                          onClick={() => handleItemStatusChange(itemConfig.key, "reprovado")}
                          className={`text-xs max-sm:text-sm h-7 max-sm:min-h-[40px] px-2.5 rounded-lg cursor-pointer max-sm:flex-1 ${
                            currentStatus === "reprovado"
                              ? "bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Reprovado
                        </Button>
                      </div>
                    </div>

                    {/* Campo de Observação (Obrigatório se Reprovado, Opcional se Com Restrição) */}
                    {(currentStatus === "aprovado_restricao" || currentStatus === "reprovado") && (
                      <div className="mt-3 pt-2.5 border-t border-border/50 pl-5 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span
                            className={`font-semibold ${
                              requiresObs ? "text-rose-400" : "text-amber-400"
                            }`}
                          >
                            Observação {requiresObs ? "(Obrigatória para item Reprovado)*" : "(Opcional)"}:
                          </span>
                          {currentItem?.avaliado_em && (
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(currentItem.avaliado_em).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                        <Textarea
                          disabled={readOnly}
                          value={currentItem?.observacao || ""}
                          onChange={(e) => handleItemObsChange(itemConfig.key, e.target.value)}
                          placeholder={
                            requiresObs
                              ? "Descreva detalhadamente o motivo da reprovação..."
                              : "Observações ou detalhes da restrição aceita..."
                          }
                          className={`text-xs max-sm:text-base min-h-[50px] resize-none ${
                            isObsMissing ? "border-rose-500 focus-visible:ring-rose-500" : ""
                          }`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              SEÇÃO 3: HISTÓRICO E RASTREABILIDADE
             ══════════════════════════════════════════════════════════════ */}
          <div className="p-3.5 rounded-xl border border-border bg-muted/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wide">
                <History className="h-4 w-4 text-sky-400" />
                <span>Histórico de Ações da Inspeção</span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {history.length} evento(s) registrado(s)
              </span>
            </div>

            {loadingHistory ? (
              <p className="text-xs text-muted-foreground py-2">Carregando histórico...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Nenhum evento registrado ainda.</p>
            ) : (
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="p-2 rounded-lg bg-background/80 border border-border/50 text-[11px] flex items-start justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <p className="text-foreground font-medium leading-snug">{h.descricao}</p>
                      <span className="text-[10px] text-muted-foreground">
                        Por: {h.usuario_nome || "Operador"}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono-tech text-muted-foreground shrink-0">
                      {new Date(h.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border shrink-0 bg-card">
          <div className="text-left text-xs max-sm:w-full">
            {!validation.canMoveToSaida ? (
              <span className="text-amber-500 font-medium">
                {validation.errorMessages[0] || "Preencha os requisitos para liberar a Saída."}
              </span>
            ) : (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                Todos os critérios atendidos. Pronto para liberação!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs max-sm:min-h-[40px] max-sm:px-3"
            >
              Fechar
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving || readOnly}
              onClick={handleSaveChecklist}
              className="text-xs font-semibold max-sm:min-h-[40px] max-sm:px-3"
            >
              Salvar Checklist
            </Button>

            {onMoveToStatus && (
              <Button
                type="button"
                size="sm"
                disabled={saving || !validation.canMoveToSaida || readOnly}
                onClick={handleConcludeAndMoveSaida}
                className="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50 max-sm:min-h-[40px] max-sm:px-3"
              >
                Liberar para Saída →
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
