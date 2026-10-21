import { getOrderRevision, cleanObservationRevision } from "@/lib/orderRevision";
import { useState, useEffect, memo } from "react";
import { Order, OrderStatus, STATUS_CONFIG, STATUS_ORDER } from "@/types/order";
import { DEPARTMENTS, Department } from "@/types/production";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RotateCcw, ShoppingBag, Calendar, User, FileText, Archive, Trash2, GripVertical, UserCheck, Clock, AlertTriangle, Send, Truck, Briefcase, Copy, Edit2, MessageSquarePlus, Repeat, Sparkles, Check } from "lucide-react";
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
  getSpecialSupplyCustomText,
  setSpecialSupplyCustomText,
  formatSafeDate,
} from "@/lib/processos";
import { OrderAttachmentsSection } from "./sharepoint/OrderAttachmentsSection";
import { OrderEmailEventsSection } from "./email/OrderEmailEventsSection";

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
        className={`group rounded-2xl border shadow-sm hover:shadow-xl transition-all duration-200 overflow-hidden relative ${
          shouldBlinkCard ? "animate-pulse" : ""
        } ${
          isUrgent
            ? "bg-rose-50 dark:bg-rose-950/25 border-rose-300 dark:border-rose-500/40 hover:border-rose-500/70 text-rose-950 dark:text-rose-100"
            : isSlowAlert
            ? "bg-amber-50 dark:bg-amber-950/25 border-amber-300 dark:border-amber-500/40 hover:border-amber-500/70 text-amber-950 dark:text-amber-100"
            : isNearDeadline
            ? "bg-amber-50 dark:bg-amber-950/25 border-amber-300 dark:border-amber-500/40 hover:border-amber-500/70 text-amber-950 dark:text-amber-100"
            : "bg-card dark:bg-slate-900/70 border-border dark:border-slate-800/80 text-card-foreground hover:border-cyan-500/50 hover:shadow-md dark:hover:shadow-[0_4px_20px_rgba(6,182,212,0.12)]"
        }`}
      >
        {isNearDeadline && !isUrgent && (
          <div className="bg-red-600 text-white text-[10px] font-bold text-center py-0.5 tracking-wide uppercase flex items-center justify-center gap-1">
            <Clock className="h-3 w-3" /> {isExpired ? "Atrasado" : "Prazo Próximo"}
            {remainingText && <span className="opacity-90 font-mono-tech">({remainingText})</span>}
          </div>
        )}
        {order.saida_direta && (
          <div className="px-2 py-0.5 bg-amber-400 text-amber-900 flex items-center relative">
            {isSlowAlert && <Clock className="h-4 w-4 animate-pulse absolute left-1.5" fill="#facc15" color="#000" strokeWidth={2} />}
            <div className="flex-1 text-center flex items-center justify-center gap-1">
              {isUrgentProva && !order.prova_digital && !order.prova_email && (
                <span className={`mr-1 inline-flex items-center gap-1 bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded shadow-2xs ${shouldBlinkUrgentBanner ? "animate-pulse" : ""}`}>
                  <span>URGENTE</span>
                  {remainingText && (
                    <span className="font-mono-tech font-bold text-[9px] bg-black/25 px-1 py-0.2 rounded">
                      {remainingText}
                    </span>
                  )}
                </span>
              )}
              <span className="text-[10px] font-bold uppercase tracking-wide">Saída Direta</span>
            </div>
          </div>
        )}
        {order.prova_digital && (
          <div className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/30 flex items-center relative">
            {isSlowAlert && <Clock className="h-4 w-4 animate-pulse absolute left-1.5" fill="#facc15" color="#000" strokeWidth={2} />}
            <div className="flex-1 text-center flex items-center justify-center gap-1">
              {isUrgentProva && (
                <span className={`mr-1 inline-flex items-center gap-1 bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded shadow-2xs ${shouldBlinkUrgentBanner ? "animate-pulse" : ""}`}>
                  <span>URGENTE</span>
                  {remainingText && (
                    <span className="font-mono-tech font-bold text-[9px] bg-black/25 px-1 py-0.2 rounded">
                      {remainingText}
                    </span>
                  )}
                </span>
              )}
              <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-300 uppercase tracking-wide">Prova Digital</span>
            </div>
          </div>
        )}
        {order.prova_email && (
          <div className="px-2 py-0.5 bg-pink-100 dark:bg-pink-900/30 flex items-center relative">
            {isSlowAlert && !order.prova_digital && <Clock className="h-4 w-4 animate-pulse absolute left-1.5" fill="#facc15" color="#000" strokeWidth={2} />}
            <div className="flex-1 text-center flex items-center justify-center gap-1">
              {isUrgentProva && !order.prova_digital && (
                <span className={`mr-1 inline-flex items-center gap-1 bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded shadow-2xs ${shouldBlinkUrgentBanner ? "animate-pulse" : ""}`}>
                  <span>URGENTE</span>
                  {remainingText && (
                    <span className="font-mono-tech font-bold text-[9px] bg-black/25 px-1 py-0.2 rounded">
                      {remainingText}
                    </span>
                  )}
                </span>
              )}
              <span className="text-[10px] font-semibold text-pink-700 dark:text-pink-300 uppercase tracking-wide">Prova E-mail</span>
            </div>
          </div>
        )}
        {/* Slow alert standalone: only when no prova/saida banner exists */}
        {isSlowAlert && !order.saida_direta && !order.prova_digital && !order.prova_email && (
          <div className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 flex items-center relative">
            <Clock className="h-4 w-4 animate-pulse absolute left-1.5" fill="#facc15" color="#000" strokeWidth={2} />
            <span className="flex-1 text-center text-[10px] font-bold text-yellow-700 dark:text-yellow-300 uppercase tracking-wide">+21h em etapa</span>
          </div>
        )}
        {/* Standalone URGENTE banner */}
        {isUrgent && !isUrgentProva && !order.saida_direta && !order.prova_digital && !order.prova_email && departmentContext !== "expedicao" && (
          <div className={`bg-red-500 text-white text-[10px] font-bold text-center py-0.5 tracking-wide uppercase flex items-center justify-center gap-1 ${shouldBlinkUrgentBanner ? "animate-pulse" : ""}`}>
            <AlertTriangle className="h-3 w-3" /> Urgente
            {isUrgentImpressao && <span className="ml-1 text-[8px] opacity-80">(Impressão)</span>}
            {isUrgentAcabamento && <span className="ml-1 text-[8px] opacity-80">(Acabamento)</span>}
            {isUrgentExpedicao && <span className="ml-1 text-[8px] opacity-80">(Expedição)</span>}
          </div>
        )}
        {/* Digital sector banners: Color and PB */}
        {departmentContext === "producao" && (order as any).digital_color && (
          <div className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-center">
            <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Color</span>
          </div>
        )}
        {departmentContext === "producao" && (order as any).digital_pb && (
          <div className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700/30 text-center">
            <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">PB</span>
          </div>
        )}
        {departmentContext === "expedicao" && order.tipo_entrega && order.tipo_entrega.includes("CARRO") && (
          <div className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-center">
            <span className="text-[10px] font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">Carro</span>
            {isUrgentExpedicao && (
              <span className={`ml-2 inline-block bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${shouldBlinkUrgentBanner ? "animate-pulse" : ""}`}>URGENTE</span>
            )}
          </div>
        )}
        {departmentContext === "expedicao" && order.tipo_entrega && order.tipo_entrega.includes("MOTO") && (
          <div className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-center">
            <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Moto</span>
            {isUrgentExpedicao && !order.tipo_entrega.includes("CARRO") && (
              <span className={`ml-2 inline-block bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${shouldBlinkUrgentBanner ? "animate-pulse" : ""}`}>URGENTE</span>
            )}
          </div>
        )}
        {departmentContext === "expedicao" && order.tipo_entrega && order.tipo_entrega.includes("RETIRA") && (
          <div className="px-2 py-0.5 bg-gray-200 dark:bg-gray-800/50 text-center">
            <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Retira</span>
            {isUrgentExpedicao && !order.tipo_entrega.includes("CARRO") && !order.tipo_entrega.includes("MOTO") && (
              <span className={`ml-2 inline-block bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${shouldBlinkUrgentBanner ? "animate-pulse" : ""}`}>URGENTE</span>
            )}
          </div>
        )}
        {/* Standalone URGENTE for expedicao when no tipo_entrega banners */}
        {departmentContext === "expedicao" && isUrgentExpedicao && (!order.tipo_entrega || (!order.tipo_entrega.includes("CARRO") && !order.tipo_entrega.includes("MOTO") && !order.tipo_entrega.includes("RETIRA"))) && (
          <div className={`bg-red-500 text-white text-[10px] font-bold text-center py-0.5 tracking-wide uppercase flex items-center justify-center gap-1 ${shouldBlinkUrgentBanner ? "animate-pulse" : ""}`}>
            <AlertTriangle className="h-3 w-3" /> Urgente
          </div>
        )}
        {order.setor && order.setor !== "desenvolvimento" && (
          <div className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-center">
            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
              Em Produção — {DEPARTMENTS.find(d => d.id === order.setor)?.label || order.setor}
              {order.setor_status && (() => {
                const dept = DEPARTMENTS.find(d => d.id === order.setor);
                const statusLabel = dept?.statuses.find(s => s.id === order.setor_status)?.label;
                return statusLabel ? ` › ${statusLabel}` : "";
              })()}
            </span>
          </div>
        )}
        {order.parent_order_id && (
          <div className="px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-center">
            <span className="text-[10px] font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wide">Sub-ordem</span>
          </div>
        )}
        {dragHandleProps && (
          <div {...dragHandleProps} className="flex items-center justify-center py-1 cursor-grab active:cursor-grabbing hover:bg-black/5 transition-colors" onClick={(e) => e.stopPropagation()}>
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
          </div>
        )}

        <div className="px-3.5 pb-3 cursor-pointer" onClick={() => setOpen(true)}>
          {/* Linha 1: Cliente (Primeiro em cima) */}
          <div className="flex items-start gap-1.5 min-w-0">
            {isUrgent && <span className="h-2 w-2 rounded-full shrink-0 bg-rose-500 shadow-[0_0_8px_#f43f5e] mt-1" />}
            <span className="text-sm font-bold text-foreground break-words leading-tight uppercase">
              {order.cliente}
            </span>
          </div>

          {/* Linha 2: O.S. + Badges (REV, REP) */}
          <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
            <span className="font-mono-tech text-[13px] font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 shrink-0 tracking-wide">
              #{order.titulo}
            </span>
            {currentRevision >= 2 && (
              <span
                className="font-mono-tech text-[13px] font-extrabold px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 shrink-0 flex items-center gap-1 shadow-xs animate-pulse tracking-wide"
                title={`Revisão ${currentRevision} (Retornou para Preparação)`}
              >
                <RotateCcw className="h-3 w-3" />
                <span>REV{currentRevision}</span>
              </span>
            )}
            {(order.tipo_trabalho === "repeticao" || order.os_anterior) && (
              <span
                className="font-mono-tech text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 flex items-center gap-1"
                title={order.os_anterior ? `Repetição da O.S. Anterior: ${order.os_anterior}` : "Repetição"}
              >
                <span>REP</span>
                {order.os_anterior && <span className="opacity-90">#{order.os_anterior}</span>}
              </span>
            )}
          </div>
          {/* Linha 2: Descrição (largura completa) */}
          {order.descricao && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground min-w-0">
              <FileText className="h-3 w-3 inline shrink-0" />
              <span className="truncate min-w-0">{order.descricao}</span>
            </div>
          )}

          {/* Linha 2.5: Observação (se houver e não estiver em paralisado) */}
          {cleanObs && !(order.status === "paralisado" || order.status === "aguardando_novo_arquivo") && (
            <p className="text-xs text-muted-foreground line-clamp-1 italic mt-1">
              {cleanObs}
            </p>
          )}

          {/* Linha 3: Vendedor (abaixo, alinhado à esquerda) */}
          {order.vendedor && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground min-w-0">
              <User className="h-3 w-3 text-muted-foreground/80 shrink-0" />
              <span className="truncate">{order.vendedor}</span>
            </div>
          )}

          {/* Linha 4: Operador (abaixo, alinhado à esquerda) */}
          {order.operador && (
            <div className="flex items-center mt-1">
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 dark:bg-cyan-950/40 border border-cyan-500/30 px-1.5 py-0.5 rounded-md shadow-2xs"
                title={`Operador responsável: ${order.operador}`}
              >
                <UserCheck className="h-3 w-3 text-cyan-500 shrink-0" />
                <span>{order.operador}</span>
              </span>
            </div>
          )}
          {order.prazo && (
            <div className="flex items-center justify-between gap-1.5 mt-1.5 pt-1 border-t border-border/40 text-[10px] font-semibold">
              <span className={`flex items-center gap-1 ${
                isExpired
                  ? "text-rose-600 dark:text-rose-400 font-bold"
                  : isNearDeadline
                  ? "text-amber-600 dark:text-amber-400 font-bold"
                  : "text-muted-foreground"
              }`}>
                <Clock className="h-3 w-3 shrink-0" />
                Prazo: {format(new Date(order.prazo), "dd/MM HH:mm", { locale: ptBR })}
              </span>
              {remainingText && (
                <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider font-mono-tech shrink-0 ${
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
          {(order.status === "paralisado" || order.status === "aguardando_novo_arquivo") ? (
            order.observacao && order.observacao.trim() ? (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setMotivoTexto(order.observacao || "");
                  setMotivoDialogOpen(true);
                }}
                className="mt-2 p-2.5 rounded-xl border-2 border-amber-500/70 bg-amber-500/15 dark:bg-amber-950/45 hover:bg-amber-500/25 transition-all cursor-pointer shadow-xs space-y-1 group"
                title="Clique para editar o motivo da parada"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 animate-pulse shrink-0" />
                    Motivo da Parada
                  </span>
                  <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold group-hover:underline flex items-center gap-0.5">
                    <Edit2 className="h-2.5 w-2.5" /> Editar
                  </span>
                </div>
                <p className="text-xs font-bold text-foreground break-words leading-snug">
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
                className="mt-2 p-2.5 rounded-xl border-2 border-dashed border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20 transition-all flex items-center justify-between gap-2 cursor-pointer shadow-xs"
                title="Clique para informar o motivo da parada desta OS"
              >
                <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 animate-bounce shrink-0" />
                  Informar motivo da parada...
                </span>
                <Badge
                  variant="secondary"
                  className="text-[10px] px-2 py-0.5 bg-amber-500 text-slate-950 font-extrabold border-none"
                >
                  Comentar
                </Badge>
              </div>
            )
          ) : null}
          {order.obs_prova && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 line-clamp-2 italic">📋 {order.obs_prova}</p>
          )}
          {order.prova_digital && order.endereco_entrega && (
            <p className="text-xs font-bold text-foreground mt-1 truncate">{order.endereco_entrega}</p>
          )}

          {/* Quadros Especiais: PANTONE - FACA - CLICHÊ (Sempre visíveis no card pronto na coluna) */}
          {SPECIAL_SUPPLIES.some((s) => isSpecialSupplyActive(order.processos, s.id)) && (
            <div
              className="flex items-center gap-1.5 mt-2 flex-wrap"
              onClick={(e) => e.stopPropagation()}
            >
              {SPECIAL_SUPPLIES.filter((s) => isSpecialSupplyActive(order.processos, s.id)).map((item) => {
                const details = getSpecialSupplyDetails(order.processos, item.id);
                const isSent = details.sent;
                const formattedTime = formatSafeDate(details.sentAt, "dd/MM 'às' HH:mm", { locale: ptBR });
                const timeOnly = formatSafeDate(details.sentAt, "HH:mm");
                const op = details.operator || order.operador || updatedByName || null;
                const labelText = details.displayLabel || item.label;
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
                        toast.success(`${labelText} marcado como ENVIADO! Registrado no sistema.`);
                      } else {
                        toast.info(`${labelText} alterado para PENDENTE.`);
                      }
                    }}
                    title={
                      isSent
                        ? `${labelText}: ENVIADO ${formattedTime ? `em ${formattedTime}` : ""}${op ? ` por ${op}` : ""} (Clique para alterar para pendente)`
                        : `${labelText}: PENDENTE (Clique para marcar como enviado)`
                    }
                    className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase transition-all flex items-center gap-1 shadow-xs cursor-pointer border ${
                      isSent
                        ? "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.35)] active:scale-95"
                        : "bg-amber-400 hover:bg-amber-500 text-amber-950 border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.25)] active:scale-95"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSent ? "bg-white" : "bg-amber-950"}`} />
                    <span>{labelText}</span>
                    {isSent ? (
                      <>
                        <Check className="h-3 w-3 stroke-[3]" />
                        {timeOnly && (
                          <span className="text-[9px] font-mono-tech opacity-90 tracking-tight bg-black/20 px-1 rounded">
                            {timeOnly}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[9px] opacity-75">⏳</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Processos badges adicionais (se houver, ex: DIG, PLO, CMYK) */}
          {order.processos && order.processos.length > 0 && sortAndFilterProcessos(order.processos).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {sortAndFilterProcessos(order.processos).map((p) => (
                <span key={p} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getProcessoCor(p)}`}>{p}</span>
              ))}
            </div>
          )}



          {updatedByName && (
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/60">
              <UserCheck className="h-2.5 w-2.5" />
              <span>{updatedByName}</span>
              <Clock className="h-2.5 w-2.5 ml-1" />
              <span>{format(new Date(order.updated_at), "dd/MM HH:mm", { locale: ptBR })}</span>
            </div>
          )}
        </div>

        {isLastStatus && (permissions.canSendToProduction || onSendToCompras) && (
          <div className="flex items-center gap-1.5 p-1.5 rounded-b-2xl bg-muted/40 border-t border-border/40">
            {permissions.canSendToProduction && onSendToProduction && (
              <button
                onClick={(e) => { e.stopPropagation(); setSendDialogOpen(true); }}
                className="flex-1 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md font-mono-tech"
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
        <DialogContent className="max-w-4xl p-0 overflow-hidden border border-border bg-card text-card-foreground shadow-2xl backdrop-blur-2xl rounded-2xl flex flex-col max-h-[92vh]">
          {/* Header Fixo */}
          <div className="px-6 py-4 border-b border-border bg-muted/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-500 dark:text-cyan-400">
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
                <p className="text-xs text-slate-300 font-medium truncate max-w-md mt-0.5 uppercase">
                  {order.cliente}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {order.prazo && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs font-mono-tech text-slate-300">
                  <Clock className="h-3.5 w-3.5 text-cyan-400" />
                  <span className={isExpired ? "text-rose-400 font-bold" : isNearDeadline ? "text-amber-400 font-bold" : ""}>
                    {format(new Date(order.prazo), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </span>
                  {remainingText && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      isExpired
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse"
                        : isNearDeadline
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "bg-cyan-500/20 text-cyan-300"
                    }`}>
                      {remainingText}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {editing ? (
            <div className="space-y-4">
              {/* ═══ CABEÇALHO ═══ */}
              <div className="border rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Nº OS *</Label>
                    <Input value={editData.titulo} onChange={(e) => setEditData((d) => ({ ...d, titulo: e.target.value }))} className="h-9" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Cliente *</Label>
                    <Input value={editData.cliente} onChange={(e) => setEditData((d) => ({ ...d, cliente: e.target.value.toUpperCase() }))} className="h-9 uppercase" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Descrição do Serviço</Label>
                  <Input value={editData.descricao} onChange={(e) => setEditData((d) => ({ ...d, descricao: e.target.value }))} className="h-9" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Tipo de Trabalho</Label>
                    <Select
                      value={editData.tipo_trabalho || "novo"}
                      onValueChange={(v) => setEditData((d) => ({ ...d, tipo_trabalho: v, os_anterior: v === "repeticao" ? d.os_anterior : "" }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="novo">Trabalho Novo</SelectItem>
                        <SelectItem value="repeticao">Repetição</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editData.tipo_trabalho === "repeticao" && (
                    <div>
                      <Label className="text-xs uppercase text-amber-600 dark:text-amber-400 font-bold">N.º O.S ANTERIOR *</Label>
                      <Input
                        value={editData.os_anterior || ""}
                        onChange={(e) => setEditData((d) => ({ ...d, os_anterior: e.target.value }))}
                        placeholder="Ex: 69387"
                        className="h-9 font-mono-tech font-bold border-amber-500/40"
                      />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                      <RotateCcw className="h-3 w-3 text-amber-500" />
                      Revisão (REV)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={editData.revisao ?? 1}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setEditData((d) => ({ ...d, revisao: isNaN(val) ? 1 : val }));
                      }}
                      className="h-9 font-mono-tech font-bold"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Vendedor *</Label>
                  <Select value={editData.vendedor} onValueChange={(v) => setEditData((d) => ({ ...d, vendedor: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Nome" /></SelectTrigger>
                    <SelectContent>
                      {vendedoresList.map((v) => (
                        <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Operador Responsável</Label>
                  <Select
                    value={editData.operador || "__none__"}
                    onValueChange={(v) => setEditData((d) => ({ ...d, operador: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecionar operador..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-muted-foreground italic">
                        — Nenhum operador —
                      </SelectItem>
                      {operadoresList.map((op) => (
                        <SelectItem key={op.id} value={op.nome}>
                          {op.nome} {op.setor_vinculado ? `(${op.setor_vinculado})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">OBS</Label>
                  <Textarea value={editData.observacao} onChange={(e) => setEditData((d) => ({ ...d, observacao: e.target.value }))} placeholder="Observações gerais..." className="min-h-[50px]" />
                </div>
              </div>

              {/* ═══ PROVA ═══ */}
              <div className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Prova *</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-urgente-prova"
                      checked={editData.urgente_prova}
                      onCheckedChange={(v) => {
                        const isUrg = !!v;
                        setEditData((d) => {
                          let nextPrazo = d.prazo;
                          if (isUrg && !nextPrazo) {
                            const date = new Date();
                            date.setHours(date.getHours() + 2);
                            const pad = (n: number) => String(n).padStart(2, "0");
                            nextPrazo = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
                          }
                          return { ...d, urgente_prova: isUrg, prazo: nextPrazo };
                        });
                      }}
                    />
                    <Label htmlFor="edit-urgente-prova" className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${editData.urgente_prova ? "bg-red-600 text-white animate-pulse" : "text-red-600 dark:text-red-400"}`}>
                      <AlertTriangle className="h-4 w-4" /> Urgente
                    </Label>
                  </div>
                </div>
                {editData.urgente_prova && (
                  <div className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 space-y-1.5">
                    <Label className="text-xs font-bold text-rose-600 dark:text-rose-300 uppercase flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
                      Prazo da Prova Urgente
                    </Label>
                    <Input
                      type="datetime-local"
                      value={editData.prazo}
                      onChange={(e) => setEditData((d) => ({ ...d, prazo: e.target.value }))}
                      className="h-8 text-xs font-mono-tech bg-background"
                    />
                  </div>
                )}
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Checkbox id="edit-prova-digital" checked={editData.prova_digital} onCheckedChange={(v) => setEditData((d) => ({ ...d, prova_digital: !!v }))} />
                    <Label htmlFor="edit-prova-digital" className={`text-sm cursor-pointer px-2 py-0.5 rounded text-xs font-semibold ${editData.prova_digital ? "bg-sky-600 text-white" : "bg-muted text-foreground"}`}>Digital</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="edit-prova-email" checked={editData.prova_email} onCheckedChange={(v) => setEditData((d) => ({ ...d, prova_email: !!v }))} />
                    <Label htmlFor="edit-prova-email" className={`text-sm cursor-pointer px-2 py-0.5 rounded text-xs font-semibold ${editData.prova_email ? "bg-pink-600 text-white" : "bg-muted text-foreground"}`}>E-mail</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="edit-saida-direta" checked={editData.saida_direta} onCheckedChange={(v) => setEditData((d) => ({ ...d, saida_direta: !!v }))} />
                    <Label htmlFor="edit-saida-direta" className={`text-sm cursor-pointer px-2 py-0.5 rounded text-xs font-semibold ${editData.saida_direta ? "bg-yellow-500 text-black" : "bg-muted text-foreground"}`}>Saída Direta</Label>
                  </div>
                </div>
                {(editData.prova_digital || editData.prova_email) && (
                  <div className="space-y-2 pl-2 border-l-2 border-sky-200">
                    <Input value={editData.destinatario} onChange={(e) => setEditData((d) => ({ ...d, destinatario: e.target.value }))} placeholder="A/C:" className="h-8 text-sm" />
                    <Input value={editData.endereco_entrega} onChange={(e) => setEditData((d) => ({ ...d, endereco_entrega: e.target.value }))} placeholder="Endereço:" className="h-8 text-sm" />
                    <Textarea value={editData.obs_prova} onChange={(e) => setEditData((d) => ({ ...d, obs_prova: e.target.value }))} placeholder="OBS prova..." className="text-sm min-h-[40px]" rows={2} />
                    {editData.prova_digital && (
                      <div className="grid grid-cols-3 gap-2 rounded-md p-2">
                        <div>
                          <Label className="text-xs uppercase text-muted-foreground">Entregue para</Label>
                          <Input value={editData.entregue_para} onChange={(e) => setEditData((d) => ({ ...d, entregue_para: e.target.value }))} placeholder="Nome de quem recebeu" className="h-8 text-sm bg-muted-foreground/20 dark:bg-muted-foreground/30" />
                        </div>
                        <div>
                          <Label className="text-xs uppercase text-muted-foreground">Entregue por</Label>
                          <Input value={editData.entregue_por} onChange={(e) => setEditData((d) => ({ ...d, entregue_por: e.target.value }))} placeholder="Nome de quem entregou" className="h-8 text-sm bg-muted-foreground/20 dark:bg-muted-foreground/30" />
                        </div>
                        <div>
                          <Label className="text-xs uppercase text-muted-foreground">Data</Label>
                          <Input type="datetime-local" value={editData.entregue_em} onChange={(e) => setEditData((d) => ({ ...d, entregue_em: e.target.value }))} className="h-8 text-sm bg-muted-foreground/20 dark:bg-muted-foreground/30" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ═══ ACABAMENTO ═══ */}
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Acabamento</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox id="edit-urgente-acabamento" checked={editData.urgente_acabamento} onCheckedChange={(v) => setEditData((d) => ({ ...d, urgente_acabamento: !!v }))} />
                    <Label htmlFor="edit-urgente-acabamento" className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${editData.urgente_acabamento ? "bg-red-600 text-white animate-pulse" : "text-red-600 dark:text-red-400"}`}>
                      <AlertTriangle className="h-4 w-4" /> Urgente
                    </Label>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  {SPECIAL_SUPPLIES.map((item) => {
                    const active = isSpecialSupplyActive(editData.processos, item.id);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          setEditData((d) => ({
                            ...d,
                            processos: toggleSpecialSupplyActive(d.processos, item.id),
                          }));
                        }}
                        className={`p-2.5 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1 text-center cursor-pointer ${
                          active
                            ? "bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300 font-extrabold shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent hover:border-border/80"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              active ? "bg-amber-500" : "bg-muted-foreground/30"
                            }`}
                          />
                          <span className="font-mono-tech font-black text-xs tracking-wider">
                            {item.label}
                          </span>
                        </div>
                        <span className="text-[10px] font-medium opacity-80">
                          {active ? "Marcado (Pendente no Card)" : "Clique p/ marcar"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* CAMPO DE NÚMEROS DO PANTONE */}
                {isSpecialSupplyActive(editData.processos, "PANTONE") && (
                  <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 space-y-1">
                    <Label className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      Números dos Pantones
                    </Label>
                    <Input
                      value={getSpecialSupplyCustomText(editData.processos, "PANTONE")}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditData((d) => ({
                          ...d,
                          processos: setSpecialSupplyCustomText(d.processos, "PANTONE", val),
                        }));
                      }}
                      placeholder="Ex: 485 C, Reflex Blue..."
                      className="h-8 text-xs font-mono-tech bg-background"
                    />
                  </div>
                )}

                {/* CAMPO DE PREENCHIMENTO MANUAL: OUTROS */}
                {isSpecialSupplyActive(editData.processos, "OUTROS") && (
                  <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 space-y-1">
                    <Label className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      Especificação de Outros
                    </Label>
                    <Input
                      value={getSpecialSupplyCustomText(editData.processos, "OUTROS")}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditData((d) => ({
                          ...d,
                          processos: setSpecialSupplyCustomText(d.processos, "OUTROS", val),
                        }));
                      }}
                      placeholder="Descreva o processo / suprimento..."
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                )}
              </div>

              {/* ═══ EXPEDIÇÃO ═══ */}
              <div className="border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Expedição</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox id="edit-urgente-expedicao" checked={editData.urgente_expedicao} onCheckedChange={(v) => setEditData((d) => ({ ...d, urgente_expedicao: !!v }))} />
                    <Label htmlFor="edit-urgente-expedicao" className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${editData.urgente_expedicao ? "bg-red-600 text-white animate-pulse" : "text-red-600 dark:text-red-400"}`}>
                      <AlertTriangle className="h-4 w-4" /> Urgente
                    </Label>
                  </div>
                </div>

                {/* Tipo Entrega: MOTO / CARRO / RETIRA */}
                <div className="flex items-center gap-4 flex-wrap">
                  {["MOTO", "CARRO", "RETIRA"].map((tipo) => (
                    <div key={tipo} className="flex items-center gap-2">
                      <Checkbox
                        id={`edit-entrega-${tipo}`}
                        checked={editData.tipo_entrega.includes(tipo)}
                        onCheckedChange={() => toggleEditTipoEntrega(tipo)}
                      />
                      <Label htmlFor={`edit-entrega-${tipo}`} className={`text-sm cursor-pointer font-semibold px-2 py-0.5 rounded text-xs ${
                        editData.tipo_entrega.includes(tipo)
                          ? tipo === "CARRO" ? "bg-pink-600 text-white"
                            : tipo === "MOTO" ? "bg-blue-600 text-white"
                            : "bg-yellow-500 text-black"
                          : ""
                      }`}>
                        {tipo.charAt(0) + tipo.slice(1).toLowerCase()}
                      </Label>
                    </div>
                  ))}
                </div>

                {/* ENTREGAR COM: NF / PROTOCOLO */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">Entregar com</Label>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="edit-tem-nf"
                        checked={editData.tipo_documento === "NF"}
                        onCheckedChange={(checked) => setEditData((d) => ({ ...d, tipo_documento: checked ? "NF" as const : "" as const, valor_documento: checked ? d.valor_documento : "" }))}
                      />
                      <Label htmlFor="edit-tem-nf" className="text-sm cursor-pointer font-semibold">NF</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="edit-tem-protocolo"
                        checked={editData.tipo_documento === "PROTOCOLO"}
                        onCheckedChange={(checked) => setEditData((d) => ({ ...d, tipo_documento: checked ? "PROTOCOLO" as const : "" as const, valor_documento: checked ? d.valor_documento : "" }))}
                      />
                      <Label htmlFor="edit-tem-protocolo" className="text-sm cursor-pointer font-semibold">Protocolo</Label>
                    </div>
                  </div>
                </div>

                {/* DA: empresa */}
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Da</Label>
                  <RadioGroup
                    value={editData.empresa_entrega}
                    onValueChange={(v) => setEditData((d) => ({ ...d, empresa_entrega: v }))}
                    className="flex items-center gap-4 mt-1"
                  >
                    {["PRIMACOR", "IMPRIMASET", "CLIENTE"].map((emp) => (
                      <div key={emp} className="flex items-center gap-2">
                        <RadioGroupItem value={emp} id={`edit-empresa-${emp}`} />
                        <Label htmlFor={`edit-empresa-${emp}`} className={`text-sm cursor-pointer font-semibold px-2 py-0.5 rounded text-xs ${
                          editData.empresa_entrega === emp
                            ? emp === "PRIMACOR" ? "bg-blue-600 text-white"
                              : emp === "IMPRIMASET" ? "bg-pink-600 text-white"
                              : emp === "CLIENTE" ? "bg-yellow-500 text-black"
                              : ""
                            : ""
                        }`}>{emp === "IMPRIMASET" ? "Imprimaset" : emp.charAt(0) + emp.slice(1).toLowerCase()}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Endereço</Label>
                  <Input value={editData.entrega_endereco} onChange={(e) => setEditData((d) => ({ ...d, entrega_endereco: e.target.value }))} placeholder="Endereço de entrega" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">A/C</Label>
                  <Input value={editData.entrega_ac} onChange={(e) => setEditData((d) => ({ ...d, entrega_ac: e.target.value }))} placeholder="Aos cuidados de..." className="h-9" />
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Data Entrega</Label>
                  <Input type="datetime-local" value={editData.entrega_data_limite} onChange={(e) => setEditData((d) => ({ ...d, entrega_data_limite: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">OBS</Label>
                  <Textarea value={editData.obs_entrega} onChange={(e) => setEditData((d) => ({ ...d, obs_entrega: e.target.value }))} placeholder="Observações da entrega..." className="min-h-[40px]" />
                </div>

                {/* Entregue para / por / data */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Entregue para</Label>
                    <Input value={editData.entregue_para} onChange={(e) => setEditData((d) => ({ ...d, entregue_para: e.target.value }))} placeholder="Nome de quem recebeu" className="h-9 bg-muted-foreground/20 dark:bg-muted-foreground/30" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Entregue por</Label>
                    <Input value={editData.entregue_por} onChange={(e) => setEditData((d) => ({ ...d, entregue_por: e.target.value }))} placeholder="Nome de quem entregou" className="h-9 bg-muted-foreground/20 dark:bg-muted-foreground/30" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Data</Label>
                    <Input type="datetime-local" value={editData.entregue_em} onChange={(e) => setEditData((d) => ({ ...d, entregue_em: e.target.value }))} className="h-9 bg-muted-foreground/20 dark:bg-muted-foreground/30" />
                  </div>
                </div>

                {/* Prazo / Horário Limite */}
                {(editData.urgente_prova || editData.urgente_impressao || editData.urgente_acabamento || editData.urgente_expedicao) && (
                  <div>
                    <Label className="text-xs font-medium">Horário Limite</Label>
                    <Input type="datetime-local" value={editData.prazo} onChange={(e) => setEditData((d) => ({ ...d, prazo: e.target.value }))} className="mt-1 h-9" />
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
                <Button onClick={handleSave}>Salvar</Button>
              </div>
            </div>
          ) : (
            /* ═══ VIEW MODE (DUAL COLUMN SPLIT, NO VERTICAL SCROLLBAR) ═══ */
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-y-auto px-6 py-4 max-h-[68vh] scrollbar-none">
                {/* ─── COLUNA 1: ESPECIFICAÇÕES, PROVA & PROCESSOS ─── */}
                <div className="space-y-3">
                  {/* Bloco Comercial & Descrição */}
                  <div className="p-3.5 rounded-xl border border-border bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
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
                    <div className="p-3.5 rounded-xl border border-border bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                          <span>Prova Técnica</span>
                        </div>
                        {order.urgente_prova && (
                          <div className="flex items-center gap-1.5">
                            <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 text-[10px] animate-pulse">
                              Prova Urgente
                            </Badge>
                            {remainingText && (
                              <Badge className={`text-[10px] font-mono-tech font-bold ${
                                isExpired ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40" : "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/40"
                              }`}>
                                {remainingText}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {order.prova_email && <Badge className="bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/40 font-semibold text-xs">E-mail</Badge>}
                        {order.prova_digital && <Badge className="bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/40 font-semibold text-xs">Digital</Badge>}
                        {order.saida_direta && <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40 font-semibold text-xs">Saída Direta</Badge>}
                        {(order as any).digital_color && <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40 font-semibold text-xs">Color</Badge>}
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
                    <div className="p-3.5 rounded-xl border border-border bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
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
                    <div className="p-3.5 rounded-xl border border-border bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
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
                        <User className="h-3 w-3 text-cyan-600 dark:text-cyan-400" />
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
                  <div className="p-3.5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 dark:bg-cyan-950/20 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                          <UserCheck className="h-4 w-4" />
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
                        <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30">
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
                  />
                </div>
              </div>


              {/* Rodapé Fixo de Ações */}
              <div className="px-6 py-3.5 border-t border-border bg-card/90 dark:border-slate-800/80 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
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
                        onClick={() => setEditing(true)}
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
          )}
        </DialogContent>
      </Dialog>

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

