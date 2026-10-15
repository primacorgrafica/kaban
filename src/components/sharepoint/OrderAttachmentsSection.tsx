import { useState, useRef, useEffect } from "react";
import {
  FileText,
  Upload,
  Cloud,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Trash2,
  Loader2,
  RefreshCw,
  FileArchive,
  Image as ImageIcon,
  FolderOpen,
  ShieldCheck,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOrderAttachments } from "@/hooks/useOrderAttachments";
import {
  getActiveMicrosoftAccount,
  loginMicrosoft,
} from "@/lib/msalClient";
import type { OrderAttachment } from "@/types/sharepoint";
import type { AccountInfo } from "@azure/msal-browser";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OrderAttachmentsSectionProps {
  orderId: string | null;
  orderTitulo?: string;
  readOnly?: boolean;
  canDelete?: boolean;
}

function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (["pdf"].includes(ext)) {
    return <FileText className="h-5 w-5 text-red-500 shrink-0" />;
  }
  if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) {
    return <ImageIcon className="h-5 w-5 text-sky-400 shrink-0" />;
  }
  if (["zip", "rar", "7z", "tar"].includes(ext)) {
    return <FileArchive className="h-5 w-5 text-amber-400 shrink-0" />;
  }
  if (["ai", "cdr", "eps", "psd"].includes(ext)) {
    return <FileText className="h-5 w-5 text-purple-400 shrink-0" />;
  }
  return <FileText className="h-5 w-5 text-cyan-400 shrink-0" />;
}

