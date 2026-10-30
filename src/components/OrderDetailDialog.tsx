import { getOrderRevision, cleanObservationRevision } from "@/lib/orderRevision";
import { useState, useEffect } from "react";
import { Order, OrderStatus, STATUS_CONFIG, STATUS_ORDER } from "@/types/order";
import { DEPARTMENTS, Department } from "@/types/production";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RotateCcw, Calendar,
  User,
  FileText,
  Archive,
  Trash2,
  UserCheck,
  Clock,
  AlertTriangle,
  Send,
  Truck,
  Briefcase,
  Copy,
  Edit2,
  Repeat,
  Check,
  Sparkles,
  HardHat, } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALL_PROCESSOS,
  getProcessoCor,
  sortAndFilterProcessos,
  ACABAMENTO_TIPOS,
  IMPRESSAO_TIPOS,
  IMPRESSAO_PROCESSOS,
  SPECIAL_SUPPLIES,
  isSpecialSupplyActive,
  isSpecialSupplySent,
  toggleSpecialSupplySent,
  toggleSpecialSupplyActive,
  getSpecialSupplyDetails,
  getSpecialSupplyBadgeClasses,
  getSpecialSupplyCustomText,
  setSpecialSupplyCustomText,
  formatSafeDate,
} from "@/lib/processos";
import { OrderAttachmentsSection } from "@/components/sharepoint/OrderAttachmentsSection";
import { CreateOrderDialog } from "./CreateOrderDialog";
import { OrderEmailEventsSection } from "@/components/email/OrderEmailEventsSection";

// sortAndFilterProcessos importado de @/lib/processos

export interface OrderDetailDialogPermissions {
  canEditCard?: boolean;
  canAdvanceCards?: boolean;
  canPauseCards?: boolean;
  canArchive?: boolean;
  canDelete?: boolean;
  canSendToProduction?: boolean;
  isViewOnly?: boolean;
}

export interface OrderDetailDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, data: Partial<Order>) => void;
  onDuplicate?: (order: Order) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSendToProduction?: (id: string, department: Department, machine?: string) => void;
  onSendToMultipleProduction?: (id: string, departments: { department: Department; machine?: string }[]) => void;
  onSendToExpedicao?: (id: string) => void;
  permissions?: OrderDetailDialogPermissions;
  departmentContext?: string;
  getProfileName?: (userId: string | null) => string | null;
}

