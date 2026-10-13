import { useState, useEffect, memo } from "react";
import { Order, OrderStatus, STATUS_CONFIG, STATUS_ORDER } from "@/types/order";
import { DEPARTMENTS, Department } from "@/types/production";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, User, FileText, Archive, Trash2, GripVertical, UserCheck, Clock, AlertTriangle, Send, ChevronDown, ChevronUp, Truck, Briefcase, Copy } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
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

  const config = STATUS_CONFIG[order.status];
  const statusIdx = STATUS_ORDER.indexOf(order.status);
  const isLastStatus = order.status === "arquivo_liberado";
  const isNearDeadline = useDeadlineAlert(order.prazo);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState<{ department: Department; machine?: string }[]>([]);
  const [currentDept, setCurrentDept] = useState<Department | "">("");
  const [currentMachine, setCurrentMachine] = useState("");

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
        className={`group rounded-xl border shadow-sm hover:shadow-md overflow-hidden relative ${shouldBlinkCard ? "animate-pulse" : ""}`}
        style={{
          backgroundColor: isUrgent ? "hsl(0 84% 60% / 0.12)" : "hsl(var(--muted))",
          borderColor: isUrgent ? "hsl(0 84% 60% / 0.4)" : isSlowAlert ? "hsl(45 93% 47% / 0.6)" : isNearDeadline ? "hsl(38 92% 50% / 0.5)" : "hsl(var(--border))",
        }}
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
            {isUrgent && <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-red-500" />}
            <h4 className={`font-semibold text-sm shrink-0 ${isUrgent ? "text-red-700 dark:text-red-400" : "text-card-foreground"}`}>OS. {order.titulo}</h4>
            <span className="flex items-start gap-1 text-sm text-muted-foreground min-w-0 font-bold break-words">
              <Briefcase className="h-3 w-3 shrink-0 mt-[3px]" /><span className="break-words">{order.cliente}</span>
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
          {order.prazo && (
            <div className={`flex items-center gap-1 mt-1 text-[10px] font-semibold ${isNearDeadline ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
              <Clock className="h-3 w-3" />
              Prazo: {format(new Date(order.prazo), "dd/MM HH:mm", { locale: ptBR })}
            </div>
          )}
          {order.observacao && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{order.observacao}</p>
          )}
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
            className="w-full py-2 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-colors rounded-b-xl"
            style={{ backgroundColor: "hsl(0 0% 20%)", color: "hsl(0 0% 100%)" }}
          >
            <Send className="h-3.5 w-3.5" /> Enviar → Produção →
          </button>
        )}
      </div>

      {/* Detail / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {editing ? "Editar OS." : "Detalhes da OS."}
            </DialogTitle>
          </DialogHeader>

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
            /* ═══ VIEW MODE ═══ */
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge
                  className="mt-1"
                  style={{
                    backgroundColor: `hsl(var(--status-${config.colorKey}-bg))`,
                    color: `hsl(var(--status-${config.colorKey}))`,
                    border: `1px solid hsl(var(--status-${config.colorKey}) / 0.3)`,
                  }}
                >
                  {config.label}
                </Badge>
              </div>
              {order.urgente && (
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold text-sm">
                  <AlertTriangle className="h-4 w-4" /> Urgente
                </div>
              )}
              {order.prazo && (
                <div>
                  <p className="text-sm text-muted-foreground">Prazo</p>
                  <p className={`text-sm font-semibold ${isNearDeadline ? "text-red-600 dark:text-red-400" : ""}`}>
                    {format(new Date(order.prazo), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Número OS.</p>
                <p className="font-medium">{order.titulo}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nome Cliente</p>
                <p>{order.cliente}</p>
              </div>
              {order.vendedor && (
                <div>
                  <p className="text-sm text-muted-foreground">Vendedor</p>
                  <p className="text-sm">{order.vendedor}</p>
                </div>
              )}
              {order.observacao && (
                <div>
                  <p className="text-sm text-muted-foreground">Observação</p>
                  <p className="text-sm">{order.observacao}</p>
                </div>
              )}

              {/* PROVA section */}
              {(order.prova_digital || order.prova_email || order.saida_direta) && (
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Prova</p>
                  <div className="flex gap-2 flex-wrap">
                    {order.prova_email && <Badge className="bg-pink-100 text-pink-800 border-pink-300">E-mail</Badge>}
                    {order.prova_digital && <Badge className="bg-sky-100 text-sky-800 border-sky-300">Digital</Badge>}
                    {order.saida_direta && <Badge className="bg-amber-100 text-amber-800 border-amber-300">Saída Direta</Badge>}
                    {(order as any).digital_color && <Badge className="bg-blue-100 text-blue-800 border-blue-300">Color</Badge>}
                    {(order as any).digital_pb && <Badge className="bg-gray-200 text-gray-800 border-gray-400">PB</Badge>}
                  </div>
                  {order.prova_digital && order.destinatario && (
                    <p className="text-sm"><span className="text-muted-foreground">A/C:</span> <strong>{order.destinatario}</strong></p>
                  )}
                  {order.prova_digital && order.endereco_entrega && (
                    <p className="text-sm"><span className="text-muted-foreground">Endereço:</span> <strong>{order.endereco_entrega}</strong></p>
                  )}
                  {order.prova_digital && order.entregue_para && (
                    <p className="text-sm"><span className="text-muted-foreground">Entregue para:</span> <strong>{order.entregue_para}</strong></p>
                  )}
                  {order.prova_digital && order.entregue_em && (
                    <p className="text-sm"><span className="text-muted-foreground">Em:</span> <strong>{format(new Date(order.entregue_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</strong></p>
                  )}
                </div>
              )}

              {/* Processos */}
              {order.processos && order.processos.length > 0 && (
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Processos</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sortAndFilterProcessos(order.processos).map((p) => (
                      <span key={p} className={`text-xs font-bold px-2 py-0.5 rounded border ${getProcessoCor(p)}`}>{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Entrega info */}
              {hasEntregaInfo && (
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Expedição</p>
                  {order.tipo_entrega && order.tipo_entrega.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {order.tipo_entrega.map((t) => (
                        <Badge key={t} className={
                          t === "CARRO" ? "bg-green-100 text-green-800 border-green-300" :
                          t === "MOTO" ? "bg-blue-100 text-blue-800 border-blue-300" :
                          "bg-gray-100 text-gray-800 border-gray-300"
                        }>{t}</Badge>
                      ))}
                    </div>
                  )}
                  {order.nf && <p className="text-sm"><span className="text-muted-foreground">NF:</span> {order.nf}</p>}
                  {order.protocolo && <p className="text-sm"><span className="text-muted-foreground">Protocolo:</span> {order.protocolo}</p>}
                  {order.empresa_entrega && <p className="text-sm"><span className="text-muted-foreground">Da:</span> {order.empresa_entrega}</p>}
                  {order.entrega_para && <p className="text-sm"><span className="text-muted-foreground">Para:</span> {order.entrega_para}</p>}
                  {order.entrega_endereco && <p className="text-sm"><span className="text-muted-foreground">Endereço:</span> {order.entrega_endereco}</p>}
                  {order.entrega_ac && <p className="text-sm"><span className="text-muted-foreground">A/C:</span> {order.entrega_ac}</p>}
                  {order.entrega_data_limite && (
                    <p className="text-sm"><span className="text-muted-foreground">Data Entrega:</span> {format(new Date(order.entrega_data_limite), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                  )}
                  {order.obs_entrega && <p className="text-sm"><span className="text-muted-foreground">OBS:</span> {order.obs_entrega}</p>}
                </div>
              )}

              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                {createdByName && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>Criado por <strong className="text-foreground">{createdByName}</strong></span>
                    <span>em {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                )}
                {updatedByName && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <UserCheck className="h-3 w-3" />
                    <span>Atualizado por <strong className="text-foreground">{updatedByName}</strong></span>
                    <span>em {format(new Date(order.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                )}
              </div>

              {/* Botões de envio rápido para Operador */}
              {!order.setor && !order.arquivado && departmentContext === "pre_impressao" && (
                <div className="flex flex-col gap-2 pt-2 border-t">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Enviar para Operador</span>
                  <div className="flex gap-2">
                    {([
                      { label: "Operador 1", status: "preparando_arquivo" },
                      { label: "Operador 2", status: "operador_2" },
                      { label: "Operador 3", status: "operador_3" },
                    ] as { label: string; status: OrderStatus }[]).map((op) => (
                      <Button
                        key={op.status}
                        size="sm"
                        variant={order.status === op.status ? "default" : "outline"}
                        disabled={order.status === op.status}
                        className="flex-1"
                        onClick={() => {
                          onMove(order.id, op.status);
                          setOpen(false);
                        }}
                      >
                        {op.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {!permissions.isViewOnly && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                  <div className="flex-1" />
                   {permissions.canEditCard && onDuplicate && (
                    <Button size="sm" variant="outline" onClick={() => { onDuplicate(order); setOpen(false); }}>
                      <Copy className="h-4 w-4 mr-1" /> Duplicar
                    </Button>
                  )}
                  {permissions.canEditCard && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Editar</Button>
                  )}
                  {permissions.canArchive && (
                    <Button size="sm" variant="outline" onClick={() => { onArchive(order.id); setOpen(false); }}>
                      <Archive className="h-4 w-4 mr-1" /> Arquivar
                    </Button>
                  )}
                  {permissions.canDelete && (
                    <Button size="sm" variant="destructive" onClick={() => { onDelete(order.id); setOpen(false); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  {permissions.canSendToProduction && onSendToProduction && (
                    <Button
                      className="w-full mt-2"
                      onClick={() => setSendDialogOpen(true)}
                      style={{ backgroundColor: "hsl(var(--primary))" }}
                    >
                      <Send className="h-4 w-4 mr-2" /> {isLastStatus ? "Enviar → Produção" : "Mover para outro setor"}
                    </Button>
                  )}
                  {order.status === "aguardando_prova" && !order.setor && onSendToExpedicao && (
                    <Button
                      className="w-full mt-2"
                      variant="outline"
                      onClick={() => { onSendToExpedicao(order.id); setOpen(false); }}
                    >
                      <Truck className="h-4 w-4 mr-2" /> Enviar → Expedição (Entrada)
                    </Button>
                  )}
                </div>
              )}
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