export function OrderAttachmentsSection({
  orderId,
  orderTitulo,
  readOnly = false,
  canDelete = true,
}: OrderAttachmentsSectionProps) {
  const {
    attachments,
    loading,
    uploadQueue,
    isUploading,
    folderInfo,
    uploadFiles,
    cancelUpload,
    dismissQueueItem,
    deleteAttachment,
  } = useOrderAttachments(orderId, orderTitulo);

  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [msAccount, setMsAccount] = useState<AccountInfo | null>(null);
  const [msAuthLoading, setMsAuthLoading] = useState(false);
  const [deletingAttachment, setDeletingAttachment] = useState<OrderAttachment | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verifica conta Microsoft conectada
  useEffect(() => {
    void getActiveMicrosoftAccount().then(setMsAccount);
  }, []);

  const handleConnectMicrosoft = async () => {
    setMsAuthLoading(true);
    try {
      const acc = await loginMicrosoft();
      setMsAccount(acc);
    } catch (err: any) {
      console.warn("Falha ao autenticar Microsoft:", err);
    } finally {
      setMsAuthLoading(false);
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    setStagedFiles((prev) => {
      // Evita adicionar arquivos com mesmo nome e tamanho duplicados na fila de staging
      const existingSignatures = new Set(prev.map((f) => `${f.name}_${f.size}`));
      const filtered = newFiles.filter((f) => !existingSignatures.has(`${f.name}_${f.size}`));
      return [...prev, ...filtered];
    });
  };

  const removeStagedFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartUpload = async () => {
    if (stagedFiles.length === 0) return;
    const toUpload = [...stagedFiles];
    setStagedFiles([]);
    await uploadFiles(toUpload);
    // Atualiza status da conta se conectou durante o processo
    void getActiveMicrosoftAccount().then(setMsAccount);
  };

  const queueItems = Object.values(uploadQueue);

  return (
    <div className="space-y-4">
      {/* ─── CABEÇALHO DO COMPONENTE ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/80">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-cyan-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Anexos da O.S. (SharePoint Primacor)
          </h4>
          <Badge
            variant="outline"
            className="text-[10px] font-mono-tech border-cyan-500/30 text-cyan-400 bg-cyan-500/10"
          >
            {attachments.length} {attachments.length === 1 ? "arquivo" : "arquivos"}
          </Badge>
        </div>

        {/* Status da Conta Microsoft */}
        <div className="flex items-center gap-2">
          {msAccount ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-400 font-medium">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              <span className="truncate max-w-[180px]" title={msAccount.username}>
                {msAccount.name || msAccount.username}
              </span>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={msAuthLoading}
              onClick={handleConnectMicrosoft}
              className="h-7 text-xs gap-1 border-cyan-500/30 hover:border-cyan-500 text-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/10 rounded-lg"
            >
              {msAuthLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <LogIn className="h-3 w-3" />
              )}
              Conectar Microsoft 365
            </Button>
          )}

          {folderInfo?.folderWebUrl && (
            <a
              href={folderInfo.folderWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Abrir Pasta ({folderInfo.folderName})
            </a>
          )}
        </div>
      </div>

      {/* ─── ÁREA DE DRAG & DROP / SELEÇÃO (Apenas quando não for somente leitura) ─── */}
      {!readOnly && (
        <div className="space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              handleFileSelect(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
              isDragOver
                ? "border-cyan-400 bg-cyan-500/10 scale-[0.99]"
                : "border-slate-700/80 hover:border-cyan-500/50 bg-slate-900/40 hover:bg-slate-900/70"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
            <div className="flex flex-col items-center justify-center gap-1.5 pointer-events-none">
              <div className="h-9 w-9 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Upload className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-foreground">
                Clique para selecionar ou arraste arquivos aqui
              </p>
              <p className="text-[11px] text-muted-foreground">
                PDF, AI, CDR, TIFF, Imagens ou ZIP. Envio direto para o SharePoint corporativo.
              </p>
            </div>
          </div>

          {/* ─── ARQUIVOS EM ESPERA (STAGING) ANTES DE DISPARAR O UPLOAD ─── */}
          {stagedFiles.length > 0 && (
            <div className="p-3 rounded-xl border border-border bg-slate-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Prontos para envio ({stagedFiles.length})
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={isUploading}
                  onClick={handleStartUpload}
                  className="h-8 px-3 text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-slate-950 rounded-lg gap-1.5 shadow-sm"
                >
                  {isUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5" />
                  )}
                  {isUploading ? "Enviando..." : "Enviar para o SharePoint"}
                </Button>
              </div>

              <div className="divide-y divide-border/40 max-h-36 overflow-y-auto pr-1">
                {stagedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}_${idx}`}
                    className="py-1.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      {getFileIcon(file.name)}
                      <span className="truncate text-foreground font-medium">{file.name}</span>
                      <span className="text-muted-foreground text-[10px]">
                        ({formatBytes(file.size)})
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => removeStagedFile(idx)}
                      className="text-muted-foreground hover:text-red-400 p-1 transition-colors"
                      title="Remover arquivo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── FILA DE PROGRESSO EM TEMPO REAL ─── */}
      {queueItems.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Status das Transferências
          </span>
          <div className="space-y-2">
            {queueItems.map((item) => (
              <div
                key={item.id}
                className="p-2.5 rounded-xl border border-border/80 bg-slate-950/60 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate">
                    {getFileIcon(item.file.name)}
                    <span className="font-medium text-foreground truncate">{item.file.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      ({formatBytes(item.file.size)})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.status === "uploading" && (
                      <span className="text-cyan-400 font-mono text-[11px] font-bold">
                        {item.progress}%
                      </span>
                    )}
                    {item.status === "saving_metadata" && (
                      <span className="text-amber-400 text-[11px]">Salvando...</span>
                    )}
                    {item.status === "success" && (
                      <span className="text-emerald-400 flex items-center gap-1 text-[11px] font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
                      </span>
                    )}
                    {item.status === "error" && (
                      <span className="text-red-400 flex items-center gap-1 text-[11px]">
                        <AlertCircle className="h-3.5 w-3.5" /> Falha
                      </span>
                    )}
                    {item.status === "cancelled" && (
                      <span className="text-muted-foreground text-[11px]">Cancelado</span>
                    )}

                    {item.status === "uploading" && (
                      <button
                        type="button"
                        onClick={() => cancelUpload(item.id)}
                        className="text-muted-foreground hover:text-red-400 p-0.5"
                        title="Cancelar upload"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(item.status === "success" ||
                      item.status === "error" ||
                      item.status === "cancelled") && (
                      <button
                        type="button"
                        onClick={() => dismissQueueItem(item.id)}
                        className="text-muted-foreground hover:text-foreground p-0.5"
                        title="Fechar status"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {item.status === "uploading" && (
                  <Progress value={item.progress} className="h-1.5 bg-slate-800" />
                )}

                {item.error && (
                  <p className="text-[10px] text-red-400/90 leading-tight">{item.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── LISTA DE ANEXOS EXISTENTES NO SHAREPOINT ─── */}
      <div className="space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
            Carregando anexos...
          </div>
        )}

        {!loading && attachments.length === 0 && queueItems.length === 0 && (
          <div className="p-4 rounded-xl border border-border/60 bg-muted/20 text-center">
            <p className="text-xs text-muted-foreground italic">
              Nenhum anexo vinculado a esta Ordem de Serviço ainda.
            </p>
          </div>
        )}

        {!loading && attachments.length > 0 && (
          <div className="divide-y divide-border/60 rounded-xl border border-border bg-slate-900/40 overflow-hidden">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {getFileIcon(att.nome_arquivo)}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate" title={att.nome_arquivo}>
                      {att.nome_arquivo}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono-tech">
                      <span>{formatBytes(att.tamanho_bytes)}</span>
                      <span>•</span>
                      <span>
                        {format(new Date(att.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Abrir diretamente no SharePoint */}
                  <a
                    href={att.sharepoint_web_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir no SharePoint
                  </a>

                  {/* Excluir Anexo */}
                  {canDelete && !readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingAttachment(att)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                      title="Excluir anexo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── MODAL DE CONFIRMAÇÃO DE EXCLUSÃO ─── */}
      <AlertDialog
        open={!!deletingAttachment}
        onOpenChange={(open) => !open && setDeletingAttachment(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Anexo da O.S.?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a remover o arquivo{" "}
              <strong className="text-foreground">{deletingAttachment?.nome_arquivo}</strong>.
              O arquivo será removido definitivamente do SharePoint corporativo e desvinculado
              desta Ordem de Serviço.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingAttachment) {
                  void deleteAttachment(deletingAttachment, true);
                  setDeletingAttachment(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              Confirmar Exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