export function OrderDetailDialog({
  // OrderDetailDialog

  order,
  open,
  onOpenChange,
  onUpdate,
  onDuplicate,
  onArchive,
  onDelete,
  onSendToProduction,
  onSendToMultipleProduction,
  onSendToExpedicao,
  permissions = {
    canEditCard: true,
    canAdvanceCards: true,
    canArchive: true,
    canDelete: true,
    canSendToProduction: true,
    isViewOnly: false,
  },
  departmentContext,
  getProfileName,
}: OrderDetailDialogProps) {
  const currentRevision = getOrderRevision(order);
  if (!order) return null;

  const [editing, setEditing] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState<{ department: Department; machine?: string }[]>([]);
  const [currentDept, setCurrentDept] = useState<Department | "">("");
  const [currentMachine, setCurrentMachine] = useState("");
  const [vendedoresList, setVendedoresList] = useState<{ id: string; nome: string }[]>([]);
  const [operadoresList, setOperadoresList] = useState<{ id: string; user_id?: string; nome: string; setor_vinculado?: string | null }[]>([]);
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);

  const [editData, setEditData] = useState({
    titulo: order.titulo,
    descricao: order.descricao,
    cliente: order.cliente,
    observacao: order.observacao || "",
    obs_prova: order.obs_prova || "",
    saida_direta: order.saida_direta || false,
    prova_digital: order.prova_digital || false,
    prova_email: order.prova_email || false,
    endereco_entrega: order.endereco_entrega || "",
    destinatario: order.destinatario || "",
    entregue_para: order.entregue_para || "",
    entregue_por: (order as any).entregue_por || "",
    entregue_em: order.entregue_em || "",
    urgente: order.urgente || false,
    urgente_prova: order.urgente_prova || false,
    urgente_impressao: order.urgente_impressao || false,
    urgente_acabamento: order.urgente_acabamento || false,
    urgente_expedicao: order.urgente_expedicao || false,
    digital_color: (order as any).digital_color || false,
    digital_pb: (order as any).digital_pb || false,
    prazo: order.prazo ? order.prazo.slice(0, 16) : "",
    vendedor: order.vendedor || "",
    operador: order.operador || "",
    tipo_trabalho: order.tipo_trabalho || "novo",
    os_anterior: order.os_anterior || "",
    revisao: getOrderRevision(order),
    processos: order.processos || ([] as string[]),
    tipo_documento: (order.nf ? "NF" : order.protocolo ? "PROTOCOLO" : "") as "NF" | "PROTOCOLO" | "",
    valor_documento: order.nf || order.protocolo || "",
    empresa_entrega: order.empresa_entrega || "",
    obs_entrega: order.obs_entrega || "",
    tipo_entrega: order.tipo_entrega || ([] as string[]),
    entrega_para: order.entrega_para || "",
    entrega_endereco: order.entrega_endereco || "",
    entrega_ac: order.entrega_ac || "",
    entrega_data_limite: order.entrega_data_limite ? order.entrega_data_limite.slice(0, 16) : "",
  });

  useEffect(() => {
    if (order) {
      setEditData({
        titulo: order.titulo,
        descricao: order.descricao,
        cliente: order.cliente,
        observacao: order.observacao || "",
        obs_prova: order.obs_prova || "",
        saida_direta: order.saida_direta || false,
        prova_digital: order.prova_digital || false,
        prova_email: order.prova_email || false,
        endereco_entrega: order.endereco_entrega || "",
        destinatario: order.destinatario || "",
        entregue_para: order.entregue_para || "",
        entregue_por: (order as any).entregue_por || "",
        entregue_em: order.entregue_em || "",
        urgente: order.urgente || false,
        urgente_prova: order.urgente_prova || false,
        urgente_impressao: order.urgente_impressao || false,
        urgente_acabamento: order.urgente_acabamento || false,
        urgente_expedicao: order.urgente_expedicao || false,
        digital_color: (order as any).digital_color || false,
        digital_pb: (order as any).digital_pb || false,
        prazo: order.prazo ? order.prazo.slice(0, 16) : "",
        vendedor: order.vendedor || "",
        operador: order.operador || "",
        tipo_trabalho: order.tipo_trabalho || "novo",
        os_anterior: order.os_anterior || "",
        revisao: getOrderRevision(order),
        processos: order.processos || [],
        tipo_documento: (order.nf ? "NF" : order.protocolo ? "PROTOCOLO" : "") as "NF" | "PROTOCOLO" | "",
        valor_documento: order.nf || order.protocolo || "",
        empresa_entrega: order.empresa_entrega || "",
        obs_entrega: order.obs_entrega || "",
        tipo_entrega: order.tipo_entrega || [],
        entrega_para: order.entrega_para || "",
        entrega_endereco: order.entrega_endereco || "",
        entrega_ac: order.entrega_ac || "",
        entrega_data_limite: order.entrega_data_limite ? order.entrega_data_limite.slice(0, 16) : "",
      });
      setEditing(false);
    }
  }, [order]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, user_id, nome, setor_vinculado")
      .order("nome")
      .then(({ data }) => {
        if (data) {
          setOperadoresList(data.filter((p) => p.nome && p.nome.trim().length > 0));
        }
      });
  }, []);

  const handleAssignOperador = async (newOperador: string | null) => {
    if (!order) return;
    onUpdate(order.id, { operador: newOperador });
    const { error } = await (supabase.from("orders") as any)
      .update({ operador: newOperador })
      .eq("id", order.id);

    if (error) {
      toast.error("Erro ao atribuir operador: " + error.message);
    } else {
      toast.success(
        newOperador
          ? `Operador "${newOperador}" atribuído à O.S. com sucesso!`
          : "Operador desvinculado da O.S."
      );
    }
  };

  useEffect(() => {
    if (order?.criado_por) {
      if (getProfileName) {
        setCreatedByName(getProfileName(order.criado_por));
      } else {
        supabase.from("perfis").select("nome").eq("user_id", order.criado_por).maybeSingle().then(({ data }) => {
          if (data?.nome) setCreatedByName(data.nome);
        });
      }
    } else {
      setCreatedByName(null);
    }

    if (order?.atualizado_por) {
      if (getProfileName) {
        setUpdatedByName(getProfileName(order.atualizado_por));
      } else {
        supabase.from("perfis").select("nome").eq("user_id", order.atualizado_por).maybeSingle().then(({ data }) => {
          if (data?.nome) setUpdatedByName(data.nome);
        });
      }
    } else {
      setUpdatedByName(null);
    }
  }, [order?.criado_por, order?.atualizado_por, getProfileName]);

  useEffect(() => {
    if (editing) {
      supabase.from("vendedores").select("id, nome").order("nome").then(({ data }) => {
        if (data) setVendedoresList(data);
      });
    }
  }, [editing]);

  const config = STATUS_CONFIG[order.status] || { label: order.status, colorKey: "andamento" };
  const isLastStatus = order.status === "arquivo_liberado";
  const isNearDeadline = order.prazo ? new Date(order.prazo).getTime() <= Date.now() : false;

  const toggleEditProcesso = (sigla: string) => {
    setEditData((d) => ({
      ...d,
      processos: d.processos.includes(sigla)
        ? d.processos.filter((p) => p !== sigla)
        : [...d.processos, sigla],
    }));
  };

  const toggleEditTipoEntrega = (tipo: string) => {
    setEditData((d) => ({
      ...d,
      tipo_entrega: d.tipo_entrega.includes(tipo)
        ? d.tipo_entrega.filter((t) => t !== tipo)
        : [...d.tipo_entrega, tipo],
    }));
  };

  const handleSave = () => {
    onUpdate(order.id, {
      titulo: editData.titulo,
      descricao: editData.descricao,
      cliente: editData.cliente.trim().toUpperCase(),
      observacao: editData.observacao || null,
      obs_prova: editData.obs_prova || null,
      saida_direta: editData.saida_direta,
      prova_digital: editData.prova_digital,
      prova_email: editData.prova_email,
      endereco_entrega: editData.prova_digital ? editData.endereco_entrega || null : null,
      destinatario: editData.prova_digital ? editData.destinatario || null : null,
      entregue_para: editData.prova_digital ? editData.entregue_para || null : null,
      entregue_por: editData.prova_digital ? editData.entregue_por || null : null,
      entregue_em: editData.prova_digital ? editData.entregue_em || null : null,
      urgente:
        editData.urgente_prova ||
        editData.urgente_impressao ||
        editData.urgente_acabamento ||
        editData.urgente_expedicao,
      urgente_prova: editData.urgente_prova,
      urgente_impressao: editData.urgente_impressao,
      urgente_acabamento: editData.urgente_acabamento,
      urgente_expedicao: editData.urgente_expedicao,
      digital_color: editData.digital_color,
      digital_pb: editData.digital_pb,
      prazo: editData.prazo ? new Date(editData.prazo).toISOString() : null,
      vendedor: editData.vendedor || null,
      operador: editData.operador || null,
      tipo_trabalho: editData.tipo_trabalho || null,
      os_anterior: editData.tipo_trabalho === "repeticao" ? (editData.os_anterior || null) : null,
      revisao: editData.revisao || 1,
      processos: editData.processos.length > 0 ? editData.processos : [],
      nf: editData.tipo_documento === "NF" ? editData.valor_documento || null : null,
      protocolo: editData.tipo_documento === "PROTOCOLO" ? editData.valor_documento || null : null,
      empresa_entrega: editData.empresa_entrega || null,
      obs_entrega: editData.obs_entrega || null,
      tipo_entrega: editData.tipo_entrega.length > 0 ? editData.tipo_entrega : [],
      entrega_para: editData.entrega_para || null,
      entrega_endereco: editData.entrega_endereco || null,
      entrega_ac: editData.entrega_ac || null,
      entrega_data_limite: editData.entrega_data_limite ? new Date(editData.entrega_data_limite).toISOString() : null,
    } as any);
    setEditing(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden border border-border bg-card text-card-foreground shadow-2xl backdrop-blur-2xl rounded-2xl flex flex-col max-h-[92vh]">
          {/* Header Fixo */}
          <div className="px-6 py-4 border-b border-border bg-muted/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-[#253745] border border-[#4A5C6A]/60 flex items-center justify-center text-[#CCD0CF]">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono-tech text-base font-bold text-foreground tracking-wide">
                    O.S. #{order.titulo}
                  </span>
                  {currentRevision >= 2 && (
                    <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40 text-[11px] font-bold font-mono-tech flex items-center gap-1">
                      <RotateCcw className="h-3 w-3" />
                      <span>REV{currentRevision}</span>
                    </Badge>
                  )}
                  {(order.tipo_trabalho === "repeticao" || order.os_anterior) && (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40 text-[11px] font-bold flex items-center gap-1">
                      <Repeat className="h-3 w-3" />
                      <span>REPETIÇÃO {order.os_anterior ? `(ANT: #${order.os_anterior})` : ""}</span>
                    </Badge>
                  )}
                  <Badge
                    style={{
                      backgroundColor: `hsl(var(--status-${config.colorKey}-bg))`,
                      color: `hsl(var(--status-${config.colorKey}))`,
                      border: `1px solid hsl(var(--status-${config.colorKey}) / 0.3)`,
                    }}
                    className="font-medium text-[11px]"
                  >
                    {config.label}
                  </Badge>
                  {order.urgente && (
                    <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40 text-[10px] animate-pulse flex items-center gap-1 font-bold">
                      <AlertTriangle className="h-3 w-3" /> URGENTE
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-medium truncate max-w-md mt-0.5 uppercase">
                  {order.cliente}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {order.prazo && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-muted/80 border border-border text-xs font-mono-tech text-foreground">
                  <Clock className="h-3.5 w-3.5 text-[#9BA8AB]" />
                  <span className={isNearDeadline ? "text-rose-400 font-bold" : ""}>
                    {format(new Date(order.prazo), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ═══ VIEW MODE (DUAL COLUMN SPLIT, CENTRALIZADO) ═══ */}
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-y-auto px-6 py-4 max-h-[68vh] scrollbar-none">
                {/* ─── COLUNA 1: ESPECIFICAÇÕES, PROVA & PROCESSOS ─── */}
                <div className="space-y-3">
                  {/* Bloco Comercial & Descrição */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-muted/40 dark:bg-[#253745]/25 backdrop-blur-md space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span>Dados do Serviço</span>
                    </div>
                    {order.descricao && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">Descrição</p>
                        <p className="text-xs text-foreground font-medium">{order.descricao}</p>
                      </div>
                    )}
                    {order.vendedor && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">Vendedor</p>
                        <p className="text-xs text-foreground flex items-center gap-1.5 font-medium">
                          <User className="h-3 w-3 text-primary" />
                          {order.vendedor}
                        </p>
                      </div>
                    )}
                    {currentRevision >= 2 && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <RotateCcw className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          <span>REVISÃO DO ARQUIVO</span>
                        </div>
                        <div className="text-xs">
                          <span className="font-mono-tech font-bold text-foreground text-sm">
                            REV{currentRevision}
                          </span>
                        </div>
                      </div>
                    )}
                    {(order.tipo_trabalho === "repeticao" || order.os_anterior) && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <Repeat className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          <span>REPETIÇÃO</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground mr-1">N.º O.S ANTERIOR:</span>
                          <span className="font-mono-tech font-bold text-foreground text-sm">
                            {order.os_anterior ? `#${order.os_anterior}` : "—"}
                          </span>
                        </div>
                      </div>
                    )}
                    {cleanObservationRevision(order.observacao) && (
                      <div className="pt-1.5 border-t border-border/60">
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">Observações</p>
                        <p className="text-xs text-foreground whitespace-pre-wrap">{cleanObservationRevision(order.observacao)}</p>
                      </div>
                    )}
                  </div>

                  {/* Bloco de Provas Técnicas */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-muted/40 dark:bg-[#253745]/25 backdrop-blur-md space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-[#CCD0CF] shadow-[0_0_8px_rgba(204,208,207,0.6)]" />
                        <span>Prova Técnica</span>
                      </div>
                      {order.urgente_prova && (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/40 text-[9px] animate-pulse">
                          Urgente
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {order.prova_email && (
                        <Badge className="bg-pink-600/20 text-pink-400 border border-pink-500/30 text-[11px] font-semibold">
                          E-mail
                        </Badge>
                      )}
                      {order.prova_digital && (
                        <Badge className="bg-sky-600/20 text-sky-400 border border-sky-500/30 text-[11px] font-semibold">
                          Digital
                        </Badge>
                      )}
                      {order.saida_direta && (
                        <Badge className="bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 text-[11px] font-semibold">
                          Saída Direta
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Bloco de Processos & Acabamentos */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-muted/40 dark:bg-[#253745]/25 backdrop-blur-md space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      <span>Suprimentos & Processos Especiais</span>
                    </div>

                    {/* Quadros PANTONE - FACA - CLICHÊ - OUTROS */}
                    {SPECIAL_SUPPLIES.some((s) => isSpecialSupplyActive(order.processos, s.id)) && (
                      <div className="flex flex-col gap-2 pb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {SPECIAL_SUPPLIES.filter((s) => isSpecialSupplyActive(order.processos, s.id)).map((item) => {
                            const isComprasItem = item.id === "PANTONE" || item.id === "OUTROS";
                            const effectiveComprasStatus =
                              order.setor === "compras" ? (order.setor_status || "entrada") : undefined;
                            const details = getSpecialSupplyDetails(order.processos, item.id, effectiveComprasStatus);
                            const isSent = details.sent;
                            const formattedTime = formatSafeDate(details.sentAt, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
                            const op = details.operator || order.operador || null;
                            const style = getSpecialSupplyBadgeClasses(item.id, isSent, details.comprasStatus);
                            const labelText = details.displayLabel || item.label;

                            const titleText = isComprasItem
                              ? style.statusColor === "verde"
                                ? `${labelText}: Concluído em Compras (${details.statusLabel})${formattedTime ? ` em ${formattedTime}` : ""}${op ? ` por ${op}` : ""}`
                                : style.statusColor === "amarelo"
                                ? `${labelText}: Material em fase de Pedido no setor de Compras`
                                : `${labelText}: Material em fase de ${details.statusLabel} no setor de Compras`
                              : isSent
                              ? `${labelText}: ENVIADO ${formattedTime ? `em ${formattedTime}` : ""}${op ? ` por ${op}` : ""} (Clique para alterar para pendente)`
                              : `${labelText}: PENDENTE (Clique para marcar como enviado)`;

                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  const updated = toggleSpecialSupplySent(order.processos, item.id, order.operador);
                                  onUpdate(order.id, { processos: updated });
                                  if (!isSent) {
                                    toast.success(`${labelText} marcado como ${isComprasItem ? "CONCLUÍDO" : "ENVIADO"}! Registrado com data e hora.`);
                                  } else {
                                    toast.info(`${labelText} alterado para ${isComprasItem ? "PENDENTE EM COMPRAS" : "PENDENTE"}.`);
                                  }
                                }}
                                title={titleText}
                                className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all flex items-center gap-1.5 shadow-xs border cursor-pointer ${style.badge}`}
                              >
                                <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                                <span>{labelText}</span>
                                {style.statusColor === "verde" ? (
                                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                                ) : (
                                  <span className="text-[10px]">⏳</span>
                                )}
                                <span className="text-[10px] font-mono-tech ml-1 opacity-90">
                                  ({details.statusLabel})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {/* Detalhes de rastreabilidade com data e hora */}
                        <div className="space-y-1 pt-1">
                          {SPECIAL_SUPPLIES.filter((s) => isSpecialSupplyActive(order.processos, s.id)).map((item) => {
                            const details = getSpecialSupplyDetails(order.processos, item.id);
                            const style = getSpecialSupplyBadgeClasses(item.id, details.sent, details.comprasStatus);
                            const isComprasItem = item.id === "PANTONE" || item.id === "OUTROS";
                            const formattedTime = formatSafeDate(details.sentAt, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })
                              || formatSafeDate(order.updated_at, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                              || "Registrado";

                            const dotColor =
                              style.statusColor === "verde"
                                ? "bg-emerald-500 shadow-[0_0_6px_#10b981]"
                                : style.statusColor === "amarelo"
                                ? "bg-amber-500 shadow-[0_0_6px_#f59e0b]"
                                : "bg-fuchsia-500 shadow-[0_0_6px_#d946ef]";

                            const textColor =
                              style.statusColor === "verde"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : style.statusColor === "amarelo"
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-fuchsia-700 dark:text-fuchsia-400";

                            return (
                              <p key={`info-${item.id}`} className={`text-[11px] font-mono-tech flex items-center gap-1.5 flex-wrap ${textColor}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                <strong className="font-bold">{item.label}:</strong>
                                {isComprasItem ? (
                                  <span>
                                    Setor de Compras: <u>{details.statusLabel}</u>
                                    {details.sent && details.operator && <span> — por {details.operator}</span>}
                                  </span>
                                ) : details.sent ? (
                                  <>
                                    Aprovado/Enviado em {formattedTime}
                                    {details.operator && <span>por <u>{details.operator}</u></span>}
                                  </>
                                ) : (
                                  <span>Pendente de envio</span>
                                )}
                                {details.customText && (
                                  <span className="text-foreground/90 font-sans font-medium text-xs ml-1">
                                    — {details.customText}
                                  </span>
                                )}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {order.processos && order.processos.length > 0 && sortAndFilterProcessos(order.processos).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/50">
                        {sortAndFilterProcessos(order.processos).map((p) => (
                          <span
                            key={p}
                            className={`text-xs font-bold px-2 py-0.5 rounded-lg border shadow-xs ${getProcessoCor(
                              p
                            )}`}
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                    {!SPECIAL_SUPPLIES.some((s) => isSpecialSupplyActive(order.processos, s.id)) && (!order.processos || sortAndFilterProcessos(order.processos).length === 0) && (
                      <p className="text-xs text-muted-foreground italic">Nenhum processo ou suprimento especial informado.</p>
                    )}
                  </div>
                </div>

                {/* ─── COLUNA 2: LOGÍSTICA & AUDITORIA ─── */}
                <div className="space-y-3">
                  {/* Bloco de Logística & Entrega */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-muted/40 dark:bg-[#253745]/25 backdrop-blur-md space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <Truck className="h-3.5 w-3.5 text-primary" />
                      <span>Expedição & Logística</span>
                    </div>
                    {order.tipo_entrega && order.tipo_entrega.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {order.tipo_entrega.map((t) => (
                          <Badge
                            key={t}
                            variant="secondary"
                            className="bg-primary/20 text-primary border-primary/40 text-[11px] font-bold"
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {order.empresa_entrega && (
                      <p className="text-xs text-muted-foreground">
                        Da: <strong className="text-foreground">{order.empresa_entrega}</strong>
                      </p>
                    )}
                    {order.destinatario && (
                      <p className="text-xs text-muted-foreground">
                        A/C: <strong className="text-foreground">{order.destinatario}</strong>
                      </p>
                    )}
                    {order.endereco_entrega && (
                      <p className="text-xs text-muted-foreground">
                        Endereço: <strong className="text-foreground">{order.endereco_entrega}</strong>
                      </p>
                    )}
                  </div>

                  {/* Bloco de Auditoria */}
                  <div className="p-3 rounded-xl border border-border/80 bg-muted/40 space-y-1 font-mono-tech text-[11px] text-muted-foreground">
                    {createdByName && (
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-[#9BA8AB]" />
                        <span>
                          Criado por <strong className="text-foreground">{createdByName}</strong> em{" "}
                          {format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    )}
                    {updatedByName && (
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        <span>
                          Atualizado por <strong className="text-foreground">{updatedByName}</strong> em{" "}
                          {format(new Date(order.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bloco de Atribuição de Operador (SELECIONAR O USUARIO QUE VAI TRABALHAR NA O.S) */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-muted/40 dark:bg-[#253745]/25 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                          <HardHat className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                            Operador da O.S.
                          </p>
                          <p className="text-xs font-semibold text-foreground">
                            {order.operador ? order.operador : "Nenhum operador selecionado"}
                          </p>
                        </div>
                      </div>
                      {order.operador && (
                        <Badge variant="outline" className="text-[10px] bg-[#253745] text-[#CCD0CF] border-[#4A5C6A]/60">
                          Atribuído
                        </Badge>
                      )}
                    </div>

                    <div className="pt-1">
                      <Select
                        value={order.operador || "__none__"}
                        onValueChange={(val) => handleAssignOperador(val === "__none__" ? null : val)}
                      >
                        <SelectTrigger className="h-9 text-xs bg-background/90 border-border/80 shadow-xs">
                          <SelectValue placeholder="Selecionar operador para trabalhar na O.S..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          <SelectItem value="__none__" className="text-muted-foreground italic text-xs">
                            — Nenhum operador (Aguardando) —
                          </SelectItem>
                          {operadoresList.map((op) => (
                            <SelectItem key={op.id} value={op.nome} className="text-xs font-medium">
                              {op.nome} {op.setor_vinculado ? `(${op.setor_vinculado})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* ─── SEÇÃO DE ANEXOS DO SHAREPOINT (VISUALIZAÇÃO COMPLETA) ─── */}
                <div className="col-span-1 md:col-span-2 pt-2">
                  <div className="p-4 rounded-xl border border-border/80 bg-muted/40 dark:bg-[#253745]/25 backdrop-blur-md">
                    <OrderAttachmentsSection
                      orderId={order.id}
                      orderTitulo={order.titulo}
                      readOnly={permissions.isViewOnly}
                      canDelete={permissions.canDelete || permissions.canEditCard}
                    />
                  </div>
                </div>

                {/* ─── SEÇÃO DE HISTÓRICO DE E-MAILS DO OUTLOOK ─── */}
                <div className="col-span-1 md:col-span-2 pt-2">
                  <div className="p-4 rounded-xl border border-border/80 bg-muted/40 dark:bg-[#253745]/25 backdrop-blur-md">
                    <OrderEmailEventsSection
                      orderId={order.id}
                      orderTitulo={order.titulo}
                      orderStatus={order.status}
                      vendedorNome={order.vendedor}
                    />
                  </div>
                </div>
              </div>

              {/* Rodapé Fixo de Ações */}
              <div className="px-6 py-3.5 border-t border-border/80 bg-card/90 dark:border-[#4A5C6A]/35 dark:bg-[#11212D]/90 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  {permissions.canSendToProduction && onSendToProduction && (
                    <Button
                      size="sm"
                      onClick={() => setSendDialogOpen(true)}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl h-9 px-4 gap-1.5 shadow-sm"
                    >
                      <Send className="h-3.5 w-3.5" /> {isLastStatus ? "Enviar → Produção" : "Mover de Setor"}
                    </Button>
                  )}
                  {order.status === "aguardando_prova" && !order.setor && onSendToExpedicao && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs text-foreground rounded-xl h-9 px-3 gap-1.5"
                      onClick={() => {
                        onSendToExpedicao(order.id);
                        onOpenChange(false);
                      }}
                    >
                      <Truck className="h-3.5 w-3.5" /> Enviar → Expedição
                    </Button>
                  )}
                </div>

                {!permissions.isViewOnly && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    {permissions.canEditCard && onDuplicate && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-foreground text-xs rounded-xl h-9 px-3 gap-1.5"
                        onClick={() => {
                          onDuplicate(order);
                          onOpenChange(false);
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" /> Duplicar
                      </Button>
                    )}
                    {permissions.canEditCard && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-foreground text-xs rounded-xl h-9 px-3"
                        onClick={() => {
                          onOpenChange(false);
                          setIsEditDialogOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                    )}
                    {permissions.canArchive && onArchive && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-foreground text-xs rounded-xl h-9 px-3 gap-1.5"
                        onClick={() => {
                          onArchive(order.id);
                          onOpenChange(false);
                        }}
                      >
                        <Archive className="h-3.5 w-3.5" /> Arquivar
                      </Button>
                    )}
                    {permissions.canDelete && onDelete && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs rounded-xl h-9 px-3"
                        onClick={() => {
                          onDelete(order.id);
                          onOpenChange(false);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Edição no Fluxo Idêntico de Criação em 3 Etapas */}
      <CreateOrderDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        orderToEdit={order}
        onUpdate={onUpdate}
      />

      {/* Send to Production Dialog */}
      <Dialog
        open={sendDialogOpen}
        onOpenChange={(open) => {
          setSendDialogOpen(open);
          if (!open) {
            setSelectedDepts([]);
            setCurrentDept("");
            setCurrentMachine("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar para qual(is) setor(es)?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedDepts.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Setores selecionados</Label>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDepts.map((sd, idx) => (
                    <Badge key={idx} variant="default" className="gap-1 pr-1">
                      {DEPARTMENTS.find((d) => d.id === sd.department)?.label}
                      {sd.machine &&
                        ` (${
                          DEPARTMENTS.find((d) => d.id === sd.department)?.statuses.find((s) => s.id === sd.machine)
                            ?.label || sd.machine
                        })`}
                      <button
                        className="ml-1 rounded-full hover:bg-white/20 p-0.5"
                        onClick={() => setSelectedDepts((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Adicionar setor</Label>
              <Select
                value={currentDept}
                onValueChange={(v) => {
                  setCurrentDept(v as Department);
                  setCurrentMachine("");
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o setor" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.filter((d) => !selectedDepts.some((sd) => sd.department === d.id)).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {currentDept && DEPARTMENTS.find((d) => d.id === currentDept)?.machines && (
              <div>
                <Label>Máquina</Label>
                <Select value={currentMachine} onValueChange={setCurrentMachine}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione a máquina" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.find((d) => d.id === currentDept)!.machines!.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {currentDept && (
              <Button
                variant="outline"
                className="w-full"
                disabled={!!DEPARTMENTS.find((d) => d.id === currentDept)?.machines && !currentMachine}
                onClick={() => {
                  setSelectedDepts((prev) => [
                    ...prev,
                    { department: currentDept as Department, machine: currentMachine || undefined },
                  ]);
                  setCurrentDept("");
                  setCurrentMachine("");
                }}
              >
                + Adicionar Setor
              </Button>
            )}
            <Button
              className="w-full"
              disabled={selectedDepts.length === 0}
              onClick={() => {
                if (onSendToMultipleProduction) {
                  onSendToMultipleProduction(order.id, selectedDepts);
                } else if (onSendToProduction && selectedDepts.length > 0) {
                  onSendToProduction(order.id, selectedDepts[0].department, selectedDepts[0].machine);
                }
                setSendDialogOpen(false);
                onOpenChange(false);
                setSelectedDepts([]);
                setCurrentDept("");
                setCurrentMachine("");
              }}
            >
              <Send className="h-4 w-4 mr-2" /> Confirmar Envio{" "}
              {selectedDepts.length > 1 && `(${selectedDepts.length} setores)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
