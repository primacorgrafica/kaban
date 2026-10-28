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
import { SHAREPOINT_PROTOCOLOS_URL } from "@/lib/sharepointService";
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
        const { data, error } = await supabase.storage
          .from("comprovantes-entrega")
          .list(order.id, {
            limit: 10,
            sortBy: { column: "created_at", order: "desc" },
          });

        if (error) {
          console.warn("[DeliveryModal] Erro ao listar comprovantes:", error);
          setProofFiles([]);
          return;
        }

        if (data && data.length > 0) {
          const filesWithUrls = await Promise.all(
            data
              .filter((f) => f.name !== ".emptyFolderPlaceholder")
              .map(async (file) => {
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
                };
              })
          );
          setProofFiles(filesWithUrls);
        } else {
          setProofFiles([]);
        }
      } catch (err) {
        console.warn("[DeliveryModal] Erro inesperado ao carregar comprovantes:", err);
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
        <DialogContent className="max-w-2xl bg-[#0B131E] border-[#253745] text-slate-100 p-0 overflow-hidden shadow-2xl rounded-2xl">
          {/* HEADER COM STATUS CONCLUÍDO */}
          <div className="bg-gradient-to-r from-emerald-950/60 via-[#11212D] to-[#0B131E] p-5 sm:p-6 border-b border-emerald-900/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)] shrink-0">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs font-semibold px-2.5 py-0.5">
                      Entrega Concluída & Protocolada
                    </Badge>
                    <span className="text-xs text-slate-400 font-mono-tech">
                      O.S. #{order.titulo}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white mt-1">
                    {order.cliente}
                  </h2>
                  <p className="text-xs text-slate-400 truncate max-w-md">
                    {order.descricao || "Sem descrição"}
                  </p>
                </div>
              </div>

              {/* Botão de Fechar rápido no topo em mobile/desktop */}
            </div>
          </div>

          {/* CORPO DO CARD COM DETALHES COMPLETOS */}
          <div className="p-5 sm:p-6 space-y-5 max-h-[72vh] overflow-y-auto scrollbar-thin scrollbar-thumb-[#253745]">
            {/* GRID DE INFORMAÇÕES DE QUEM RECEBEU E QUEM ENTREGOU */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Recebedor */}
              <div className="p-4 rounded-xl bg-[#11212D]/80 border border-[#253745] flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0 mt-0.5">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block">
                    Recebido Por
                  </span>
                  <div className="text-sm font-bold text-white mt-0.5 break-words">
                    {recipientDisplay}
                  </div>
                  {order.entrega_ac && (
                    <div className="text-xs text-slate-400 mt-1">
                      <span className="font-medium text-slate-300">A/C:</span> {order.entrega_ac}
                    </div>
                  )}
                </div>
              </div>

              {/* Motoboy / Entregador */}
              <div className="p-4 rounded-xl bg-[#11212D]/80 border border-[#253745] flex items-start gap-3">
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 shrink-0 mt-0.5">
                  <Bike className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block">
                    Entregador Responsável
                  </span>
                  <div className="text-sm font-bold text-white mt-0.5 break-words">
                    {effectiveDriver}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span>Entrega finalizada com sucesso</span>
                  </div>
                </div>
              </div>
            </div>

            {/* HORÁRIOS & TEMPO DE TRÂNSITO */}
            <div className="p-4 rounded-xl bg-[#11212D]/80 border border-[#253745] space-y-2.5">
              <div className="flex items-center justify-between border-b border-[#253745] pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-400" />
                  Registro de Horários da Entrega
                </span>
                {transitMinutes !== null && transitMinutes >= 0 && (
                  <Badge variant="outline" className="text-[11px] bg-amber-500/10 text-amber-300 border-amber-500/30">
                    Tempo em Rota: {transitMinutes} min
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                <div>
                  <span className="text-slate-400 block text-[11px]">Saída em Rota:</span>
                  <span className="font-semibold text-slate-200">
                    {departedAt
                      ? format(departedAt, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })
                      : "Horário de saída não registrado"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Chegada & Conclusão:</span>
                  <span className="font-semibold text-emerald-400">
                    {deliveredAt
                      ? format(deliveredAt, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })
                      : "Registrado no sistema"}
                  </span>
                </div>
              </div>
            </div>

            {/* ENDEREÇO & DOCUMENTOS */}
            <div className="p-4 rounded-xl bg-[#11212D]/80 border border-[#253745] space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-rose-400" />
                Local da Entrega
              </span>
              <p className="text-xs font-medium text-slate-200 break-words leading-relaxed">
                {destinationAddress}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-slate-400 border-t border-[#253745]/60 mt-2">
                <div>
                  <span className="font-semibold text-slate-300">Nota Fiscal: </span>
                  <span className="font-mono-tech">{order.nf || "Não informada"}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-300">Protocolo: </span>
                  <span className="font-mono-tech">{order.protocolo || "—"}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-300">Vendedor: </span>
                  <span>{order.vendedor || "—"}</span>
                </div>
              </div>
            </div>

            {/* OBSERVAÇÕES DO ENTREGADOR */}
            {order.obs_entrega && (
              <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-900/40 text-xs">
                <span className="font-semibold text-amber-300 flex items-center gap-1.5 mb-1">
                  <FileText className="h-3.5 w-3.5" />
                  Observações Anotadas pelo Entregador:
                </span>
                <p className="text-slate-300 italic whitespace-pre-wrap">{order.obs_entrega}</p>
              </div>
            )}

            {/* COMPROVANTE FOTOGRÁFICO / PROTOCOLO */}
            <div className="p-4 rounded-xl bg-[#11212D]/80 border border-[#253745] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-cyan-400" />
                  Foto do Comprovante / Protocolo Assinado
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] bg-blue-500/10 text-blue-300 border-blue-500/30"
                >
                  Pasta SharePoint: PROTOCOLOS ENTREGAS
                </Badge>
              </div>

              {loadingProof ? (
                <div className="flex items-center justify-center p-6 text-xs text-slate-400 gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
                  Carregando imagem do comprovante...
                </div>
              ) : proofFiles.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {proofFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="group relative rounded-xl border border-[#253745] overflow-hidden bg-black/40 hover:border-cyan-500/60 transition-all cursor-pointer"
                      onClick={() => setSelectedProofPreview(file.url)}
                    >
                      <img
                        src={file.url}
                        alt={`Comprovante ${order.titulo}`}
                        className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2.5">
                        <span className="text-[11px] font-medium text-white truncate flex-1">
                          {file.name}
                        </span>
                        <a
                          href={file.url}
                          download={file.name}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded bg-black/60 hover:bg-black text-cyan-300"
                          title="Baixar imagem"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                  <FileCheck className="h-6 w-6 text-slate-500" />
                  <span>Foto do protocolo físico arquivada na pasta corporativa de entregas.</span>
                </div>
              )}
            </div>

            {/* BOTÃO VISUALIZAR PROTOCOLO */}
            <div className="pt-1">
              <Button
                asChild
                className="w-full bg-[#0078D4] hover:bg-[#005A9E] text-white font-semibold shadow-md gap-2 h-10 text-sm cursor-pointer"
              >
                <a
                  href={SHAREPOINT_PROTOCOLOS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Visualizar Protocolo</span>
                </a>
              </Button>
            </div>
          </div>

          {/* FOOTER */}
          <DialogFooter className="p-4 bg-[#091019] border-t border-[#253745] flex items-center justify-between sm:justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmReopenOpen(true)}
              className="text-xs border-rose-900/60 text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 gap-1.5"
              title="Reabrir caso tenha havido engano na finalização"
            >
              <UserX className="h-3.5 w-3.5" />
              Reabrir / Reatribuir
            </Button>

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="bg-[#253745] hover:bg-[#34495e] text-white text-xs px-5"
            >
              Fechar
            </Button>
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
