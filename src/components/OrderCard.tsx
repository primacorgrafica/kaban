import { getOrderRevision, cleanObservationRevision } from "@/lib/orderRevision";
import { useState, useEffect, memo } from "react";
import { Order, OrderStatus, STATUS_CONFIG, STATUS_ORDER } from "@/types/order";
import { DEPARTMENTS, Department } from "@/types/production";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RotateCcw, ShoppingBag, Calendar, User, FileText, Archive, Trash2, GripVertical, UserCheck, Clock, AlertTriangle, Send, Truck, Briefcase, Copy, Edit2, MessageSquarePlus, Repeat, Sparkles, Check, Zap, Mail, HardHat } from "lucide-react";
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
import { OrderAttachmentsSection } from "./sharepoint/OrderAttachmentsSection";
import { OrderEmailEventsSection } from "./email/OrderEmailEventsSection";
import { CreateOrderDialog } from "./CreateOrderDialog";

// sortAndFilterProcessos importado diretamente de @/lib/processos

interface Permissions {
  canEditCard: boolean;
  canAdvanceCards: boolean;
  canPauseCards?: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canSendToProduction: boolean;
  isViewOnly: boolean;
}

interface OrderCardProps {
  order: Order;
  onUpdate: (id: string, data: Partial<Order>) => void;
  onMove: (id: string, status: OrderStatus) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (order: Order) => void;
  onSendToProduction?: (id: string, department: Department, machine?: string) => void;
  onSendToMultipleProduction?: (id: string, departments: { department: Department; machine?: string }[]) => void;
  onSendToExpedicao?: (id: string) => void;
  onSendToCompras?: (id: string, processos?: string[]) => void;
  dragHandleProps?: Record<string, unknown>;
  updatedByName?: string | null;
  createdByName?: string | null;
  permissions: Permissions;
  departmentContext?: string;
  isSlowAlert?: boolean;
}

interface DeadlineStatus {
  isNearDeadline: boolean;
  isExpired: boolean;
  remainingText: string | null;
  diffMinutes: number;
}

