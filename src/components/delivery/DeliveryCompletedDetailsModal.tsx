import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { SHAREPOINT_PROTOCOLOS_URL, SHAREPOINT_PROTOCOLOS_FOLDER } from "@/lib/sharepointService";
import { cn } from "@/lib/utils";
import type { Order } from "@/types/order";
import {
  CheckCircle2,
  ExternalLink,
  UserCheck,
  Bike,
  Clock,
  MapPin,
  FileCheck,
  FileText,
  Image as ImageIcon,
  Download,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface DeliveryCompletedDetailsModalProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName?: string;
  onReopenDelivery?: (order: Order) => void;
}

interface ProofFileItem {
  name: string;
  url: string;
  createdAt?: string;
  isSharePoint?: boolean;
}

export function DeliveryCompletedDetailsModal({
  order,
  open,
  onOpenChange,
  driverName,
  onReopenDelivery,
}: DeliveryCompletedDetailsModalProps) {
  const [proofFiles, setProofFiles] = useState<ProofFileItem[]>([]);
  const [loadingProof, setLoadingProof] = useState(false);
  const [selectedProofPreview, setSelectedProofPreview] = useState<string | null>(null);
  const [confirmReopenOpen, setConfirmReopenOpen] = useState(false);
  const [reopening, setReopening] = useState(false);

  useEffect(() => {
    if (!open || !order) {
      setProofFiles([]);
      setSelectedProofPreview(null);
      return;
    }

    const loadProofFiles = async () => {
      setLoadingProof(true);
      try {
        const foundProofs: ProofFileItem[] = [];

        // 1. Busca no SharePoint corporativo via order_attachments APENAS comprovantes da pasta PROTOCOLOS ENTREGAS.
        // NUNCA incluir arquivos da pasta KABAN (como logotipos, briefings, artes ou PDFs da O.S.)
        const { data: attachmentsData, error: attError } = await supabase
          .from("order_attachments" as any)
          .select("*")
          .eq("order_id", order.id)
          .order("created_at", { ascending: false });

        if (!attError && attachmentsData && attachmentsData.length > 0) {
          const protocolAttachments = (attachmentsData as any[]).filter((att) => {
            const folderName = (att.sharepoint_folder_name || "").trim().toUpperCase();
            const path = (att.sharepoint_path || "").trim().toUpperCase();
            const name = (att.nome_arquivo || "").trim().toUpperCase();

            // Descarta categoricamente qualquer arquivo que pertença à pasta KABAN
            if (path.startsWith("KABAN/") || folderName === "KABAN") {
              return false;
            }

            // É comprovante de entrega se pertence a PROTOCOLOS ENTREGAS ou segue o padrão de nomenclatura de protocolo
            const isProtocolFolder =
              folderName === SHAREPOINT_PROTOCOLOS_FOLDER.toUpperCase() ||
              path.includes(SHAREPOINT_PROTOCOLOS_FOLDER.toUpperCase()) ||
              path.includes("PROTOCOLOS%20ENTREGAS");

            const isProtocolName =
              name.startsWith("OS_") &&
              (name.includes("_PROTOCOLO") || name.includes("COMPROVANTE"));

            return isProtocolFolder || isProtocolName;
          });

          protocolAttachments.forEach((att: any) => {
            foundProofs.push({
              name: att.nome_arquivo,
              url: att.sharepoint_web_url || SHAREPOINT_PROTOCOLOS_URL,
              createdAt: att.created_at,
              isSharePoint: true,
            });
          });
        }

        // 2. Busca também no bucket privado 'comprovantes-entrega' (fotos enviadas pelo entregador)
        const { data, error } = await supabase.storage
          .from("comprovantes-entrega")
          .list(order.id, {
            limit: 10,
            sortBy: { column: "created_at", order: "desc" },
          });

        if (!error && data && data.length > 0) {
          const validStorageFiles = data.filter(
            (f) => f.name && !f.name.startsWith(".") && f.name !== ".emptyFolderPlaceholder"
          );

          const filesWithUrls = await Promise.all(
            validStorageFiles.map(async (file) => {
              const filePath = `${order.id}/${file.name}`;
              // Tenta URL assinada primeiro (para buckets privados)
              const { data: signedData } = await supabase.storage
                .from("comprovantes-entrega")
                .createSignedUrl(filePath, 3600);

              if (signedData?.signedUrl) {
                return {
                  name: file.name,
                  url: signedData.signedUrl,
                  createdAt: file.created_at,
                  isSharePoint: false,
                };
              }

              // Fallback para URL pública
              const { data: pubData } = supabase.storage
                .from("comprovantes-entrega")
                .getPublicUrl(filePath);

              return {
                name: file.name,
                url: pubData.publicUrl,
                createdAt: file.created_at,
                isSharePoint: false,
              };
            })
          );

          filesWithUrls.forEach((fileItem) => {
            if (fileItem?.url) {
              if (!foundProofs.some((p) => p.name === fileItem.name)) {
                foundProofs.push(fileItem);
              }
            }
          });
        }

        setProofFiles(foundProofs);
      } catch (err) {
        console.warn("[DeliveryModal] Erro inesperado ao carregar comprovantes:", err);
        setProofFiles([]);
      } finally {
        setLoadingProof(false);
      }
    };

    void loadProofFiles();
  }, [open, order]);

  if (!order) return null;

  const deliveredAt = order.entregue_em ? parseISO(order.entregue_em) : null;
  const departedAt = order.data_saida_entrega ? parseISO(order.data_saida_entrega) : null;
  const transitMinutes =
    departedAt && deliveredAt ? differenceInMinutes(deliveredAt, departedAt) : null;

  const handleReopen = async () => {
    if (!order) return;
    setReopening(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          status_entrega: "atribuido",
          entregue_em: null,
          entregue_para: null,
          obs_entrega: null,
        } as any)
        .eq("id", order.id);

      if (error) {
        toast.error(`Erro ao reabrir entrega: ${error.message}`);
      } else {
        toast.success("Entrega reaberta com sucesso e retornada para a fila de atribuição.");
        setConfirmReopenOpen(false);
        onOpenChange(false);
        onReopenDelivery?.(order);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado.");
    } finally {
      setReopening(false);
    }
  };

  const recipientDisplay =
    (order as any).entregue_para || (order as any).entrega_para || "Recebedor no Local";

  const effectiveDriver =
    (order as any).entregue_por || driverName || "Entregador Primacor";

  const destinationAddress =
    order.entrega_endereco || (order as any).endereco_entrega || "Endereço cadastrado na O.S.";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg w-[95vw] bg-[#0B131E] border-[#253745] text-slate-100 p-0 overflow-hidden shadow-2xl rounded-xl">
          {/* HEADER COM STATUS CONCLUÍDO (COMPACTO) */}
          <div className="bg-gradient-to-r from-emerald-950/60 via-[#11212D] to-[#0B131E] px-4 py-3 sm:px-5 sm:py-3.5 border-b border-emerald-900/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)] shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] font-semibold px-2 py-0">
                    Entrega Concluída
                  </Badge>
                  <span className="text-xs text-slate-400 font-mono-tech">
                    O.S. #{order.titulo}
                  </span>
                </div>
                <h2 className="text-base font-bold tracking-tight text-white mt-0.5 truncate">
                  {order.cliente}
                </h2>
                {order.descricao && (
                  <p className="text-[11px] text-slate-400 truncate">
                    {order.descricao}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* CORPO COMPACTO E LIMPO */}
          <div className="p-3.5 sm:p-4 space-y-2.5 max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-[#253745]">
            {/* GRID: RECEBEDOR & ENTREGADOR */}
            <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-[#11212D]/80 border border-[#253745]">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1">
                  <UserCheck className="h-3 w-3 text-emerald-400" /> Recebido Por
                </span>
                <p className="font-semibold text-white truncate text-xs mt-0.5" title={recipientDisplay}>
                  {recipientDisplay}
                </p>
                {order.entrega_ac && (
                  <span className="text-[11px] text-slate-400 block truncate" title={`A/C: ${order.entrega_ac}`}>
                    A/C: {order.entrega_ac}
                  </span>
                )}
              </div>

              <div className="min-w-0 border-l border-[#253745]/60 pl-2.5">
                <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1">
                  <Bike className="h-3 w-3 text-sky-400" /> Entregador
                </span>
                <p className="font-semibold text-white truncate text-xs mt-0.5" title={effectiveDriver}>
                  {effectiveDriver}
                </p>
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 shrink-0" /> Finalizada
                </span>
              </div>
            </div>

            {/* HORÁRIOS, TEMPO DE ROTA & ENDEREÇO */}
            <div className="p-2.5 rounded-lg bg-[#11212D]/80 border border-[#253745] space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-[#253745]/60">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span>
                    {deliveredAt
                      ? format(deliveredAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : "Horário registrado"}
                  </span>
                </div>
                {transitMinutes !== null && transitMinutes >= 0 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-300 border-amber-500/30">
                    Rota: {transitMinutes} min
                  </Badge>
                )}
              </div>

              {departedAt && (
                <div className="text-[11px] text-slate-400">
                  Saída em rota: <span className="text-slate-300 font-medium">{format(departedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                </div>
              )}

              <div className="flex items-start gap-1.5 text-slate-200 text-xs">
                <MapPin className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-snug break-words">{destinationAddress}</span>
              </div>

              {(order.nf || order.protocolo || order.vendedor) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 pt-1.5 border-t border-[#253745]/60">
                  {order.nf && (
                    <span>NF: <strong className="text-slate-200 font-mono-tech">{order.nf}</strong></span>
                  )}
                  {order.protocolo && (
                    <span>Protocolo: <strong className="text-slate-200 font-mono-tech">{order.protocolo}</strong></span>
                  )}
                  {order.vendedor && (
                    <span>Vendedor: <strong className="text-slate-200">{order.vendedor}</strong></span>
                  )}
                </div>
              )}
            </div>

            {/* OBSERVAÇÕES DO ENTREGADOR */}
            {order.obs_entrega && (
              <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-900/40 text-xs">
                <span className="font-semibold text-amber-300 flex items-center gap-1 text-[11px]">
                  <FileText className="h-3 w-3" /> Observação do Entregador:
                </span>
                <p className="text-slate-300 italic mt-0.5 text-xs whitespace-pre-wrap">{order.obs_entrega}</p>
              </div>
            )}

            {/* COMPROVANTE FOTOGRÁFICO / PROTOCOLO */}
            <div className="p-2.5 rounded-lg bg-[#11212D]/80 border border-[#253745] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5 text-cyan-400" />
                  Comprovante / Protocolo ({proofFiles.length})
                </span>
                <span className="text-[10px] text-slate-400">
                  Clique na foto para ampliar
                </span>
              </div>

              {loadingProof ? (
                <div className="flex items-center justify-center p-4 text-xs text-slate-400 gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                  Carregando comprovante...
                </div>
              ) : proofFiles.length > 0 ? (
                <div
                  className={cn(
                    "gap-2 pt-0.5",
                    proofFiles.length === 1 ? "grid grid-cols-1" : "grid grid-cols-1 sm:grid-cols-2"
                  )}
                >
                  {proofFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="group relative rounded-lg border border-[#253745] overflow-hidden bg-black/60 hover:border-cyan-500/60 transition-all cursor-pointer flex items-center justify-center"
                      onClick={() => {
                        if (file.isSharePoint && file.url) {
                          window.open(file.url, "_blank");
                        } else {
                          setSelectedProofPreview(file.url);
                        }
                      }}
                    >
                      {file.isSharePoint ? (
                        <div className="flex flex-col items-center justify-center p-6 text-center gap-2 w-full h-44 bg-[#0d1824] hover:bg-[#11212d] transition-colors">
                          <ImageIcon className="h-10 w-10 text-cyan-400 group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-semibold text-slate-200 truncate max-w-full px-2" title={file.name}>
                            {file.name}
                          </span>
                          <span className="text-[10px] text-cyan-300 flex items-center gap-1 font-mono-tech">
                            <ExternalLink className="h-3 w-3" /> Abrir no SharePoint
                          </span>
                        </div>
                      ) : (
                        <img
                          src={file.url}
                          alt={`Comprovante ${order.titulo}`}
                          className={cn(
                            "w-full object-contain group-hover:scale-[1.02] transition-transform duration-200 bg-black/40",
                            proofFiles.length === 1 ? "h-64 sm:h-72" : "h-44 sm:h-52"
                          )}
                          loading="lazy"
                        />
                      )}
                      <a
                        href={file.url}
                        target={file.isSharePoint ? "_blank" : undefined}
                        download={!file.isSharePoint ? file.name : undefined}
                        rel={file.isSharePoint ? "noopener noreferrer" : undefined}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/75 hover:bg-black text-cyan-300 shadow transition-colors border border-white/10"
                        title={file.isSharePoint ? "Abrir no SharePoint" : "Baixar imagem"}
                      >
                        {file.isSharePoint ? <ExternalLink className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-1.5 bg-[#09111b] rounded-lg border border-[#1e2f3d]/60 p-3">
                  <FileCheck className="h-6 w-6 text-slate-500 mb-0.5" />
                  <span className="text-slate-300 font-medium">Nenhum comprovante fotográfico encontrado nesta O.S.</span>
                  <span className="text-[11px] text-slate-400">
                    Os protocolos sincronizados são salvos exclusivamente na pasta <strong>PROTOCOLOS ENTREGAS</strong> no SharePoint.
                  </span>
                  <a
                    href={SHAREPOINT_PROTOCOLOS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 underline mt-1"
                  >
                    <ExternalLink className="h-3 w-3" /> Abrir pasta PROTOCOLOS ENTREGAS no SharePoint
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* FOOTER COMPACTO */}
          <DialogFooter className="px-4 py-2.5 bg-[#091019] border-t border-[#253745] flex items-center justify-between sm:justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmReopenOpen(true)}
              className="text-xs h-8 border-rose-900/60 text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 gap-1.5"
              title="Reabrir caso tenha havido engano na finalização"
            >
              <UserX className="h-3.5 w-3.5" />
              Reabrir / Reatribuir
            </Button>

            <div className="flex items-center gap-2">
              <Button
                asChild
                size="sm"
                className="h-8 px-3 bg-[#0078D4] hover:bg-[#005A9E] text-white text-xs font-medium gap-1.5 shadow-sm"
              >
                <a
                  href={proofFiles.find((p) => p.isSharePoint && p.url)?.url || SHAREPOINT_PROTOCOLOS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Visualizar Protocolo</span>
                </a>
              </Button>

              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-8 bg-[#253745] hover:bg-[#34495e] text-white text-xs px-4"
              >
                Fechar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE PRÉ-VISUALIZAÇÃO DA FOTO DO COMPROVANTE EM TAMANHO REAL */}
      {selectedProofPreview && (
        <Dialog
          open={!!selectedProofPreview}
          onOpenChange={(open) => !open && setSelectedProofPreview(null)}
        >
          <DialogContent className="max-w-4xl bg-black/95 border-zinc-800 p-2 text-white">
            <div className="relative flex items-center justify-center p-2">
              <img
                src={selectedProofPreview}
                alt="Comprovante em tamanho real"
                className="max-h-[85vh] w-auto object-contain rounded-lg shadow-2xl"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* DIÁLOGO DE CONFIRMAÇÃO PARA REABERTURA */}
      {confirmReopenOpen && (
        <Dialog open={confirmReopenOpen} onOpenChange={setConfirmReopenOpen}>
          <DialogContent className="max-w-md bg-[#0B131E] border-rose-900/60 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-400">
                <AlertCircle className="h-5 w-5" />
                Reabrir Entrega da O.S. #{order.titulo}?
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-slate-300 leading-relaxed py-2">
              Ao reabrir, o status voltará para <strong>Atribuído</strong> e o horário de entrega
              será reiniciado para que o motoboy possa realizar uma nova tentativa ou correção.
            </p>
            <DialogFooter className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmReopenOpen(false)}
                disabled={reopening}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleReopen}
                disabled={reopening}
                className="text-xs gap-1.5"
              >
                {reopening ? "Reabrindo..." : "Confirmar Reabertura"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
