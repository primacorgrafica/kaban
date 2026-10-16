import { useState, useEffect, memo } from "react";
import { Order, OrderStatus, STATUS_CONFIG, STATUS_ORDER } from "@/types/order";
import { DEPARTMENTS, Department } from "@/types/production";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, User, FileText, Archive, Trash2, GripVertical, UserCheck, Clock, AlertTriangle, Send, ChevronDown, ChevronUp, Truck, Briefcase, Copy, Edit2, MessageSquarePlus } from "lucide-react";
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
import { PROCESSO_GROUPS, ALL_PROCESSOS, getProcessoCor, ACABAMENTO_TIPOS, IMPRESSAO_TIPOS, IMPRESSAO_PROCESSOS, ACABAMENTO_GROUPS } from "@/lib/processos";
import { OrderAttachmentsSection } from "./sharepoint/OrderAttachmentsSection";


const HIDDEN_PROCESSOS = [...(ACABAMENTO_TIPOS as readonly string[]), ...IMPRESSAO_TIPOS.map((p) => p.sigla)];
const PROCESSO_ORDER = ALL_PROCESSOS.map((p) => p.sigla);

function sortAndFilterProcessos(processos: string[]): string[] {
  return processos
    .filter((p) => !HIDDEN_PROCESSOS.includes(p))
    .sort((a, b) => {
      const ia = PROCESSO_ORDER.indexOf(a);
      const ib = PROCESSO_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
}

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
  dragHandleProps?: Record<string, unknown>;
  updatedByName?: string | null;
  createdByName?: string | null;
  permissions: Permissions;
  departmentContext?: string;
  isSlowAlert?: boolean;
}

function useDeadlineAlert(prazo: string | null) {
  const [isNearDeadline, setIsNearDeadline] = useState(false);

  useEffect(() => {
    if (!prazo) { setIsNearDeadline(false); return; }
    const check = () => {
      const now = Date.now();
      const deadline = new Date(prazo).getTime();
      setIsNearDeadline(deadline - now <= 0);
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [prazo]);

  return isNearDeadline;
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

function OrderCardImpl({ order, onUpdate, onMove, onArchive, onDelete, onDuplicate, onSendToProduction, onSendToMultipleProduction, onSendToExpedicao, dragHandleProps, updatedByName, createdByName, permissions, departmentContext, isSlowAlert }: OrderCardProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
  const isNearDeadline = useDeadlineAlert(order.prazo);
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

  const visibleSections = getVisibleSections(departmentContext);
  // When expanded or no department context, show all
  const showAll = expanded || !departmentContext;

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
      cliente: editData.cliente,
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
            <Clock className="h-3 w-3" /> Atrasado
          </div>
        )}
        {order.saida_direta && (
          <div className="px-2 py-0.5 bg-amber-400 text-amber-900 flex items-center relative">
            {isSlowAlert && <Clock className="h-4 w-4 animate-pulse absolute left-1.5" fill="#facc15" color="#000" strokeWidth={2} />}
            <div className="flex-1 text-center flex items-center justify-center gap-1">
              {isUrgentProva && !order.prova_digital && !order.prova_email && (
                <span className={`mr-1 inline-block bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${shouldBlinkUrgentBanner ? "animate-pulse" : ""}`}>URGENTE</span>
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
                <span className={`mr-1 inline-block bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${shouldBlinkUrgentBanner ? "animate-pulse" : ""}`}>URGENTE</span>
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
                <span className={`mr-1 inline-block bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${shouldBlinkUrgentBanner ? "animate-pulse" : ""}`}>URGENTE</span>
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
        {order.setor && (
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
          {/* Linha 1: OS + Cliente */}
          <div className="flex items-start gap-2 min-w-0">
            {isUrgent && <span className="h-2 w-2 rounded-full shrink-0 bg-rose-500 shadow-[0_0_8px_#f43f5e] mt-1" />}
            <span className="font-mono-tech text-[11px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 shrink-0">
              #{order.titulo}
            </span>
            <span className="flex items-start gap-1 text-sm text-foreground min-w-0 font-semibold break-words leading-tight">
              <span className="break-words">{order.cliente}</span>
            </span>
          </div>
          {/* Linha 2: Descrição + Vendedor */}
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground min-w-0">
            {order.descricao && (
              <span className="truncate min-w-0">
                <FileText className="h-3 w-3 inline mr-1" />{order.descricao}
              </span>
            )}
            {order.vendedor && (
              <span className="shrink-0 ml-auto flex items-center gap-1">
                <User className="h-3 w-3" />
                {order.vendedor}
              </span>
            )}
          </div>
          {/* Linha 2.5: Observação (esquerda) + Operador (direita, abaixo do vendedor) */}
          {(order.operador || (order.observacao && !(order.status === "paralisado" || order.status === "aguardando_novo_arquivo"))) && (
            <div className="flex items-center justify-between gap-2 mt-1 text-xs min-w-0">
              <div className="min-w-0 flex-1">
                {!(order.status === "paralisado" || order.status === "aguardando_novo_arquivo") && order.observacao && (
                  <p className="text-xs text-muted-foreground line-clamp-1 italic">{order.observacao}</p>
                )}
              </div>
              {order.operador && (
                <span
                  className="shrink-0 ml-auto flex items-center gap-1 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 dark:bg-cyan-950/40 border border-cyan-500/30 px-1.5 py-0.5 rounded-md shadow-2xs"
                  title={`Operador responsável: ${order.operador}`}
                >
                  <UserCheck className="h-3 w-3 text-cyan-500" />
                  {order.operador}
                </span>
              )}
            </div>
          )}
          {order.prazo && (
            <div className={`flex items-center gap-1 mt-1 text-[10px] font-semibold ${isNearDeadline ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
              <Clock className="h-3 w-3" />
              Prazo: {format(new Date(order.prazo), "dd/MM HH:mm", { locale: ptBR })}
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
          {order.obs_prova && (showAll || visibleSections.prova) && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 line-clamp-2 italic">📋 {order.obs_prova}</p>
          )}
          {order.prova_digital && order.endereco_entrega && (showAll || visibleSections.prova) && (
            <p className="text-xs font-bold text-foreground mt-1 truncate">{order.endereco_entrega}</p>
          )}

          {/* Processos badges - show if relevant section visible */}
          {(showAll || visibleSections.processos) && order.processos && order.processos.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {sortAndFilterProcessos(order.processos).map((p) => (
                <span key={p} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getProcessoCor(p)}`}>{p}</span>
              ))}
            </div>
          )}




          {/* Expand/Collapse button when department context is set */}
          {departmentContext && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="flex items-center gap-1 mt-1.5 text-[10px] text-primary hover:underline"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Recolher" : "Ver detalhes"}
            </button>
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

        {permissions.canSendToProduction && isLastStatus && onSendToProduction && (
          <button
            onClick={(e) => { e.stopPropagation(); setSendDialogOpen(true); }}
            className="w-full py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all rounded-b-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md font-mono-tech"
          >
            <Send className="h-3.5 w-3.5" /> Enviar para Produção →
          </button>
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
                <p className="text-xs text-slate-300 font-medium truncate max-w-md mt-0.5">
                  {order.cliente}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {order.prazo && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs font-mono-tech text-slate-300">
                  <Clock className="h-3.5 w-3.5 text-cyan-400" />
                  <span className={isNearDeadline ? "text-rose-400 font-bold" : ""}>
                    {format(new Date(order.prazo), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </span>
                </div>
              )}
              {order.vendedor && (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-muted border border-border text-xs text-foreground font-medium">
                  <User className="h-3 w-3 text-primary" />
                  <span>{order.vendedor}</span>
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
                    <Input value={editData.cliente} onChange={(e) => setEditData((d) => ({ ...d, cliente: e.target.value }))} className="h-9" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Descrição do Serviço</Label>
                  <Input value={editData.descricao} onChange={(e) => setEditData((d) => ({ ...d, descricao: e.target.value }))} className="h-9" />
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
                    <Checkbox id="edit-urgente-prova" checked={editData.urgente_prova} onCheckedChange={(v) => setEditData((d) => ({ ...d, urgente_prova: !!v }))} />
                    <Label htmlFor="edit-urgente-prova" className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${editData.urgente_prova ? "bg-red-600 text-white animate-pulse" : "text-red-600 dark:text-red-400"}`}>
                      <AlertTriangle className="h-4 w-4" /> Urgente
                    </Label>
                  </div>
                </div>
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

              {/* ═══ IMPRESSÃO ═══ */}
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Impressão</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox id="edit-urgente-impressao" checked={editData.urgente_impressao} onCheckedChange={(v) => setEditData((d) => ({ ...d, urgente_impressao: !!v }))} />
                    <Label htmlFor="edit-urgente-impressao" className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${editData.urgente_impressao ? "bg-red-600 text-white animate-pulse" : "text-red-600 dark:text-red-400"}`}>
                      <AlertTriangle className="h-4 w-4" /> Urgente
                    </Label>
                  </div>
                </div>
                {/* Linha 1: CTP - OFF - CMYK - CMYK+IR - CMYK+VM - PANTONE */}
                <div className="flex items-center gap-1 flex-nowrap">
                  {(["CTP", "OFF"] as const).map((sigla) => {
                    const p = IMPRESSAO_PROCESSOS.find((ip) => ip.sigla === sigla)!;
                    return (
                      <Badge
                        key={p.sigla}
                        variant="outline"
                        className={`cursor-pointer text-xs px-1.5 py-0.5 select-none transition-all font-bold border ${
                          editData.processos.includes(p.sigla)
                            ? `${p.cor} ring-2 ring-offset-1 ring-primary/40`
                            : "bg-background text-muted-foreground border-border hover:bg-muted"
                        }`}
                        onClick={() => toggleEditProcesso(p.sigla)}
                      >
                        {p.sigla}
                      </Badge>
                    );
                  })}
                  {IMPRESSAO_TIPOS.map((p) => (
                    <div key={p.sigla} className="flex items-center gap-0.5">
                      <Checkbox
                        id={`edit-imp-${p.sigla}`}
                        checked={editData.processos.includes(p.sigla)}
                        onCheckedChange={() => toggleEditProcesso(p.sigla)}
                        className="h-3.5 w-3.5"
                      />
                      <Label
                        htmlFor={`edit-imp-${p.sigla}`}
                        className={`cursor-pointer px-1.5 py-0.5 rounded text-xs font-semibold ${
                          editData.processos.includes(p.sigla)
                            ? (p.sigla === "CMYK+IR" ? "bg-pink-600 text-white" :
                               p.sigla === "CMYK+VM" ? "bg-yellow-500 text-black" :
                               p.sigla === "PANTONE" ? "bg-green-600 text-white" :
                               "bg-blue-600 text-white")
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {p.sigla}
                      </Label>
                    </div>
                  ))}
                </div>
                {/* Linha 2: DIG - PLO - Color - PB */}
                <div className="flex items-center gap-1 flex-nowrap">
                  {(["DIG", "PLO"] as const).map((sigla) => {
                    const p = IMPRESSAO_PROCESSOS.find((ip) => ip.sigla === sigla)!;
                    return (
                      <Badge
                        key={p.sigla}
                        variant="outline"
                        className={`cursor-pointer text-xs px-1.5 py-0.5 select-none transition-all font-bold border ${
                          editData.processos.includes(p.sigla)
                            ? `${p.cor} ring-2 ring-offset-1 ring-primary/40`
                            : "bg-background text-muted-foreground border-border hover:bg-muted"
                        }`}
                        onClick={() => toggleEditProcesso(p.sigla)}
                      >
                        {p.sigla}
                      </Badge>
                    );
                  })}
                  <div className="flex items-center gap-2">
                    <Checkbox id="edit-digital-color" checked={editData.digital_color} onCheckedChange={(v) => setEditData((d) => ({ ...d, digital_color: !!v }))} />
                    <Label htmlFor="edit-digital-color" className={`text-sm cursor-pointer px-2 py-0.5 rounded text-xs font-semibold ${editData.digital_color ? "bg-blue-600 text-white" : "bg-muted text-foreground"}`}>Color</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="edit-digital-pb" checked={editData.digital_pb} onCheckedChange={(v) => setEditData((d) => ({ ...d, digital_pb: !!v }))} />
                    <Label htmlFor="edit-digital-pb" className={`text-sm cursor-pointer px-2 py-0.5 rounded text-xs font-semibold ${editData.digital_pb ? "bg-gray-500 text-white" : "bg-muted text-foreground"}`}>PB</Label>
                  </div>
                </div>
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
                <RadioGroup
                  value={editData.processos.find((p) => (ACABAMENTO_TIPOS as readonly string[]).includes(p)) || ""}
                  onValueChange={(v) => {
                    setEditData((d) => ({
                      ...d,
                      processos: [
                        ...d.processos.filter((p) => !(ACABAMENTO_TIPOS as readonly string[]).includes(p)),
                        v,
                      ],
                    }));
                  }}
                  className="flex items-center gap-4"
                >
                  {ACABAMENTO_TIPOS.map((tipo) => {
                    const selected = editData.processos.includes(tipo);
                    const colorClass = tipo === "Promocional" ? "bg-blue-600 text-white" :
                      tipo === "Editorial" ? "bg-pink-600 text-white" :
                      "bg-yellow-500 text-black";
                    return (
                      <div key={tipo} className="flex items-center gap-2">
                        <RadioGroupItem value={tipo} id={`edit-acab-${tipo}`} />
                        <Label htmlFor={`edit-acab-${tipo}`} className={`text-sm cursor-pointer font-semibold px-2 py-0.5 rounded text-xs ${selected ? colorClass : ""}`}>{tipo}</Label>
                      </div>
                    );
                  })}
                </RadioGroup>
                {ACABAMENTO_GROUPS.map((group, gi) => (
                  <div key={gi}>
                    <div className={`flex flex-nowrap justify-between mt-0.5 ${gi === 2 ? "bg-purple-100 dark:bg-purple-900/40 rounded-md p-2 -mx-0.5" : ""}`}>
                      {group.items.map((p) => (
                        <Badge
                          key={p.sigla}
                          variant="outline"
                          className={`cursor-pointer text-[11px] px-1.5 py-0.5 select-none transition-all font-bold border ${
                            editData.processos.includes(p.sigla)
                              ? `${p.cor} ring-2 ring-offset-1 ring-primary/40`
                              : "bg-background text-muted-foreground border-border hover:bg-muted"
                          }`}
                          onClick={() => toggleEditProcesso(p.sigla)}
                        >
                          {p.sigla}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
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
                    {order.observacao && (
                      <div className="pt-1.5 border-t border-border/60">
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">Observações</p>
                        <p className="text-xs text-foreground whitespace-pre-wrap">{order.observacao}</p>
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
                          <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 text-[10px] animate-pulse">
                            Urgente
                          </Badge>
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