function useDeadlineAlert(prazo: string | null): DeadlineStatus {
  const [status, setStatus] = useState<DeadlineStatus>({
    isNearDeadline: false,
    isExpired: false,
    remainingText: null,
    diffMinutes: 0,
  });

  useEffect(() => {
    if (!prazo) {
      setStatus({ isNearDeadline: false, isExpired: false, remainingText: null, diffMinutes: 0 });
      return;
    }
    const check = () => {
      const now = Date.now();
      const deadline = new Date(prazo).getTime();
      if (isNaN(deadline)) {
        setStatus({ isNearDeadline: false, isExpired: false, remainingText: null, diffMinutes: 0 });
        return;
      }
      const diffMs = deadline - now;
      const diffMinutes = Math.round(diffMs / 60000);
      const isExpired = diffMs <= 0;
      // Near deadline if within 30 minutes or expired
      const isNearDeadline = diffMs <= 30 * 60 * 1000;

      let remainingText = "";
      if (isExpired) {
        const absMinutes = Math.abs(diffMinutes);
        if (absMinutes < 60) {
          remainingText = `Atrasado há ${absMinutes}m`;
        } else {
          const h = Math.floor(absMinutes / 60);
          const m = absMinutes % 60;
          remainingText = m > 0 ? `Atrasado há ${h}h ${m}m` : `Atrasado há ${h}h`;
        }
      } else {
        if (diffMinutes < 60) {
          remainingText = `${diffMinutes}m rest.`;
        } else {
          const h = Math.floor(diffMinutes / 60);
          const m = diffMinutes % 60;
          const d = Math.floor(h / 24);
          if (d > 0) {
            const remH = h % 24;
            remainingText = remH > 0 ? `${d}d ${remH}h rest.` : `${d}d rest.`;
          } else {
            remainingText = m > 0 ? `${h}h ${m}m rest.` : `${h}h rest.`;
          }
        }
      }

      setStatus({
        isNearDeadline,
        isExpired,
        remainingText,
        diffMinutes,
      });
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, [prazo]);

  return status;
}

// Determine which sections to show based on department context
function getVisibleSections(departmentContext?: string): { general: boolean; prova: boolean; processos: boolean; entrega: boolean } {
  if (!departmentContext) return { general: true, prova: true, processos: true, entrega: true };
  switch (departmentContext) {
    case "comercial": return { general: true, prova: false, processos: false, entrega: false };
    case "pre_impressao": return { general: true, prova: true, processos: false, entrega: false };
    case "producao": return { general: true, prova: false, processos: true, entrega: false };
    case "expedicao": return { general: true, prova: false, processos: false, entrega: true };
    default: return { general: true, prova: true, processos: true, entrega: true };
  }
}

function OrderCardImpl({ order, onUpdate, onMove, onArchive, onDelete, onDuplicate, onSendToProduction, onSendToMultipleProduction, onSendToExpedicao, onSendToCompras, dragHandleProps, updatedByName, createdByName, permissions, departmentContext, isSlowAlert }: OrderCardProps) {
  const currentRevision = getOrderRevision(order);
  const cleanObs = cleanObservationRevision(order.observacao);
  const [open, setOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
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
    processos: order.processos || [] as string[],
    tipo_documento: ((order.nf ? "NF" : order.protocolo ? "PROTOCOLO" : "") as "NF" | "PROTOCOLO" | ""),
    valor_documento: order.nf || order.protocolo || "",
    empresa_entrega: order.empresa_entrega || "",
    obs_entrega: order.obs_entrega || "",
    tipo_entrega: order.tipo_entrega || [] as string[],
    entrega_para: order.entrega_para || "",
    entrega_endereco: order.entrega_endereco || "",
    entrega_ac: order.entrega_ac || "",
    entrega_data_limite: order.entrega_data_limite ? order.entrega_data_limite.slice(0, 16) : "",
  });
  const [vendedoresList, setVendedoresList] = useState<{ id: string; nome: string }[]>([]);
  const [operadoresList, setOperadoresList] = useState<{ id: string; user_id?: string; nome: string; setor_vinculado?: string | null }[]>([]);

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
        processos: order.processos || [] as string[],
        tipo_documento: ((order.nf ? "NF" : order.protocolo ? "PROTOCOLO" : "") as "NF" | "PROTOCOLO" | ""),
        valor_documento: order.nf || order.protocolo || "",
        empresa_entrega: order.empresa_entrega || "",
        obs_entrega: order.obs_entrega || "",
        tipo_entrega: order.tipo_entrega || [] as string[],
        entrega_para: order.entrega_para || "",
        entrega_endereco: order.entrega_endereco || "",
        entrega_ac: order.entrega_ac || "",
        entrega_data_limite: order.entrega_data_limite ? order.entrega_data_limite.slice(0, 16) : "",
      });
      setEditing(false);
    }
  }, [order]);

  const config = STATUS_CONFIG[order.status];
  const statusIdx = STATUS_ORDER.indexOf(order.status);
  const isLastStatus = order.status === "arquivo_liberado";
  const { isNearDeadline, isExpired, remainingText } = useDeadlineAlert(order.prazo);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState<{ department: Department; machine?: string }[]>([]);
  const [currentDept, setCurrentDept] = useState<Department | "">("");
  const [currentMachine, setCurrentMachine] = useState("");

  // Estado para diálogo rápido de motivo da parada (coluna Preparação)
  const [motivoDialogOpen, setMotivoDialogOpen] = useState(false);
  const [motivoTexto, setMotivoTexto] = useState(order.observacao || "");

  useEffect(() => {
    setMotivoTexto(order.observacao || "");
  }, [order.observacao]);

  const handleSaveMotivo = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onUpdate(order.id, { observacao: motivoTexto });
    setMotivoDialogOpen(false);
    toast.success("Motivo da parada atualizado!");
  };

  useEffect(() => {
    if (editing) {
      supabase.from("vendedores").select("id, nome").order("nome").then(({ data }) => {
        if (data) setVendedoresList(data);
      });
    }
  }, [editing]);

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
      endereco_entrega: editData.prova_digital ? (editData.endereco_entrega || null) : null,
      destinatario: editData.prova_digital ? (editData.destinatario || null) : null,
      entregue_para: editData.prova_digital ? (editData.entregue_para || null) : null,
      entregue_por: editData.prova_digital ? (editData.entregue_por || null) : null,
      entregue_em: editData.prova_digital ? (editData.entregue_em || null) : null,
      urgente: editData.urgente_prova || editData.urgente_impressao || editData.urgente_acabamento || editData.urgente_expedicao,
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
      nf: editData.tipo_documento === "NF" ? (editData.valor_documento || null) : null,
      protocolo: editData.tipo_documento === "PROTOCOLO" ? (editData.valor_documento || null) : null,
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

  const isUrgent = order.urgente;
  const isUrgentProva = order.urgente_prova;
  const isUrgentImpressao = order.urgente_impressao;
  const isUrgentAcabamento = order.urgente_acabamento;
  const isUrgentExpedicao = order.urgente_expedicao;
  const isArquivoLiberado = order.status === "arquivo_liberado";
  const shouldBlinkCard = isNearDeadline && !isUrgent;
  const shouldBlinkUrgentBanner = isUrgent && !isArquivoLiberado;

  const hasEntregaInfo = order.nf || order.protocolo || order.empresa_entrega || order.obs_entrega || (order.tipo_entrega && order.tipo_entrega.length > 0) || order.entrega_para || order.entrega_endereco || order.entrega_ac || order.entrega_data_limite;

  return (
    <>
      <div
        className={`group rounded-2xl border shadow-xs hover:shadow-lg transition-all duration-200 overflow-hidden relative backdrop-blur-xl ${
          shouldBlinkCard ? "animate-pulse" : ""
        } ${
          isUrgent
            ? "bg-card/85 dark:bg-[#11212D]/85 border-rose-400/60 dark:border-rose-500/40 hover:border-rose-500 text-card-foreground border-l-[4px] border-l-rose-500 shadow-rose-500/5 dark:shadow-[0_8px_32px_rgba(6,20,27,0.5)]"
            : isSlowAlert
            ? "bg-card/85 dark:bg-[#11212D]/85 border-amber-400/60 dark:border-amber-500/40 hover:border-amber-500 text-card-foreground border-l-[4px] border-l-amber-500 shadow-amber-500/5 dark:shadow-[0_8px_32px_rgba(6,20,27,0.5)]"
            : isNearDeadline
            ? "bg-card/85 dark:bg-[#11212D]/85 border-amber-400/60 dark:border-amber-500/40 hover:border-amber-500 text-card-foreground border-l-[4px] border-l-amber-500 shadow-amber-500/5 dark:shadow-[0_8px_32px_rgba(6,20,27,0.5)]"
            : "bg-card/85 dark:bg-[#11212D]/85 border-border/80 dark:border-[#4A5C6A]/35 text-card-foreground hover:border-[#9BA8AB]/60 hover:shadow-lg dark:hover:shadow-[0_12px_36px_rgba(6,20,27,0.65)] border-l-[4px] border-l-transparent hover:border-l-[#CCD0CF]"
        }`}
      >
        {/* Deadline alert ribbon if near deadline */}
        {isNearDeadline && !isUrgent && (
          <div className="px-3 py-1 bg-rose-500/15 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 border-b border-rose-500/20 text-[10px] font-bold tracking-wider uppercase flex items-center justify-between gap-1">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0 text-rose-500" />
              {isExpired ? "Atrasado" : "Prazo Próximo"}
            </span>
            {remainingText && (
              <span className="font-mono-tech font-bold text-[9px] bg-rose-500/20 dark:bg-rose-500/30 px-1.5 py-0.5 rounded">
                {remainingText}
              </span>
            )}
          </div>
        )}

        {/* Top Header Bar: NÚMERO O.S (Esquerda) + FLAGS (Centro/Direita) + DRAG HANDLE (Fixo à Direita) */}
        <div className="flex items-center justify-between gap-1 px-3 pt-2 pb-0.5 min-w-0">
          {/* Esquerda: NÚMERO DA O.S. + REV / REP */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="font-mono-tech text-[11.5px] font-bold px-1.5 py-0.5 rounded bg-[#253745] text-[#CCD0CF] border border-[#4A5C6A]/60 shrink-0 tracking-wide">
              #{order.titulo}
            </span>
            {currentRevision >= 2 && (
              <span
                className="font-mono-tech text-[10px] font-bold px-1 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 shrink-0 flex items-center gap-0.5 shadow-xs animate-pulse tracking-wide"
                title={`Revisão ${currentRevision} (Retornou para Preparação)`}
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>REV{currentRevision}</span>
              </span>
            )}
            {(order.tipo_trabalho === "repeticao" || order.os_anterior) && (
              <span
                className="font-mono-tech text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 flex items-center gap-0.5"
                title={order.os_anterior ? `Repetição da O.S. Anterior: ${order.os_anterior}` : "Repetição"}
              >
                <span>REP</span>
                {order.os_anterior && <span className="opacity-90">#{order.os_anterior}</span>}
              </span>
            )}
          </div>

          {/* Centro / Direita: FLAGS DE STATUS */}
          <div className="flex items-center gap-1 min-w-0 flex-1 justify-end overflow-hidden">
            {/* Urgent badge */}
            {isUrgent && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-xs shrink-0 ${
                  shouldBlinkUrgentBanner ? "animate-pulse" : ""
                }`}
              >
                <AlertTriangle className="h-2 w-2 shrink-0" />
                <span>Urgente</span>
                {isUrgentImpressao && <span className="opacity-80 text-[7.5px]">(Imp)</span>}
                {isUrgentAcabamento && <span className="opacity-80 text-[7.5px]">(Acab)</span>}
                {isUrgentExpedicao && <span className="opacity-80 text-[7.5px]">(Exp)</span>}
              </span>
            )}

            {/* Slow Alert standalone indicator */}
            {isSlowAlert && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0" title="Mais de 21 horas nesta etapa">
                <Clock className="h-2 w-2 text-amber-500 animate-pulse shrink-0" />
                <span>+21h</span>
              </span>
            )}

            {/* Digital sector banners: Color and PB */}
            {departmentContext === "producao" && (order as any).digital_color && (
              <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 shrink-0">
                Color
              </span>
            )}
            {departmentContext === "producao" && (order as any).digital_pb && (
              <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30 shrink-0">
                PB
              </span>
            )}

            {/* Expedição delivery types */}
            {departmentContext === "expedicao" && order.tipo_entrega && order.tipo_entrega.includes("CARRO") && (
              <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shrink-0">
                Carro
              </span>
            )}
            {departmentContext === "expedicao" && order.tipo_entrega && order.tipo_entrega.includes("MOTO") && (
              <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 shrink-0">
                Moto
              </span>
            )}
            {departmentContext === "expedicao" && order.tipo_entrega && order.tipo_entrega.includes("RETIRA") && (
              <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30 shrink-0">
                Retira
              </span>
            )}

            {/* Setor em Produção */}
            {order.setor && order.setor !== "desenvolvimento" && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 max-w-[100px] truncate shrink-0" title={`Em Produção — ${DEPARTMENTS.find(d => d.id === order.setor)?.label || order.setor}`}>
                Em Prod: {DEPARTMENTS.find(d => d.id === order.setor)?.label || order.setor}
              </span>
            )}

            {/* Sub-ordem */}
            {order.parent_order_id && (
              <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/25 shrink-0">
                Sub
              </span>
            )}
          </div>

          {/* Drag Handle: FIXO, COMPACTO E VISÍVEL */}
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="p-1 -mr-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing transition-colors shrink-0 flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
              title="Clique e arraste para mover o cartão"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          )}
        </div>

        <div className="px-3 pb-2.5 cursor-pointer space-y-1" onClick={() => setOpen(true)}>
          {/* Linha 1 & 2: Grid perfeitamente alinhado e compacto - Coluna Esquerda (Cliente / Serviço) e Coluna Direita (Vendedor / Operador) */}
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-0.5 mt-0.5 min-w-0">
            {/* Coluna 1, Linha 1: CLIENTE */}
            <span className="text-[12.5px] font-bold text-foreground truncate uppercase min-w-0 leading-tight" title={order.cliente}>
              {order.cliente}
            </span>

            {/* Coluna 2, Linha 1: VENDEDOR */}
            <div className="flex justify-end min-w-0">
              {order.vendedor ? (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#CCD0CF] bg-[#253745]/70 border border-[#4A5C6A]/50 px-1.5 py-0.5 rounded shadow-2xs w-[84px] truncate"
                  title={`Vendedor: ${order.vendedor}`}
                >
                  <User className="h-2.5 w-2.5 text-[#9BA8AB] shrink-0" />
                  <span className="truncate">{order.vendedor}</span>
                </span>
              ) : (
                order.operador ? <div className="w-[84px]" /> : null
              )}
            </div>

            {/* Coluna 1, Linha 2: SERVIÇO */}
            <div className="min-w-0">
              {order.descricao ? (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate leading-tight" title={order.descricao}>
                  <FileText className="h-2.5 w-2.5 inline shrink-0 opacity-80" />
                  <span className="truncate min-w-0">{order.descricao}</span>
                </div>
              ) : null}
            </div>

            {/* Coluna 2, Linha 2: OPERADOR */}
            <div className="flex justify-end min-w-0">
              {order.operador ? (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-200 dark:text-amber-300 bg-amber-950/30 border border-amber-500/40 px-1.5 py-0.5 rounded shadow-2xs w-[84px] truncate"
                  title={`Operador responsável: ${order.operador}`}
                >
                  <HardHat className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                  <span className="truncate">{order.operador}</span>
                </span>
              ) : (
                order.vendedor ? <div className="w-[84px]" /> : null
              )}
            </div>
          </div>

          {/* Linha 3: PROVA DIGITAL OU EMAIL OU SAÍDA DIRETA */}
          {(order.saida_direta || order.prova_digital || order.prova_email) && (
            <div className="flex items-center gap-1 pt-0.5 flex-wrap min-w-0">
              {order.saida_direta && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-400 text-amber-950 border border-amber-500/30 shadow-2xs">
                  <Zap className="h-2 w-2 shrink-0" />
                  <span>Saída Direta</span>
                </span>
              )}
              {order.prova_digital && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#253745] text-[#CCD0CF] border border-[#4A5C6A]/60">
                  <span>Prova Digital</span>
                </span>
              )}
              {order.prova_email && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-pink-500/15 text-pink-700 dark:text-pink-300 border border-pink-500/30">
                  <span>Prova E-mail</span>
                </span>
              )}
              {order.prova_digital && order.endereco_entrega && (
                <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[170px]" title={order.endereco_entrega}>
                  ({order.endereco_entrega})
                </span>
              )}
            </div>
          )}

          {/* Linha 4: MATERIAIS & SUPRIMENTOS (PANTONE, FACA, CLICHÊ, OUTROS e Processos) */}
          {SPECIAL_SUPPLIES.some((s) => isSpecialSupplyActive(order.processos, s.id)) && (
            <div
              className="flex items-center gap-1 pt-0.5 flex-wrap"
              onClick={(e) => e.stopPropagation()}
            >
              {SPECIAL_SUPPLIES.filter((s) => isSpecialSupplyActive(order.processos, s.id)).map((item) => {
                const isComprasItem = item.id === "PANTONE" || item.id === "OUTROS";
                const effectiveComprasStatus =
                  order.setor === "compras" ? (order.setor_status || "entrada") : undefined;
                const details = getSpecialSupplyDetails(order.processos, item.id, effectiveComprasStatus);
                const isSent = details.sent;
                const formattedTime = formatSafeDate(details.sentAt, "dd/MM 'às' HH:mm", { locale: ptBR });
                const timeOnly = formatSafeDate(details.sentAt, "HH:mm");
                const op = details.operator || order.operador || updatedByName || null;
                const labelText = details.displayLabel || item.label;
                const style = getSpecialSupplyBadgeClasses(item.id, isSent, details.comprasStatus);

                const tooltip = isComprasItem
                  ? style.statusColor === "verde"
                    ? `${labelText}: Concluído em Compras (${details.statusLabel})${formattedTime ? ` em ${formattedTime}` : ""}${op ? ` por ${op}` : ""}`
                    : style.statusColor === "amarelo"
                    ? `${labelText}: Material em fase de Pedido em Compras`
                    : `${labelText}: Material em fase de ${details.statusLabel} em Compras`
                  : isSent
                  ? `${labelText}: ENVIADO ${formattedTime ? `em ${formattedTime}` : ""}${op ? ` por ${op}` : ""} (Clique para alterar para pendente)`
                  : `${labelText}: PENDENTE (Clique para marcar como enviado)`;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const operatorToSave = order.operador || updatedByName || undefined;
                      const updated = toggleSpecialSupplySent(order.processos, item.id, operatorToSave);
                      onUpdate(order.id, { processos: updated });
                      if (!isSent) {
                        toast.success(`${labelText} marcado como ${isComprasItem ? "CONCLUÍDO" : "ENVIADO"}! Registrado no sistema.`);
                      } else {
                        toast.info(`${labelText} alterado para ${isComprasItem ? "PENDENTE EM COMPRAS" : "PENDENTE"}.`);
                      }
                    }}
                    title={tooltip}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-tight uppercase transition-all flex items-center gap-1 shadow-2xs cursor-pointer border ${style.badge}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                    <span>{labelText}</span>
                    {style.statusColor === "verde" ? (
                      <>
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                        {timeOnly && (
                          <span className="text-[8px] font-mono-tech opacity-90 tracking-tight bg-black/20 px-0.5 rounded">
                            {timeOnly}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[8px] font-mono-tech opacity-90 tracking-tight bg-black/20 px-0.5 rounded">
                        {details.statusLabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Processos badges adicionais (se houver, ex: DIG, PLO, CMYK) */}
          {order.processos && order.processos.length > 0 && sortAndFilterProcessos(order.processos).length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {sortAndFilterProcessos(order.processos).map((p) => (
                <span key={p} className={`text-[8.5px] font-bold px-1 py-0.2 rounded border ${getProcessoCor(p)}`}>{p}</span>
              ))}
            </div>
          )}

          {/* Linha 5: OBS (Observação Geral da O.S. e Obs de Prova) */}
          {cleanObs && !(order.status === "paralisado" || order.status === "aguardando_novo_arquivo") && (
            <div className="pt-0.5 text-[10.5px] text-muted-foreground min-w-0 leading-tight">
              <span className="font-bold text-foreground/80 text-[10px]">OBS: </span>
              <span className="italic line-clamp-2">{cleanObs}</span>
            </div>
          )}

          {order.obs_prova && (
            <p className="text-[10px] text-amber-700 dark:text-amber-400 line-clamp-2 italic leading-tight">📋 {order.obs_prova}</p>
          )}

          {/* Motivo da Parada (quando paralisado) */}
          {(order.status === "paralisado" || order.status === "aguardando_novo_arquivo") ? (
            order.observacao && order.observacao.trim() ? (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setMotivoTexto(order.observacao || "");
                  setMotivoDialogOpen(true);
                }}
                className="mt-1.5 p-2 rounded-xl border-2 border-amber-500/70 bg-amber-500/15 dark:bg-amber-950/45 hover:bg-amber-500/25 transition-all cursor-pointer shadow-xs space-y-0.5 group"
                title="Clique para editar o motivo da parada"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3 text-amber-500 animate-pulse shrink-0" />
                    Motivo da Parada
                  </span>
                  <span className="text-[9.5px] text-amber-700 dark:text-amber-300 font-semibold group-hover:underline flex items-center gap-0.5">
                    <Edit2 className="h-2 w-2" /> Editar
                  </span>
                </div>
                <p className="text-[11px] font-bold text-foreground break-words leading-snug">
                  {order.observacao}
                </p>
              </div>
            ) : (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setMotivoTexto("");
                  setMotivoDialogOpen(true);
                }}
                className="mt-1.5 p-2 rounded-xl border-2 border-dashed border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20 transition-all flex items-center justify-between gap-2 cursor-pointer shadow-xs"
                title="Clique para informar o motivo da parada desta OS"
              >
                <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500 animate-bounce shrink-0" />
                  Informar motivo da parada...
                </span>
                <Badge
                  variant="secondary"
                  className="text-[9px] px-1.5 py-0.2 bg-amber-500 text-slate-950 font-extrabold border-none"
                >
                  Comentar
                </Badge>
              </div>
            )
          ) : null}

          {/* Linha 6: Demais coisas que já tem (Prazo, Atualizado por) */}
          {order.prazo && (
            <div className="flex items-center justify-between gap-1 pt-1 mt-1 border-t border-border/40 text-[9.5px] font-semibold">
              <span className={`flex items-center gap-1 ${
                isExpired
                  ? "text-rose-600 dark:text-rose-400 font-bold"
                  : isNearDeadline
                  ? "text-amber-600 dark:text-amber-400 font-bold"
                  : "text-muted-foreground"
              }`}>
                <Clock className="h-2.5 w-2.5 shrink-0" />
                Prazo: {format(new Date(order.prazo), "dd/MM HH:mm", { locale: ptBR })}
              </span>
              {remainingText && (
                <span className={`px-1 py-0.2 rounded text-[8.5px] font-bold uppercase tracking-wider font-mono-tech shrink-0 ${
                  isExpired
                    ? "bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30 animate-pulse"
                    : isNearDeadline
                    ? "bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30 animate-pulse"
                    : "bg-muted text-foreground/80 border border-border"
                }`}>
                  {remainingText}
                </span>
              )}
            </div>
          )}

          {updatedByName && (
            <div className="flex items-center gap-1 pt-0.5 text-[9px] text-muted-foreground/60">
              <UserCheck className="h-2 w-2" />
              <span>{updatedByName}</span>
              <Clock className="h-2 w-2 ml-0.5" />
              <span>{format(new Date(order.updated_at), "dd/MM HH:mm", { locale: ptBR })}</span>
            </div>
          )}
        </div>

        {isLastStatus && (permissions.canSendToProduction || onSendToCompras) && (
          <div className="flex items-center gap-1.5 p-1.5 rounded-b-2xl bg-muted/40 border-t border-border/40">
            {permissions.canSendToProduction && onSendToProduction && (
              <button
                onClick={(e) => { e.stopPropagation(); setSendDialogOpen(true); }}
                className="flex-1 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#CCD0CF] dark:hover:bg-white dark:text-[#06141B] shadow-md font-mono-tech"
              >
                <Send className="h-3.5 w-3.5" /> Produção →
              </button>
            )}
            {onSendToCompras && (
              <button
                onClick={(e) => { e.stopPropagation(); onSendToCompras(order.id); }}
                className="py-2 px-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all rounded-xl border border-pink-500/50 bg-pink-500/15 hover:bg-pink-500/25 text-pink-600 dark:text-pink-300 shadow-sm"
                title="Criar ou sincronizar card em Compras"
              >
                <ShoppingBag className="h-3.5 w-3.5" /> Compras
              </button>
            )}
          </div>
        )}
      </div>

      {/* Detail / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] sm:max-w-4xl p-0 overflow-hidden border border-border bg-card text-card-foreground shadow-2xl backdrop-blur-2xl rounded-2xl flex flex-col max-h-[92vh]">
          {/* Header Fixo */}
          <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-border bg-muted/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-[#253745] border border-[#4A5C6A]/60 flex items-center justify-center text-[#CCD0CF] shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
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
                <p className="text-xs text-slate-300 font-medium truncate max-w-md mt-0.5 uppercase">
                  {order.cliente}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {order.prazo && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-muted/80 border border-border text-xs font-mono-tech text-foreground">
                  <Clock className="h-3.5 w-3.5 text-[#9BA8AB]" />
                  <span className={isExpired ? "text-rose-400 font-bold" : isNearDeadline ? "text-amber-400 font-bold" : ""}>
                    {format(new Date(order.prazo), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </span>
                  {remainingText && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      isExpired
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse"
                        : isNearDeadline
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "bg-[#253745] text-[#CCD0CF] border border-[#4A5C6A]/60"
                    }`}>
                      {remainingText}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══ VIEW MODE (DUAL COLUMN SPLIT, NO VERTICAL SCROLLBAR) ═══ */}
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

                  {/* Bloco Prova */}
                  {(order.prova_digital || order.prova_email || order.saida_direta) && (
                    <div className="p-3.5 rounded-xl border border-border/80 bg-muted/40 dark:bg-[#253745]/25 backdrop-blur-md space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <span className="w-2 h-2 rounded-full bg-[#CCD0CF] shadow-[0_0_8px_rgba(204,208,207,0.6)]" />
                          <span>Prova Técnica</span>
                        </div>
                        {order.urgente_prova && (
                          <div className="flex items-center gap-1.5">
                            <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 text-[10px] animate-pulse">
                              Prova Urgente
                            </Badge>
                            {remainingText && (
                              <Badge className={`text-[10px] font-mono-tech font-bold ${
                                isExpired ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40" : "bg-[#253745] text-[#CCD0CF] border-[#4A5C6A]/60"
                              }`}>
                                {remainingText}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {order.prova_email && <Badge className="bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/40 font-semibold text-xs">E-mail</Badge>}
                        {order.prova_digital && <Badge className="bg-[#253745] text-[#CCD0CF] border-[#4A5C6A]/60 font-semibold text-xs">Digital</Badge>}
                        {order.saida_direta && <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40 font-semibold text-xs">Saída Direta</Badge>}
                        {(order as any).digital_color && <Badge className="bg-[#253745] text-[#CCD0CF] border-[#4A5C6A]/60 font-semibold text-xs">Color</Badge>}
                        {(order as any).digital_pb && <Badge className="bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/40 font-semibold text-xs">PB</Badge>}
                      </div>
                      {order.prova_digital && order.destinatario && (
                        <p className="text-xs text-foreground"><span className="text-muted-foreground">A/C:</span> <strong className="text-foreground">{order.destinatario}</strong></p>
                      )}
                      {order.prova_digital && order.endereco_entrega && (
                        <p className="text-xs text-foreground"><span className="text-muted-foreground">Endereço:</span> <strong className="text-foreground">{order.endereco_entrega}</strong></p>
                      )}
                      {order.prova_digital && order.entregue_para && (
                        <p className="text-xs text-foreground"><span className="text-muted-foreground">Entregue para:</span> <strong className="text-foreground">{order.entregue_para}</strong></p>
                      )}
                      {order.prova_digital && order.entregue_em && (
                        <p className="text-xs text-foreground"><span className="text-muted-foreground">Em:</span> <strong className="text-foreground">{format(new Date(order.entregue_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</strong></p>
                      )}
                    </div>
                  )}

                  {/* Bloco Processos */}
                  {order.processos && order.processos.length > 0 && (
                    <div className="p-3.5 rounded-xl border border-border/80 bg-muted/40 dark:bg-[#253745]/25 backdrop-blur-md space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <span className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_#c084fc]" />
                          <span>Processos & Acabamentos</span>
                        </div>
                        {order.urgente_acabamento && (
                          <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 text-[10px] animate-pulse">
                            Urgente
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {sortAndFilterProcessos(order.processos).map((p) => (
                          <span key={p} className={`text-xs font-bold px-2 py-0.5 rounded border ${getProcessoCor(p)}`}>{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ─── COLUNA 2: LOGÍSTICA, DESPACHO & AUDITORIA ─── */}
                <div className="space-y-3">
                  {/* Bloco Expedição */}
                  {hasEntregaInfo && (
                    <div className="p-3.5 rounded-xl border border-border/80 bg-muted/40 dark:bg-[#253745]/25 backdrop-blur-md space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <Truck className="h-3.5 w-3.5 text-emerald-500" />
                          <span>Expedição & Logística</span>
                        </div>
                        {order.urgente_expedicao && (
                          <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 text-[10px] animate-pulse">
                            Urgente
                          </Badge>
                        )}
                      </div>
                      {order.tipo_entrega && order.tipo_entrega.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                          {order.tipo_entrega.map((t) => (
                            <Badge key={t} className={
                              t === "CARRO" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold" :
                              t === "MOTO" ? "bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold" :
                              "bg-slate-700/40 text-slate-300 border-slate-600 font-bold"
                            }>{t}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {order.nf && <p><span className="text-muted-foreground">NF:</span> <strong className="text-foreground">{order.nf}</strong></p>}
                        {order.protocolo && <p><span className="text-muted-foreground">Protocolo:</span> <strong className="text-foreground">{order.protocolo}</strong></p>}
                        {order.empresa_entrega && <p><span className="text-muted-foreground">Da:</span> <strong className="text-foreground">{order.empresa_entrega}</strong></p>}
                        {order.entrega_para && <p><span className="text-muted-foreground">Para:</span> <strong className="text-foreground">{order.entrega_para}</strong></p>}
                      </div>
                      {order.entrega_endereco && (
                        <p className="text-xs"><span className="text-muted-foreground">Endereço:</span> <span className="text-foreground">{order.entrega_endereco}</span></p>
                      )}
                      {order.entrega_ac && (
                        <p className="text-xs"><span className="text-muted-foreground">A/C:</span> <span className="text-foreground">{order.entrega_ac}</span></p>
                      )}
                      {order.entrega_data_limite && (
                        <p className="text-xs"><span className="text-muted-foreground">Data Entrega:</span> <strong className="text-primary font-mono-tech">{format(new Date(order.entrega_data_limite), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</strong></p>
                      )}
                      {order.obs_entrega && (
                        <p className="text-xs text-foreground bg-muted p-2 rounded-lg border border-border">{order.obs_entrega}</p>
                      )}
                    </div>
                  )}

                  {/* Bloco de Auditoria */}
                  <div className="p-3 rounded-xl border border-border/80 bg-muted/40 space-y-1 font-mono-tech text-[11px] text-muted-foreground">
                    {createdByName && (
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-[#9BA8AB]" />
                        <span>Criado por <strong className="text-foreground">{createdByName}</strong> em {format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                      </div>
                    )}
                    {updatedByName && (
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        <span>Atualizado por <strong className="text-foreground">{updatedByName}</strong> em {format(new Date(order.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
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

                {/* ─── SEÇÃO COMPLETA DE ANEXOS DO SHAREPOINT CORPORATIVO (2 COLUNAS) ─── */}
                <div className="col-span-1 md:col-span-2 pt-2 border-t border-border/60">
                  <OrderAttachmentsSection
                    orderId={order.id}
                    orderTitulo={order.titulo}
                    readOnly={permissions.isViewOnly}
                    canDelete={permissions.canDelete}
                  />
                </div>

                {/* ─── SEÇÃO DE HISTÓRICO DE E-MAILS DO OUTLOOK (2 COLUNAS) ─── */}
                <div className="col-span-1 md:col-span-2 pt-2 border-t border-border/60">
                  <OrderEmailEventsSection
                    orderId={order.id}
                    orderTitulo={order.titulo}
                    orderStatus={order.status}
                    vendedorNome={order.vendedor}
                  />
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
                      onClick={() => { onSendToExpedicao(order.id); setOpen(false); }}
                    >
                      <Truck className="h-3.5 w-3.5" /> Enviar → Expedição
                    </Button>
                  )}
                  {isLastStatus && onSendToCompras && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs text-pink-600 dark:text-pink-400 border-pink-500/40 hover:bg-pink-500/10 rounded-xl h-9 px-3 gap-1.5 shadow-sm font-semibold"
                      onClick={() => { onSendToCompras(order.id); }}
                    >
                      <ShoppingBag className="h-3.5 w-3.5" /> Enviar p/ Compras
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
                        onClick={() => { onDuplicate(order); setOpen(false); }}
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
                          setOpen(false);
                          setIsEditDialogOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                    )}
                    {permissions.canArchive && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-foreground text-xs rounded-xl h-9 px-3 gap-1.5"
                        onClick={() => { onArchive(order.id); setOpen(false); }}
                      >
                        <Archive className="h-3.5 w-3.5" /> Arquivar
                      </Button>
                    )}
                    {permissions.canDelete && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs rounded-xl h-9 px-3"
                        onClick={() => { onDelete(order.id); setOpen(false); }}
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
      <Dialog open={sendDialogOpen} onOpenChange={(open) => {
        setSendDialogOpen(open);
        if (!open) { setSelectedDepts([]); setCurrentDept(""); setCurrentMachine(""); }
      }}>
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
                      {DEPARTMENTS.find(d => d.id === sd.department)?.label}
                      {sd.machine && ` (${DEPARTMENTS.find(d => d.id === sd.department)?.statuses.find(s => s.id === sd.machine)?.label || sd.machine})`}
                      <button className="ml-1 rounded-full hover:bg-white/20 p-0.5" onClick={() => setSelectedDepts(prev => prev.filter((_, i) => i !== idx))}>✕</button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Adicionar setor</Label>
              <Select value={currentDept} onValueChange={(v) => { setCurrentDept(v as Department); setCurrentMachine(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.filter(d => !selectedDepts.some(sd => sd.department === d.id)).map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {currentDept && DEPARTMENTS.find(d => d.id === currentDept)?.machines && (
              <div>
                <Label>Máquina</Label>
                <Select value={currentMachine} onValueChange={setCurrentMachine}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a máquina" /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.find(d => d.id === currentDept)!.machines!.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {currentDept && (
              <Button
                variant="outline"
                className="w-full"
                disabled={!!DEPARTMENTS.find(d => d.id === currentDept)?.machines && !currentMachine}
                onClick={() => {
                  setSelectedDepts(prev => [...prev, { department: currentDept as Department, machine: currentMachine || undefined }]);
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
                setOpen(false);
                setSelectedDepts([]);
                setCurrentDept("");
                setCurrentMachine("");
              }}
            >
              <Send className="h-4 w-4 mr-2" /> Confirmar Envio {selectedDepts.length > 1 && `(${selectedDepts.length} setores)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Exclusivo para Comentar/Editar o Motivo da Parada em Preparação */}
      <Dialog open={motivoDialogOpen} onOpenChange={setMotivoDialogOpen}>
        <DialogContent
          className="max-w-md border border-amber-500/40 bg-card p-5 rounded-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Motivo da Parada — O.S #{order.titulo}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Cliente: <span className="font-semibold text-foreground">{order.cliente}</span>
            </p>
          </DialogHeader>
          <div className="space-y-3 mt-3">
            <Label className="text-xs font-semibold text-foreground">
              Por que esta O.S está parada em Preparação?
            </Label>
            <Textarea
              value={motivoTexto}
              onChange={(e) => setMotivoTexto(e.target.value)}
              placeholder="Descreva o motivo (ex: Aguardando novo arquivo do cliente, faca com problema de corte, cliente solicitou alteração de texto, arquivo sem sangria...)"
              className="min-h-[100px] text-xs resize-none"
              autoFocus
            />
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] text-muted-foreground font-medium block">Sugestões rápidas:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Aguardando novo arquivo do cliente",
                  "Aguardando aprovação de alteração",
                  "Faca / clichê incorreto",
                  "Arquivo corrompido ou sem sangria",
                  "Cliente solicitou pausa no trabalho",
                ].map((sugestao) => (
                  <Button
                    key={sugestao}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMotivoTexto(sugestao)}
                    className="text-[10px] h-6 px-2 rounded-lg bg-muted/40 hover:bg-muted text-foreground cursor-pointer"
                  >
                    {sugestao}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMotivoDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveMotivo}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold cursor-pointer"
            >
              Salvar Motivo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// PERFORMANCE: memo evita re-render em massa quando uma OS individual muda.
export const OrderCard = memo(OrderCardImpl, (prev, next) => {
  return (
    prev.order === next.order &&
    prev.updatedByName === next.updatedByName &&
    prev.createdByName === next.createdByName &&
    prev.isSlowAlert === next.isSlowAlert &&
    prev.departmentContext === next.departmentContext &&
    prev.permissions === next.permissions &&
    prev.onUpdate === next.onUpdate &&
    prev.onMove === next.onMove &&
    prev.onArchive === next.onArchive &&
    prev.onDelete === next.onDelete &&
    prev.onDuplicate === next.onDuplicate &&
    prev.onSendToProduction === next.onSendToProduction &&
    prev.onSendToMultipleProduction === next.onSendToMultipleProduction &&
    prev.onSendToExpedicao === next.onSendToExpedicao
  );
});

