import { getOrderRevision } from "@/lib/orderRevision";
import { useState, useEffect, memo } from "react";
import { getProcessoCor, sortAndFilterProcessos, SPECIAL_SUPPLIES, isSpecialSupplyActive, isSpecialSupplySent, toggleSpecialSupplySent, getSpecialSupplyDetails, getSpecialSupplyBadgeClasses, formatSafeDate } from "@/lib/processos";
import { Order } from "@/types/order";
import { DepartmentConfig, DepartmentStatusConfig, DEPARTMENTS, Department } from "@/types/production";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { businessHoursMs } from "@/lib/businessHours";
import { supabase } from "@/integrations/supabase/client";
import { subscribeApprovalEntry } from "@/lib/approvalEntryCache";
import { RotateCcw, Calendar, User, FileText, Archive, Trash2, ChevronRight, ChevronLeft, GripVertical, UserCheck, Clock, AlertTriangle, Send, Undo2, Briefcase, Truck, Edit2, Check, Mail, HardHat, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { OrderEmailEventsSection } from "@/components/email/OrderEmailEventsSection";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { RadioGroup as RadioGroupBase, RadioGroupItem } from "@/components/ui/radio-group";

interface ProductionCardProps {
  order: Order;
  department: DepartmentConfig;
  currentStatus: DepartmentStatusConfig;
  onUpdate: (id: string, data: Partial<Order>) => void;
  onMove: (id: string, newStatus: string, newIndex?: number) => void;
  onSendToDepartment: (id: string, dept: Department, machine?: string) => void;
  onSendBackToPrePress?: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: Record<string, unknown>;
  updatedByName?: string | null;
  createdByName?: string | null;
  readOnly?: boolean;
  hasFaturamentoPendencia?: boolean;
  parentSector?: string | null;
}

function useDeadlineAlert(prazo: string | null) {
  const [isNearDeadline, setIsNearDeadline] = useState(false);
  useEffect(() => {
    if (!prazo) { setIsNearDeadline(false); return; }
    const check = () => {
      const diff = new Date(prazo).getTime() - Date.now();
      setIsNearDeadline(diff <= 3600000);
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [prazo]);
  return isNearDeadline;
}

function ProductionCardImpl({
  order,
  department,
  currentStatus,
  onUpdate,
  onMove,
  onSendToDepartment,
  onSendBackToPrePress,
  onArchive,
  onDelete,
  dragHandleProps,
  updatedByName,
  createdByName,
  readOnly = false,
  hasFaturamentoPendencia = false,
  parentSector,
}: ProductionCardProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState<Department | "pre-impressao" | "">("");
  const [selectedMachine, setSelectedMachine] = useState("");
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

  const [editData, setEditData] = useState({
    titulo: order.titulo,
    descricao: order.descricao,
    cliente: order.cliente,
    observacao: order.observacao || "",
    urgente: order.urgente || false,
    urgente_prova: order.urgente_prova || false,
    urgente_impressao: order.urgente_impressao || false,
    urgente_acabamento: order.urgente_acabamento || false,
    urgente_expedicao: order.urgente_expedicao || false,
    prazo: order.prazo ? order.prazo.slice(0, 16) : "",
  });

  const [expData, setExpData] = useState({
    tipo_entrega: order.tipo_entrega || [] as string[],
    empresa_entrega: order.empresa_entrega || "",
    tem_nf: order.nf === "SIM",
    tem_protocolo: order.protocolo === "SIM",
    entrega_para: order.entrega_para || "",
    entrega_endereco: order.entrega_endereco || "",
    entrega_ac: order.entrega_ac || "",
    entrega_data_limite: order.entrega_data_limite ? order.entrega_data_limite.slice(0, 16) : "",
    obs_entrega: order.obs_entrega || "",
    entregue_por: order.entregue_por || "",
    entregue_para: order.entregue_para || "",
    entregue_em: order.entregue_em ? order.entregue_em.slice(0, 16) : "",
  });

  const isExpedicao = department.id === "expedicao";
  const isExpedicaoEntrada = isExpedicao && currentStatus.id === "entrada";

  // Faturamento checklist state
  const [fatData, setFatData] = useState({
    fat_cnpj_ok: order.fat_cnpj_ok || false,
    fat_cnpj_obs: order.fat_cnpj_obs || "",
    fat_cnpj_pendente: order.fat_cnpj_pendente || false,
    fat_retencao_iss_ok: order.fat_retencao_iss_ok || false,
    fat_retencao_iss_obs: order.fat_retencao_iss_obs || "",
    fat_retencao_iss_pendente: order.fat_retencao_iss_pendente || false,
    fat_retencoes_federais_ok: order.fat_retencoes_federais_ok || false,
    fat_retencoes_federais_obs: order.fat_retencoes_federais_obs || "",
    fat_retencoes_federais_pendente: order.fat_retencoes_federais_pendente || false,
    fat_limite_emissao_ok: order.fat_limite_emissao_ok || false,
    fat_limite_emissao_obs: order.fat_limite_emissao_obs || "",
    fat_limite_emissao_pendente: order.fat_limite_emissao_pendente || false,
    fat_envio_nf_ok: order.fat_envio_nf_ok || false,
    fat_envio_nf_obs: order.fat_envio_nf_obs || "",
    fat_envio_nf_pendente: order.fat_envio_nf_pendente || false,
    fat_ocpp_ok: order.fat_ocpp_ok || false,
    fat_ocpp_obs: order.fat_ocpp_obs || "",
    fat_ocpp_pendente: order.fat_ocpp_pendente || false,
    fat_restricao_credito_ok: order.fat_restricao_credito_ok || false,
    fat_restricao_credito_obs: order.fat_restricao_credito_obs || "",
    fat_restricao_credito_pendente: order.fat_restricao_credito_pendente || false,
  });

  const statusIdx = department.statuses.findIndex(s => s.id === currentStatus.id);
  const canMoveLeft = statusIdx > 0;
  const canMoveRight = statusIdx < department.statuses.length - 1;
  const isLastStatus = statusIdx === department.statuses.length - 1;
  const isExitStatus = ["saida", "finalizado"].includes(currentStatus.id) || isLastStatus;
  const isNearDeadline = useDeadlineAlert(order.prazo);
  const isOM = !!(order as any).om_numero;
  const isOC = !!(order as any).oc_numero;
  const isNC = !!(order as any).nc_numero;
  const isSpecialOrder = isOM || isOC || isNC;
  const isExpedicaoCopy = department.id === "expedicao" && !!order.parent_order_id;
  // Sector-specific urgency
  const isUrgentProva = order.urgente_prova;
  const isUrgentImpressao = order.urgente_impressao;
  const isUrgentAcabamento = order.urgente_acabamento;
  const isUrgentExpedicao = order.urgente_expedicao;
  const isUrgent = order.urgente;
  const sectorUrgent = isSpecialOrder
    ? order.urgente
    : (department.id === "expedicao" && isUrgentExpedicao) ||
      (department.id === "qualidade" && order.urgente) ||
      order.urgente;
  const shouldBlink = sectorUrgent || isNearDeadline;

  // Slow-approval alert for Embalagens (desenvolvimento) when in Aguard. Aprovação
  const approvalThresholdMs = order.saida_direta
    ? 1 * 3600000
    : order.prova_email
    ? 2 * 3600000
    : order.prova_digital
    ? 8 * 3600000
    : null;
  const APPROVAL_VERY_SLOW_THRESHOLD_MS = 48 * 3600000; // 2 business days
  const [isApprovalSlow, setIsApprovalSlow] = useState(false);
  const [isApprovalVerySlow, setIsApprovalVerySlow] = useState(false);
  const [approvalSince, setApprovalSince] = useState<Date | null>(null);

  // PERFORMANCE: usa cache compartilhado em batch (1 query agregada para todos os cards)
  // ao invés de 1 query por card. Reduz ~9,8M chamadas/sessão para ~1 por refresh.
  useEffect(() => {
    if (
      (department.id as string) !== "desenvolvimento" ||
      currentStatus.id !== "aguardando_aprovacao" ||
      approvalThresholdMs === null
    ) {
      setApprovalSince(null);
      return;
    }
    const unsubscribe = subscribeApprovalEntry(order.id, (entry) => {
      setApprovalSince(entry ?? new Date(order.created_at));
    });
    return unsubscribe;
  }, [department.id, currentStatus.id, order.id, order.created_at, approvalThresholdMs]);

  useEffect(() => {
    if (
      (department.id as string) !== "desenvolvimento" ||
      currentStatus.id !== "aguardando_aprovacao" ||
      approvalThresholdMs === null ||
      !approvalSince
    ) {
      setIsApprovalSlow(false);
      setIsApprovalVerySlow(false);
      return;
    }
    const check = () => {
      const elapsed = businessHoursMs(approvalSince, new Date());
      setIsApprovalVerySlow(elapsed >= APPROVAL_VERY_SLOW_THRESHOLD_MS);
      setIsApprovalSlow(elapsed >= approvalThresholdMs);
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [department.id, currentStatus.id, approvalSince, approvalThresholdMs]);

  const [omTipoEntrega, setOmTipoEntrega] = useState<string>(
    order.tipo_entrega && order.tipo_entrega.length > 0 ? order.tipo_entrega[0] : ""
  );

  const handleSave = () => {
    onUpdate(order.id, {
      titulo: editData.titulo,
      descricao: editData.descricao,
      cliente: editData.cliente,
      observacao: editData.observacao || null,
      urgente: editData.urgente_prova || editData.urgente_impressao || editData.urgente_acabamento || editData.urgente_expedicao,
      urgente_prova: editData.urgente_prova,
      urgente_impressao: editData.urgente_impressao,
      urgente_acabamento: editData.urgente_acabamento,
      urgente_expedicao: editData.urgente_expedicao,
      prazo: editData.prazo ? new Date(editData.prazo).toISOString() : null,
    });
    setEditing(false);
  };

  const handleSendToDepartment = () => {
    if (!selectedDept) return;
    if (selectedDept === "pre-impressao") {
      if (onSendBackToPrePress) {
        onSendBackToPrePress(order.id);
      }
      setSendDialogOpen(false);
      setOpen(false);
      setSelectedDept("");
      setSelectedMachine("");
      return;
    }
    const targetDept = DEPARTMENTS.find(d => d.id === selectedDept);
    if (targetDept?.machines && !selectedMachine) return;
    onSendToDepartment(order.id, selectedDept as Department, selectedMachine || undefined);
    setSendDialogOpen(false);
    setOpen(false);
    setSelectedDept("");
    setSelectedMachine("");
  };

  return (
    <>
      <div
        className={`group rounded-2xl border shadow-xs hover:shadow-lg backdrop-blur-xl transition-all duration-200 overflow-hidden relative ${
          sectorUrgent
            ? "bg-rose-500/10 border-rose-500/40 text-card-foreground"
            : isNearDeadline
            ? "bg-card/85 dark:bg-[#11212D]/85 border-amber-500/50 text-card-foreground"
            : "bg-card/85 dark:bg-[#11212D]/85 border-border/80 dark:border-[#4A5C6A]/35 text-card-foreground hover:border-[#9BA8AB]/60 hover:shadow-lg dark:hover:shadow-[0_12px_36px_rgba(6,20,27,0.65)]"
        } ${isNearDeadline && !sectorUrgent ? "animate-pulse" : ""}`}
      >
        {/* Faturamento: Empresa banner (Primacor / Imprimaset) with inline alerts */}
        {department.id === "faturamento" && (() => {
          const empresa = order.empresa_entrega?.toLowerCase() || "";
          const isPrimacor = empresa.includes("primacor");
          const isImprimaset = empresa.includes("imprimaset");
          const hasEmpresaBanner = isPrimacor || isImprimaset;
          const isOtherEmpresa = order.empresa_entrega && !isPrimacor && !isImprimaset;

          // Determine parent sector alert
          let alertType: "urgente" | "atencao" | null = null;
          let alertLabel = "";
          if (order.parent_order_id && currentStatus.id !== "saida" && parentSector) {
            const urgentSectors = ["acabamento", "expedicao"];
            const attentionSectors = ["ctp", "offset", "digital", "terceiros"];
            const sectorLabels: Record<string, string> = {
              acabamento: "Acabamento", expedicao: "Expedição", ctp: "CTP",
              offset: "Off-Set", digital: "Digital", terceiros: "Terceiros",
            };
            if (urgentSectors.includes(parentSector)) {
              alertType = "urgente";
              alertLabel = sectorLabels[parentSector] || parentSector;
            } else if (attentionSectors.includes(parentSector)) {
              alertType = "atencao";
              alertLabel = sectorLabels[parentSector] || parentSector;
            }
          }

          return (
            <>
              {/* Primacor / Imprimaset banner with alert inside */}
              {hasEmpresaBanner && (
                <div className={`px-2 py-0.5 relative flex items-center justify-center ${isPrimacor ? "bg-blue-600" : "bg-pink-600"} ${alertType === "urgente" ? "animate-pulse" : ""}`}>
                  {alertType && (
                    <span className={`absolute left-1 flex items-center gap-0.5 text-[8px] font-black uppercase px-1 py-0 rounded ${
                      alertType === "urgente" ? "bg-red-600 text-white" : "bg-amber-400 text-amber-900"
                    }`}>
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {alertType === "urgente" ? "Urgente" : "Atenção"}
                    </span>
                  )}
                  <span className="text-[10px] font-semibold text-white uppercase tracking-wide">
                    {isPrimacor ? "Primacor" : "Imprimaset"}
                  </span>
                </div>
              )}

              {/* Standalone alert when no empresa banner */}
              {!hasEmpresaBanner && !isOtherEmpresa && alertType === "urgente" && (
                <div className="bg-red-500 text-white text-[10px] font-bold text-center py-0.5 tracking-wide uppercase flex items-center justify-center gap-1 animate-pulse">
                  <AlertTriangle className="h-3 w-3" /> Urgente
                </div>
              )}
              {!hasEmpresaBanner && !isOtherEmpresa && alertType === "atencao" && (
                <div className="bg-amber-400 text-amber-900 text-[10px] font-bold text-center py-0.5 tracking-wide uppercase flex items-center justify-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Atenção
                </div>
              )}
            </>
          );
        })()}

        {/* Prova banners - only in Pré-Impressão (desenvolvimento) */}
        {(department.id as string) === "desenvolvimento" && (
          <>
            {order.saida_direta && (
              <div className="px-2 py-0.5 bg-amber-400 text-amber-900 text-center relative">
                {isApprovalVerySlow && (
                  <span className="absolute left-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-4 w-4 rounded-full bg-blue-600 ring-1 ring-white shadow">
                    <Clock className="h-3 w-3 animate-pulse" color="#fff" strokeWidth={2.5} />
                  </span>
                )}
                {!isApprovalVerySlow && isApprovalSlow && (
                  <Clock className="h-4 w-4 animate-pulse absolute left-1.5 top-1/2 -translate-y-1/2" fill="#3b82f6" color="#000" strokeWidth={2} />
                )}
                {isUrgentProva && !order.prova_digital && !order.prova_email && (
                  <span className={`mr-2 inline-block bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${shouldBlink ? "animate-pulse" : ""}`}>URGENTE</span>
                )}
                <span className="text-[10px] font-bold uppercase tracking-wide">Saída Direta</span>
              </div>
            )}
            {order.prova_digital && (
              <div className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/30 text-center relative">
                {isApprovalVerySlow && !order.saida_direta && (
                  <span className="absolute left-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-4 w-4 rounded-full bg-blue-600 ring-1 ring-white shadow">
                    <Clock className="h-3 w-3 animate-pulse" color="#fff" strokeWidth={2.5} />
                  </span>
                )}
                {!isApprovalVerySlow && isApprovalSlow && !order.saida_direta && (
                  <Clock className="h-4 w-4 animate-pulse absolute left-1.5 top-1/2 -translate-y-1/2" fill="#3b82f6" color="#000" strokeWidth={2} />
                )}
                {isUrgentProva && (
                  <span className={`mr-2 inline-block bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${shouldBlink ? "animate-pulse" : ""}`}>URGENTE</span>
                )}
                <span className="text-[10px] font-semibold text-[#CCD0CF] uppercase tracking-wide">Prova Digital</span>
              </div>
            )}
            {order.prova_email && (
              <div className="px-2 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-center relative">
                {isApprovalVerySlow && !order.saida_direta && !order.prova_digital && (
                  <span className="absolute left-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-4 w-4 rounded-full bg-blue-600 ring-1 ring-white shadow">
                    <Clock className="h-3 w-3 animate-pulse" color="#fff" strokeWidth={2.5} />
                  </span>
                )}
                {!isApprovalVerySlow && isApprovalSlow && !order.saida_direta && !order.prova_digital && (
                  <Clock className="h-4 w-4 animate-pulse absolute left-1.5 top-1/2 -translate-y-1/2" fill="#3b82f6" color="#000" strokeWidth={2} />
                )}
                {isUrgentProva && !order.prova_digital && (
                  <span className={`mr-2 inline-block bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${shouldBlink ? "animate-pulse" : ""}`}>URGENTE</span>
                )}
                <span className="text-[10px] font-semibold text-pink-700 dark:text-pink-300 uppercase tracking-wide">Prova E-mail</span>
              </div>
            )}
          </>
        )}
        {/* Standalone URGENTE banner - when sector is urgent but no specific banner is shown */}
        {sectorUrgent && !(department.id === "expedicao" && order.tipo_entrega && (order.tipo_entrega.includes("CARRO") || order.tipo_entrega.includes("MOTO") || order.tipo_entrega.includes("RETIRA"))) && (
          <div className={`bg-red-500 text-white text-[10px] font-bold text-center py-0.5 tracking-wide uppercase flex items-center justify-center gap-1 ${shouldBlink ? "animate-pulse" : ""}`}>
            <AlertTriangle className="h-3 w-3" /> Urgente
          </div>
        )}
        {isNearDeadline && !sectorUrgent && (
          <div className="bg-amber-500 text-white text-[10px] font-bold text-center py-0.5 tracking-wide uppercase flex items-center justify-center gap-1">
            <Clock className="h-3 w-3" /> Prazo Próximo
          </div>
        )}
        {department.id === "expedicao" && order.tipo_entrega && order.tipo_entrega.includes("CARRO") && (
          <div className="px-2 py-0.5 bg-pink-600 text-center relative">
            <span className="text-[10px] font-semibold text-white uppercase tracking-wide">Carro</span>
            {(isSpecialOrder ? isUrgent : isUrgentExpedicao) && (
              <span className={`ml-2 inline-block bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${shouldBlink ? "animate-pulse" : ""}`}>URGENTE</span>
            )}
            {isExpedicao && !order.parent_order_id && hasFaturamentoPendencia && (
              <span className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-4 w-4 rounded-sm bg-red-600 text-white text-[9px] font-bold" title="Pendência Faturamento">F</span>
            )}
          </div>
        )}
        {department.id === "expedicao" && order.tipo_entrega && order.tipo_entrega.includes("MOTO") && (
          <div className="px-2 py-0.5 bg-blue-600 text-center relative">
            <span className="text-[10px] font-semibold text-white uppercase tracking-wide">Moto</span>
            {(isSpecialOrder ? isUrgent : isUrgentExpedicao) && !order.tipo_entrega.includes("CARRO") && (
              <span className={`ml-2 inline-block bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${shouldBlink ? "animate-pulse" : ""}`}>URGENTE</span>
            )}
            {isExpedicao && !order.parent_order_id && hasFaturamentoPendencia && !order.tipo_entrega.includes("CARRO") && (
              <span className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-4 w-4 rounded-sm bg-red-600 text-white text-[9px] font-bold" title="Pendência Faturamento">F</span>
            )}
          </div>
        )}
        {department.id === "expedicao" && order.tipo_entrega && order.tipo_entrega.includes("RETIRA") && (
          <div className="px-2 py-0.5 bg-yellow-500 text-center relative">
            <span className="text-[10px] font-semibold text-black uppercase tracking-wide">Retira</span>
            {(isSpecialOrder ? isUrgent : isUrgentExpedicao) && !order.tipo_entrega.includes("CARRO") && !order.tipo_entrega.includes("MOTO") && (
              <span className={`ml-2 inline-block bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${shouldBlink ? "animate-pulse" : ""}`}>URGENTE</span>
            )}
            {isExpedicao && !order.parent_order_id && hasFaturamentoPendencia && !order.tipo_entrega.includes("CARRO") && !order.tipo_entrega.includes("MOTO") && (
              <span className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-4 w-4 rounded-sm bg-red-600 text-white text-[9px] font-bold" title="Pendência Faturamento">F</span>
            )}
          </div>
        )}
        {/* Faturamento pendencia flag for Expedição cards without banners */}
        {isExpedicao && !order.parent_order_id && hasFaturamentoPendencia && (!order.tipo_entrega || (!order.tipo_entrega.includes("CARRO") && !order.tipo_entrega.includes("MOTO") && !order.tipo_entrega.includes("RETIRA"))) && (
          <div className="px-2 py-0.5 flex justify-end">
            <span className="inline-flex items-center justify-center h-4 w-4 rounded-sm bg-red-600 text-white text-[9px] font-bold" title="Pendência Faturamento">F</span>
          </div>
        )}


        {!readOnly && dragHandleProps && (
          <div
            {...dragHandleProps}
            className="flex items-center justify-center py-1 cursor-grab active:cursor-grabbing hover:bg-black/5 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
          </div>
        )}

        <div className="px-3.5 pb-3 cursor-pointer" onClick={() => setOpen(true)}>
          {isOM ? (
            <>
              {/* OM card: Linha 1: OM Number + Equipamento */}
              <div className="flex items-start gap-2 min-w-0">
                {isUrgent && <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-red-500" />}
                <h4 className={`font-semibold text-sm shrink-0 ${isUrgent ? "text-red-700 dark:text-red-400" : "text-card-foreground"}`}>
                  OM. {String((order as any).om_numero).padStart(4, "0")}
                </h4>
                {order.parent_order_id && (
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-orange-600 text-white text-[10px] font-bold shrink-0" title="Sub-ordem de Manutenção">M</span>
                )}
                {(order as any).equipamento_manut && (
                  <span className="text-sm text-muted-foreground min-w-0 font-bold break-words">
                    {(order as any).equipamento_manut}
                  </span>
                )}
              </div>
              {/* Linha 2: Setor + Responsável */}
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground min-w-0">
                {(order as any).setor_manut && (
                  <span className="truncate min-w-0">{(order as any).setor_manut}</span>
                )}
                {(order as any).responsavel_manut && (
                  <span className="shrink-0 ml-auto flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {(order as any).responsavel_manut}
                  </span>
                )}
              </div>
              {/* Linha 3: Fornecedor + Endereço */}
              {((order as any).fornecedor_manut || (order as any).endereco_manut) && (
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/70">
                  {(order as any).fornecedor_manut && <span className="truncate">Forn: {(order as any).fornecedor_manut}</span>}
                  {(order as any).endereco_manut && <span className="shrink-0 ml-auto">End: {(order as any).endereco_manut}</span>}
                </div>
              )}
            </>
          ) : isOC ? (
            <>
              {/* OC card in Expedição */}
              <div className="flex items-start gap-2 min-w-0">
                {isUrgent && <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-red-500" />}
                <h4 className={`font-semibold text-sm shrink-0 ${isUrgent ? "text-red-700 dark:text-red-400" : "text-card-foreground"}`}>
                  OC. {String((order as any).oc_numero).padStart(4, "0")}
                </h4>
                {order.parent_order_id && (
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-green-600 text-white text-[10px] font-bold shrink-0" title="Sub-ordem de Compra">C</span>
                )}
              </div>
              {/* Linha 2: Descrição + Responsável */}
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground min-w-0">
                {order.descricao && order.descricao !== "-" && (
                  <span className="truncate min-w-0">{order.descricao}</span>
                )}
                {(order as any).responsavel_compra && (
                  <span className="shrink-0 ml-auto flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {(order as any).responsavel_compra}
                  </span>
                )}
              </div>
              {/* Linha 3: Fornecedor + Endereço */}
              {((order as any).fornecedor_compra || (order as any).endereco_compra) && (
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/70">
                  {(order as any).fornecedor_compra && <span className="truncate">Forn: {(order as any).fornecedor_compra}</span>}
                  {(order as any).endereco_compra && <span className="shrink-0 ml-auto">End: {(order as any).endereco_compra}</span>}
                </div>
              )}
            </>
          ) : isNC ? (
            <>
              {/* NC card in Expedição */}
              <div className="flex items-start gap-2 min-w-0">
                {isUrgent && <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-red-500" />}
                <h4 className={`font-semibold text-sm shrink-0 ${isUrgent ? "text-red-700 dark:text-red-400" : "text-card-foreground"}`}>
                  NC. {String((order as any).nc_numero).padStart(4, "0")}
                </h4>
                {order.parent_order_id && (
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-600 text-white text-[10px] font-bold shrink-0" title="Sub-ordem de Não Conformidade">NC</span>
                )}
                <span className="text-sm text-muted-foreground min-w-0 font-bold break-words truncate uppercase">
                  {order.cliente}
                </span>
              </div>
              {/* Linha 2: Descrição da falha */}
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground min-w-0">
                {order.descricao && order.descricao !== "-" && (
                  <span className="truncate min-w-0">{order.descricao}</span>
                )}
              </div>
              {/* Linha 3: Reclamante + Endereço */}
              {((order as any).reclamante_nc || (order as any).endereco_nc) && (
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/70">
                  {(order as any).reclamante_nc && <span className="truncate">Recl: {(order as any).reclamante_nc}</span>}
                  {(order as any).endereco_nc && <span className="shrink-0 ml-auto">End: {(order as any).endereco_nc}</span>}
                </div>
              )}
            </>
          ) : (
            <>
          {/* Linha 1: Cliente (Primeiro em cima) */}
          <div className="flex items-start gap-1.5 min-w-0">
            {isUrgent && <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-red-500 mt-0.5" />}
            <span className="flex items-center gap-1.5 text-sm text-foreground min-w-0 font-bold break-words leading-tight">
              <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="break-words uppercase">{order.cliente}</span>
            </span>
          </div>

          {/* Linha 2: OS + Badges */}
          <div className="flex items-center gap-2 mt-1.5 min-w-0">
            <h4 className={`font-semibold text-[15px] shrink-0 ${isUrgent ? "text-red-700 dark:text-red-400" : "text-card-foreground"}`}>
              OS. {order.titulo}
            </h4>
            {getOrderRevision(order) >= 2 && (
              <span
                className="font-mono-tech text-[13px] font-extrabold px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 shrink-0 flex items-center gap-1 shadow-xs tracking-wide"
                title={`Revisão ${getOrderRevision(order)}`}
              >
                <RotateCcw className="h-3 w-3" />
                <span>REV{getOrderRevision(order)}</span>
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
            {department.id === "faturamento" && order.parent_order_id && (
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-purple-600 text-white text-[10px] font-bold shrink-0" title="OS de Faturamento (sub-ordem)">F</span>
            )}
            {department.id === "expedicao" && order.parent_order_id && !isOM && !isOC && !isNC && (
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0" title="Prova — enviada da Pré-Impressão">P</span>
            )}
          </div>
          {/* Linha 2: Descrição (largura completa) */}
          {order.descricao && order.descricao !== "-" && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground min-w-0">
              <span className="truncate min-w-0">{order.descricao}</span>
            </div>
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
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-200 dark:text-amber-300 bg-amber-950/30 border border-amber-500/40 px-1.5 py-0.5 rounded-md shadow-2xs"
                title={`Operador responsável: ${order.operador}`}
              >
                <HardHat className="h-3 w-3 text-amber-400 shrink-0" />
                <span>{order.operador}</span>
              </span>
            </div>
          )}
          {/* Linha 3: OBS / Motivo da Parada */}
          {(currentStatus.id === "paralisado" || currentStatus.id === "aguardando_novo_arquivo") ? (
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
          ) : (
            department.id !== "faturamento" && order.observacao && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{order.observacao}</p>
            )
          )}
            </>
          )}

          {/* Faturamento-specific: only delivery date on card */}
          {department.id === "faturamento" && (order.prazo || order.entrega_data_limite) && (
            <div className={`flex items-center gap-1 mt-1 text-[10px] font-semibold ${
              (order.prazo && new Date(order.prazo).getTime() <= Date.now()) || 
              (order.entrega_data_limite && new Date(order.entrega_data_limite).getTime() <= Date.now()) 
                ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
            }`}>
              <Calendar className="h-3 w-3" /> Entrega: {format(new Date(order.entrega_data_limite || order.prazo!), "dd/MM/yyyy'-'HH:mm", { locale: ptBR })}
            </div>
           )}

          {/* Faturamento: OBS Gerais read-only on card (only if has content) */}
          {department.id === "faturamento" && order.observacao && (
            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 italic border-t border-dashed pt-1">
              <span className="font-semibold not-italic">OBS:</span> {order.observacao}
            </p>
          )}
          {/* Faturamento: show pending checklist items when in Pendência column */}
          {department.id === "faturamento" && order.setor_status === "pendencia" && (() => {
            const pendingItems: { label: string; obs: string | null }[] = [];
            if (order.fat_cnpj_pendente) pendingItems.push({ label: "CNPJ", obs: order.fat_cnpj_obs });
            if (order.fat_retencao_iss_pendente) pendingItems.push({ label: "Retenção ISS", obs: order.fat_retencao_iss_obs });
            if (order.fat_retencoes_federais_pendente) pendingItems.push({ label: "Ret. Federais", obs: order.fat_retencoes_federais_obs });
            if (order.fat_limite_emissao_pendente) pendingItems.push({ label: "Limite Emissão", obs: order.fat_limite_emissao_obs });
            if (order.fat_envio_nf_pendente) pendingItems.push({ label: "Envio NF", obs: order.fat_envio_nf_obs });
            if (order.fat_ocpp_pendente) pendingItems.push({ label: "OC/PP", obs: order.fat_ocpp_obs });
            if (order.fat_restricao_credito_pendente) pendingItems.push({ label: "Restr. Crédito", obs: order.fat_restricao_credito_obs });
            if (pendingItems.length === 0) return null;
            return (
              <div className="mt-1.5 border-t border-dashed pt-1 space-y-0.5">
                {pendingItems.map((item) => (
                  <div key={item.label} className="flex items-start gap-1 text-[10px] text-red-600 dark:text-red-400">
                    <span className="font-medium">• {item.label}</span>
                    {item.obs && <span className="text-muted-foreground italic truncate">— {item.obs}</span>}
                  </div>
                ))}
              </div>
            );
          })()}
          {/* Non-faturamento: prazo + expandable details */}
          {department.id !== "faturamento" && (
            <>
              {order.prazo && (
                <div className={`flex items-center gap-1 mt-1 text-[10px] font-semibold ${isNearDeadline ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                  <Clock className="h-3 w-3" /> Prazo: {format(new Date(order.prazo), "dd/MM HH:mm", { locale: ptBR })}
                </div>
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
                    const style = getSpecialSupplyBadgeClasses(item.id, isSent);
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
                            toast.success(`${item.label} marcado como ENVIADO! Registrado no sistema.`);
                          } else {
                            toast.info(`${item.label} alterado para PENDENTE.`);
                          }
                        }}
                        title={
                          isSent
                            ? `${item.label}: ENVIADO ${formattedTime ? `em ${formattedTime}` : ""}${op ? ` por ${op}` : ""} (Clique para alterar para pendente)`
                            : `${item.label}: PENDENTE (Clique para marcar como enviado)`
                        }
                        className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase transition-all flex items-center gap-1 shadow-xs cursor-pointer border ${style.badge}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                        <span>{item.label}</span>
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

              {/* Processos badges adicionais */}
              {order.processos && order.processos.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {sortAndFilterProcessos(order.processos).map((p) => (
                      <span key={p} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getProcessoCor(p)}`}>{p}</span>
                    ))}
                </div>
              )}
            </>
          )}

          {updatedByName && (
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/60">
              <UserCheck className="h-2.5 w-2.5" /> <span>{updatedByName}</span>
              <Clock className="h-2.5 w-2.5 ml-1" />
              <span>{format(new Date(order.updated_at), "dd/MM HH:mm", { locale: ptBR })}</span>
            </div>
          )}
        </div>

        {/* CTP & Digital: Voltar para Pré-Impressão OU O.S Concluídas */}
        {!readOnly && isExitStatus && (department.id === "ctp" || department.id === "digital") && (
          <div className="flex flex-col border-t border-border/70 divide-y divide-border/60">
            <div className="grid grid-cols-2 divide-x divide-border/60">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSendBackToPrePress) {
                    onSendBackToPrePress(order.id);
                  }
                }}
                className="py-2.5 px-2 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 dark:text-sky-300"
                title="Voltar para Pré-Impressão"
              >
                <Undo2 className="h-3.5 w-3.5 shrink-0" /> Pré-Impressão
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(order.id);
                }}
                className="py-2.5 px-2 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                title="Mover para O.S Concluídas"
              >
                <CheckCircle className="h-3.5 w-3.5 shrink-0" /> O.S Concluídas
              </button>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSendDialogOpen(true); }}
              className="py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 flex items-center justify-center gap-1 transition-colors"
              title="Ou enviar para outro setor"
            >
              <Send className="h-3 w-3" /> Outro Setor...
            </button>
          </div>
        )}

        {/* Send to next department button when in exit/final status (demais setores) */}
        {!readOnly && isExitStatus && department.id !== "faturamento" && department.id !== "ctp" && department.id !== "digital" && !isExpedicaoCopy && (
          <button
            onClick={(e) => { e.stopPropagation(); setSendDialogOpen(true); }}
            className="w-full py-2 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-colors"
            style={{
              backgroundColor: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
            }}
          >
            <Send className="h-3.5 w-3.5" /> Enviar → Próximo Setor
          </button>
        )}
        {/* Expedition copies: archive button in exit status */}
        {!readOnly && isExitStatus && isExpedicaoCopy && (
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(order.id); }}
            className="w-full py-2 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-colors"
            style={{
              backgroundColor: "hsl(142 76% 36%)",
              color: "white",
            }}
          >
            <Archive className="h-3.5 w-3.5" /> Arquivar
          </button>
        )}
        {/* Faturamento: archive button in exit status */}
        {!readOnly && isExitStatus && department.id === "faturamento" && (
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(order.id); }}
            className="w-full py-2 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-colors"
            style={{
              backgroundColor: "hsl(142 76% 36%)",
              color: "white",
            }}
          >
            <Archive className="h-3.5 w-3.5" /> Arquivar
          </button>
        )}
      </div>

      {/* Details Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-none border border-border bg-card text-card-foreground shadow-2xl backdrop-blur-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {isOM
                ? `OM. ${String((order as any).om_numero).padStart(4, "0")}`
                : isOC
                ? `OC. ${String((order as any).oc_numero).padStart(4, "0")}`
                : isNC
                ? `NC. ${String((order as any).nc_numero).padStart(4, "0")}`
                : editing ? "Editar OS." : "Detalhes da OS."}
            </DialogTitle>
          </DialogHeader>

          {editing && !isSpecialOrder ? (
            <div className="space-y-4">
              <div><Label>Número OS.</Label><Input value={editData.titulo} onChange={(e) => setEditData(d => ({ ...d, titulo: e.target.value }))} /></div>
              <div><Label>Nome Cliente</Label><Input value={editData.cliente} onChange={(e) => setEditData(d => ({ ...d, cliente: e.target.value }))} /></div>
              <div><Label>Descrição</Label><Textarea value={editData.descricao} onChange={(e) => setEditData(d => ({ ...d, descricao: e.target.value }))} /></div>
              <div><Label>Observação</Label><Textarea value={editData.observacao} onChange={(e) => setEditData(d => ({ ...d, observacao: e.target.value }))} /></div>
              <div className="space-y-3 pt-2 border-t">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Urgência por Setor</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox id="prod-edit-urgente-prova" checked={editData.urgente_prova} onCheckedChange={(v) => setEditData(d => ({ ...d, urgente_prova: !!v }))} />
                    <Label htmlFor="prod-edit-urgente-prova" className="text-xs cursor-pointer font-semibold text-red-600 dark:text-red-400">Prova</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="prod-edit-urgente-impressao" checked={editData.urgente_impressao} onCheckedChange={(v) => setEditData(d => ({ ...d, urgente_impressao: !!v }))} />
                    <Label htmlFor="prod-edit-urgente-impressao" className="text-xs cursor-pointer font-semibold text-red-600 dark:text-red-400">Impressão</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="prod-edit-urgente-acabamento" checked={editData.urgente_acabamento} onCheckedChange={(v) => setEditData(d => ({ ...d, urgente_acabamento: !!v }))} />
                    <Label htmlFor="prod-edit-urgente-acabamento" className="text-xs cursor-pointer font-semibold text-red-600 dark:text-red-400">Acabamento</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="prod-edit-urgente-expedicao" checked={editData.urgente_expedicao} onCheckedChange={(v) => setEditData(d => ({ ...d, urgente_expedicao: !!v }))} />
                    <Label htmlFor="prod-edit-urgente-expedicao" className="text-xs cursor-pointer font-semibold text-red-600 dark:text-red-400">Expedição</Label>
                  </div>
                </div>
                {(editData.urgente_prova || editData.urgente_impressao || editData.urgente_acabamento || editData.urgente_expedicao) && (
                  <div className="ml-6">
                    <Label htmlFor="prod-edit-prazo" className="text-xs font-medium">Prazo (data e hora limite)</Label>
                    <Input id="prod-edit-prazo" type="datetime-local" value={editData.prazo} onChange={(e) => setEditData(d => ({ ...d, prazo: e.target.value }))} className="mt-1" />
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
                <Button onClick={handleSave}>Salvar</Button>
              </div>
            </div>
          ) : (
            <div className={isExpedicao ? "space-y-1.5" : "space-y-4"}>
              <div>
                <p className="text-sm text-muted-foreground">Setor</p>
                <Badge className="mt-1" style={{ backgroundColor: `hsl(var(--status-${currentStatus.colorKey}-bg))`, color: `hsl(var(--status-${currentStatus.colorKey}))`, border: `1px solid hsl(var(--status-${currentStatus.colorKey}) / 0.3)` }}>
                  {department.label.toUpperCase()} → {currentStatus.label.toUpperCase()}
                </Badge>
              </div>
              {order.urgente && (
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold text-sm">
                  <AlertTriangle className="h-4 w-4" /> Urgente
                </div>
              )}

              {/* OM detail view */}
              {isOM ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground text-xs">Equipamento:</span><p className="font-medium">{(order as any).equipamento_manut || "—"}</p></div>
                    <div><span className="text-muted-foreground text-xs">Setor:</span><p className="font-medium">{(order as any).setor_manut || "—"}</p></div>
                  </div>
                  <div><span className="text-muted-foreground text-xs">Responsável:</span><p className="text-sm font-medium">{(order as any).responsavel_manut || "—"}</p></div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground text-xs">Fornecedor:</span><p>{(order as any).fornecedor_manut || "—"}</p></div>
                    <div><span className="text-muted-foreground text-xs">Endereço:</span><p>{(order as any).endereco_manut || "—"}</p></div>
                  </div>
                  {order.descricao && order.descricao !== "-" && (
                    <div><span className="text-muted-foreground text-xs">Descrição:</span><p className="text-sm">{order.descricao}</p></div>
                  )}

                  {/* Tipo Entrega - editable */}
                  <div className="border-t pt-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Tipo de Expedição</Label>
                    <div className="flex gap-2">
                      {[
                        { id: "carro", label: "CARRO", color: "bg-pink-600 text-white" },
                        { id: "moto", label: "MOTO", color: "bg-blue-600 text-white" },
                        { id: "retira", label: "RETIRA", color: "bg-yellow-500 text-black" },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={readOnly}
                          onClick={() => {
                            const newTipo = opt.id.toUpperCase();
                            setOmTipoEntrega(newTipo);
                            onUpdate(order.id, { tipo_entrega: [newTipo] } as any);
                          }}
                          className={`px-4 py-1.5 rounded text-xs font-bold transition-all ${
                            omTipoEntrega.toUpperCase() === opt.id.toUpperCase()
                              ? `${opt.color} ring-2 ring-offset-1 ring-primary/40 scale-105`
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : isOC ? (
                <div className="space-y-3">
                  <div><span className="text-muted-foreground text-xs">Descrição:</span><p className="text-sm">{order.descricao}</p></div>
                  <div><span className="text-muted-foreground text-xs">Responsável:</span><p className="text-sm font-medium">{(order as any).responsavel_compra || "—"}</p></div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground text-xs">Fornecedor:</span><p>{(order as any).fornecedor_compra || "—"}</p></div>
                    <div><span className="text-muted-foreground text-xs">Endereço:</span><p>{(order as any).endereco_compra || "—"}</p></div>
                  </div>

                  {/* Tipo Entrega - editable */}
                  <div className="border-t pt-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Tipo de Expedição</Label>
                    <div className="flex gap-2">
                      {[
                        { id: "carro", label: "CARRO", color: "bg-pink-600 text-white" },
                        { id: "moto", label: "MOTO", color: "bg-blue-600 text-white" },
                        { id: "retira", label: "RETIRA", color: "bg-yellow-500 text-black" },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={readOnly}
                          onClick={() => {
                            const newTipo = opt.id.toUpperCase();
                            setOmTipoEntrega(newTipo);
                            onUpdate(order.id, { tipo_entrega: [newTipo] } as any);
                          }}
                          className={`px-4 py-1.5 rounded text-xs font-bold transition-all ${
                            omTipoEntrega.toUpperCase() === opt.id.toUpperCase()
                              ? `${opt.color} ring-2 ring-offset-1 ring-primary/40 scale-105`
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : isNC ? (
                <div className="space-y-3">
                  <div><span className="text-muted-foreground text-xs">Cliente:</span><p className="text-sm font-medium">{order.cliente}</p></div>
                  {(order as any).os_ref_nc && <div><span className="text-muted-foreground text-xs">Nº OS:</span><p className="text-sm">{(order as any).os_ref_nc}</p></div>}
                  <div><span className="text-muted-foreground text-xs">Descrição da Falha:</span><p className="text-sm">{order.descricao}</p></div>
                  {(order as any).reclamante_nc && <div><span className="text-muted-foreground text-xs">Reclamante:</span><p className="text-sm">{(order as any).reclamante_nc}</p></div>}
                  {(order as any).endereco_nc && <div><span className="text-muted-foreground text-xs">Endereço:</span><p className="text-sm">{(order as any).endereco_nc}</p></div>}

                  {/* Tipo Entrega - editable */}
                  <div className="border-t pt-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Tipo de Expedição</Label>
                    <div className="flex gap-2">
                      {[
                        { id: "carro", label: "CARRO", color: "bg-pink-600 text-white" },
                        { id: "moto", label: "MOTO", color: "bg-blue-600 text-white" },
                        { id: "retira", label: "RETIRA", color: "bg-yellow-500 text-black" },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={readOnly}
                          onClick={() => {
                            const newTipo = opt.id.toUpperCase();
                            setOmTipoEntrega(newTipo);
                            onUpdate(order.id, { tipo_entrega: [newTipo] } as any);
                          }}
                          className={`px-4 py-1.5 rounded text-xs font-bold transition-all ${
                            omTipoEntrega.toUpperCase() === opt.id.toUpperCase()
                              ? `${opt.color} ring-2 ring-offset-1 ring-primary/40 scale-105`
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : department.id === "faturamento" ? (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div><span className="text-muted-foreground">OS:</span> <span className="font-medium">{order.titulo}</span></div>
                    <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{order.cliente}</span></div>
                    {order.vendedor && <div><span className="text-muted-foreground">Vendedor:</span> {order.vendedor}</div>}
                    {order.prazo && (
                      <div className={isNearDeadline ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                        <span className="text-muted-foreground">Prazo:</span> {format(new Date(order.prazo), "dd/MM/yyyy'-'HH:mm", { locale: ptBR })}
                      </div>
                    )}
                  </div>
                  {order.descricao && order.descricao !== "-" && (
                    <div className="text-xs"><span className="text-muted-foreground">Desc:</span> {order.descricao}</div>
                  )}

                  {/* Expedição - compact */}
                  <div className="border-t pt-2 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Expedição</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      {order.nf && <div><span className="text-muted-foreground">NF:</span> <span className="font-medium">{order.nf}</span></div>}
                      {order.protocolo && <div><span className="text-muted-foreground">Protocolo:</span> <span className="font-medium">{order.protocolo}</span></div>}
                      {order.empresa_entrega && <div><span className="text-muted-foreground">Da:</span> {order.empresa_entrega}</div>}
                      
                      {order.entrega_data_limite && (
                        <div className={new Date(order.entrega_data_limite).getTime() <= Date.now() ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                          <span className="text-muted-foreground">Entrega:</span> {format(new Date(order.entrega_data_limite), "dd/MM/yyyy'-'HH:mm", { locale: ptBR })}
                        </div>
                      )}
                      {order.entrega_para && <div><span className="text-muted-foreground">Para:</span> {order.entrega_para}</div>}
                    </div>
                    {order.entrega_endereco && (
                      <div className="text-xs"><span className="text-muted-foreground">Endereço:</span> {order.entrega_endereco}</div>
                    )}
                    {order.entrega_ac && (
                      <div className="text-xs"><span className="text-muted-foreground">A/C:</span> {order.entrega_ac}</div>
                    )}
                    {order.obs_entrega && (
                      <div className="text-xs italic"><span className="text-muted-foreground">OBS Exp.:</span> {order.obs_entrega}</div>
                    )}
                  </div>
                </div>
              ) : isExpedicao ? (
                <div className="space-y-0">
                  <div className="text-sm font-bold leading-tight">{order.titulo} — {order.cliente}</div>
                  {order.descricao && order.descricao !== "-" && (
                    <div className="text-xs leading-tight mt-0.5">{order.descricao}</div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {order.vendedor && <span>Vendedor: <span className="text-foreground">{order.vendedor}</span></span>}
                  </div>
                  {order.prazo && (
                    <div className="flex items-center gap-1 text-xs mt-0.5">
                      <span className="text-muted-foreground">Prazo:</span>
                      <span className={`font-semibold ${isNearDeadline ? "text-red-600 dark:text-red-400" : ""}`}>
                        {format(new Date(order.prazo), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  )}
                  {order.observacao && (
                    <div className="text-xs italic text-muted-foreground mt-0.5">OBS: {order.observacao}</div>
                  )}
                </div>
              ) : (
                <>
                  {order.prazo && (
                    <div>
                      <p className="text-sm text-muted-foreground">Prazo</p>
                      <p className={`text-sm font-semibold ${isNearDeadline ? "text-red-600 dark:text-red-400" : ""}`}>
                        {format(new Date(order.prazo), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  )}
                  <div><p className="text-sm text-muted-foreground">Número OS.</p><p className="font-medium">{order.titulo}</p></div>
                  <div><p className="text-sm text-muted-foreground">Nome Cliente</p><p>{order.cliente}</p></div>
                  {order.descricao && order.descricao !== "-" && (
                    <div><p className="text-sm text-muted-foreground">Descrição</p><p className="text-sm">{order.descricao}</p></div>
                  )}
                  {order.observacao && (
                    <div><p className="text-sm text-muted-foreground">Observação</p><p className="text-sm">{order.observacao}</p></div>
                  )}
                  {order.maquina && (
                    <div><p className="text-sm text-muted-foreground">Máquina</p><p className="text-sm font-bold">{order.maquina}</p></div>
                  )}
                  {order.vendedor && (
                    <div><p className="text-sm text-muted-foreground">Vendedor</p><p className="text-sm">{order.vendedor}</p></div>
                  )}
                </>
               )}

              {/* Expedição: editable expedition fields */}
              {isExpedicao && !isSpecialOrder && !editing && (
                <div className="border-t pt-1.5 space-y-0.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Expedição</p>

                  {/* Tipo Entrega: MOTO / CARRO / RETIRA (multiple selection) */}
                  <div className="flex items-center gap-4 flex-wrap">
                    {["MOTO", "CARRO", "RETIRA"].map((tipo) => (
                      <div key={tipo} className="flex items-center gap-2">
                        <Checkbox
                          id={`exp-entrega-${tipo}`}
                          checked={expData.tipo_entrega.includes(tipo)}
                          disabled={readOnly || !isExpedicaoEntrada}
                          onCheckedChange={() => {
                            const newTipos = expData.tipo_entrega.includes(tipo)
                              ? expData.tipo_entrega.filter((t: string) => t !== tipo)
                              : [...expData.tipo_entrega, tipo];
                            setExpData(d => ({ ...d, tipo_entrega: newTipos }));
                            onUpdate(order.id, { tipo_entrega: newTipos.length > 0 ? newTipos : null } as any);
                          }}
                        />
                        <Label htmlFor={`exp-entrega-${tipo}`} className={`text-sm cursor-pointer font-semibold px-2 py-0.5 rounded text-xs ${
                          expData.tipo_entrega.includes(tipo)
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

                  {/* Entregar com: NF / Protocolo */}
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">Entregar com</Label>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="exp-tem-nf"
                          checked={expData.tem_nf}
                          disabled={readOnly || !isExpedicaoEntrada}
                          onCheckedChange={(checked) => {
                            const val = checked === true;
                            setExpData(d => ({ ...d, tem_nf: val }));
                            onUpdate(order.id, { nf: val ? "SIM" : null } as any);
                          }}
                        />
                        <Label htmlFor="exp-tem-nf" className="text-sm cursor-pointer font-semibold">NF</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="exp-tem-protocolo"
                          checked={expData.tem_protocolo}
                          disabled={readOnly || !isExpedicaoEntrada}
                          onCheckedChange={(checked) => {
                            const val = checked === true;
                            setExpData(d => ({ ...d, tem_protocolo: val }));
                            onUpdate(order.id, { protocolo: val ? "SIM" : null } as any);
                          }}
                        />
                        <Label htmlFor="exp-tem-protocolo" className="text-sm cursor-pointer font-semibold">Protocolo</Label>
                      </div>
                    </div>
                  </div>

                  {/* Da: PRIMACOR / IMPRIMASET / CLIENTE */}
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Da</Label>
                    <RadioGroupBase
                      value={expData.empresa_entrega}
                      onValueChange={(v) => {
                        setExpData(d => ({ ...d, empresa_entrega: v }));
                        onUpdate(order.id, { empresa_entrega: v || null } as any);
                      }}
                      className="flex items-center gap-4 mt-1"
                      disabled={readOnly || !isExpedicaoEntrada}
                    >
                      {["PRIMACOR", "IMPRIMASET", "CLIENTE"].map((emp) => (
                        <div key={emp} className="flex items-center gap-2">
                          <RadioGroupItem value={emp} id={`exp-empresa-${emp}`} />
                          <Label htmlFor={`exp-empresa-${emp}`} className={`text-sm cursor-pointer font-semibold px-2 py-0.5 rounded text-xs ${
                            expData.empresa_entrega === emp
                              ? emp === "PRIMACOR" ? "bg-blue-600 text-white"
                                : emp === "IMPRIMASET" ? "bg-pink-600 text-white"
                                : emp === "CLIENTE" ? "bg-yellow-500 text-black"
                                : ""
                              : ""
                          }`}>{emp === "IMPRIMASET" ? "Imprimaset" : emp.charAt(0) + emp.slice(1).toLowerCase()}</Label>
                        </div>
                      ))}
                    </RadioGroupBase>
                  </div>

                  {/* Endereço */}
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Endereço</Label>
                    <Input value={expData.entrega_endereco} disabled={readOnly || !isExpedicaoEntrada} className="h-9"
                      onChange={(e) => setExpData(d => ({ ...d, entrega_endereco: e.target.value }))}
                      onBlur={() => onUpdate(order.id, { entrega_endereco: expData.entrega_endereco || null } as any)}
                      placeholder="Endereço de entrega" />
                  </div>

                  {/* A/C */}
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">A/C</Label>
                    <Input value={expData.entrega_ac} disabled={readOnly || !isExpedicaoEntrada} className="h-9"
                      onChange={(e) => setExpData(d => ({ ...d, entrega_ac: e.target.value }))}
                      onBlur={() => onUpdate(order.id, { entrega_ac: expData.entrega_ac || null } as any)}
                      placeholder="Aos cuidados de..." />
                  </div>

                  {/* Data Entrega */}
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Data Entrega</Label>
                    <Input type="datetime-local" value={expData.entrega_data_limite} disabled={readOnly || !isExpedicaoEntrada} className="h-9"
                      onChange={(e) => {
                        setExpData(d => ({ ...d, entrega_data_limite: e.target.value }));
                        onUpdate(order.id, { entrega_data_limite: e.target.value ? new Date(e.target.value).toISOString() : null } as any);
                      }} />
                  </div>

                  {/* OBS */}
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">OBS</Label>
                    <Textarea value={expData.obs_entrega} disabled={readOnly || !isExpedicaoEntrada} className="min-h-[40px]"
                      onChange={(e) => setExpData(d => ({ ...d, obs_entrega: e.target.value }))}
                      onBlur={() => onUpdate(order.id, { obs_entrega: expData.obs_entrega || null } as any)}
                      placeholder="Observações da entrega..." />
                  </div>

                  {/* Entregue por / Entregue para / Data - always editable in all expedition stages */}
                  <div className="border-t pt-2 mt-1">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs uppercase text-muted-foreground">Entregue por</Label>
                        <Input value={expData.entregue_por} disabled={readOnly} className="h-9 bg-muted-foreground/20 dark:bg-muted-foreground/30"
                          onChange={(e) => setExpData(d => ({ ...d, entregue_por: e.target.value }))}
                          onBlur={() => onUpdate(order.id, { entregue_por: expData.entregue_por || null } as any)}
                          placeholder="Quem entregou" />
                      </div>
                      <div>
                        <Label className="text-xs uppercase text-muted-foreground">Entregue para</Label>
                        <Input value={expData.entregue_para} disabled={readOnly} className="h-9 bg-muted-foreground/20 dark:bg-muted-foreground/30"
                          onChange={(e) => setExpData(d => ({ ...d, entregue_para: e.target.value }))}
                          onBlur={() => onUpdate(order.id, { entregue_para: expData.entregue_para || null } as any)}
                          placeholder="Quem recebeu" />
                      </div>
                      <div>
                        <Label className="text-xs uppercase text-muted-foreground">Data</Label>
                        <Input type="datetime-local" value={expData.entregue_em} disabled={readOnly} className="h-9 bg-muted-foreground/20 dark:bg-muted-foreground/30"
                          onChange={(e) => {
                            setExpData(d => ({ ...d, entregue_em: e.target.value }));
                            onUpdate(order.id, { entregue_em: e.target.value ? new Date(e.target.value).toISOString() : null } as any);
                          }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {department.id === "faturamento" && (
                <div className="border-t pt-2 space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Checklist Faturamento</p>
                  {([
                    { key: "fat_cnpj", label: "CNPJ" },
                    { key: "fat_retencao_iss", label: "Retenção ISS" },
                    { key: "fat_retencoes_federais", label: "Retenções Federais" },
                    { key: "fat_limite_emissao", label: "Limite data Emissão" },
                    { key: "fat_envio_nf", label: "Envio NF" },
                    { key: "fat_ocpp", label: "OC/PP Cliente" },
                    { key: "fat_restricao_credito", label: "Crédito" },
                  ] as const).map(({ key, label }) => {
                    const isOk = fatData[`${key}_ok` as keyof typeof fatData] as boolean;
                    const isPendente = fatData[`${key}_pendente` as keyof typeof fatData] as boolean;
                    return (
                      <div key={key} className="flex items-center gap-1.5">
                        <div className="w-[130px] text-xs font-medium shrink-0">{label}</div>
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => {
                            const newVal = !isOk;
                            const updates: Record<string, boolean> = { [`${key}_ok`]: newVal };
                            if (newVal) updates[`${key}_pendente`] = false;
                            setFatData(d => ({ ...d, ...updates }));
                            onUpdate(order.id, updates as Partial<Order>);
                          }}
                          className={`h-5 w-5 rounded-full border-2 flex items-center justify-center text-[8px] font-bold shrink-0 transition-colors ${
                            isOk
                              ? "border-green-600 bg-green-600 text-white"
                              : "border-muted-foreground/40 text-muted-foreground/60 hover:border-green-600/60"
                          }`}
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => {
                            const newVal = !isPendente;
                            const updates: Record<string, boolean> = { [`${key}_pendente`]: newVal };
                            if (newVal) updates[`${key}_ok`] = false;
                            setFatData(d => ({ ...d, ...updates }));
                            onUpdate(order.id, updates as Partial<Order>);
                          }}
                          className={`h-5 w-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold shrink-0 transition-colors ${
                            isPendente
                              ? "border-red-600 bg-red-600 text-white"
                              : "border-muted-foreground/40 text-muted-foreground/60 hover:border-red-600/60"
                          }`}
                        >
                          P
                        </button>
                        <Input
                          className="h-6 text-[11px] flex-1"
                          placeholder="OBS"
                          value={(fatData[`${key}_obs` as keyof typeof fatData] as string) || ""}
                          onChange={(e) => setFatData(d => ({ ...d, [`${key}_obs`]: e.target.value }))}
                          onBlur={(e) => {
                            onUpdate(order.id, { [`${key}_obs`]: e.target.value || null } as Partial<Order>);
                          }}
                          disabled={readOnly}
                        />
                      </div>
                    );
                  })}

                  {/* Observação Faturamento - at end of checklist */}
                  <div className="pt-1.5 space-y-0.5">
                    <Label className="text-[10px] font-semibold text-muted-foreground">Observação Faturamento</Label>
                    <Textarea
                      className="text-xs min-h-[36px] resize-none"
                      placeholder="Observação Faturamento..."
                      value={editData.observacao}
                      onChange={(e) => setEditData(d => ({ ...d, observacao: e.target.value }))}
                      onBlur={(e) => {
                        onUpdate(order.id, { observacao: e.target.value || null });
                      }}
                      disabled={readOnly}
                    />
                  </div>
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

                {/* Histórico e monitoramento de e-mails da O.S. */}
                <div className="pt-2 border-t">
                  <OrderEmailEventsSection
                    orderId={order.id}
                    orderTitulo={order.titulo}
                    orderStatus={order.status}
                    vendedorNome={order.vendedor}
                  />
                </div>
              </div>

              {!readOnly && (
                <div className="space-y-2 pt-2 border-t">
                  {department.id === "faturamento" ? (
                    <div className="flex items-center gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => { handleSave(); setOpen(false); }}>
                        <FileText className="h-4 w-4 mr-1" /> Salvar
                      </Button>
                      {isExitStatus && (
                        <Button size="sm" variant="outline" onClick={() => { onArchive(order.id); setOpen(false); }}>
                          <Archive className="h-4 w-4 mr-1" /> Arquivar
                        </Button>
                      )}
                      <Button size="sm" variant="destructive" onClick={() => { onDelete(order.id); setOpen(false); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : isSpecialOrder || isExpedicaoCopy ? (
                    /* OM/OC/NC/P copies in Expedição: Salvar + Arquivar + Excluir */
                    <div className="flex items-center gap-2">
                      <div className="flex-1" />
                      <Button size="sm" variant="outline" onClick={() => { handleSave(); setOpen(false); }}>
                        <FileText className="h-4 w-4 mr-1" /> Salvar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { onArchive(order.id); setOpen(false); }}>
                        <Archive className="h-4 w-4 mr-1" /> Arquivar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => { onDelete(order.id); setOpen(false); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    /* Other departments: full actions */
                    <>
                      <div className="flex items-center gap-2">
                        <div className="flex-1" />
                        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Editar</Button>
                        <Button size="sm" variant="outline" onClick={() => { onArchive(order.id); setOpen(false); }}>
                          <Archive className="h-4 w-4 mr-1" /> Arquivar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { onDelete(order.id); setOpen(false); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {onSendBackToPrePress && (
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() => { onSendBackToPrePress(order.id); setOpen(false); }}
                        >
                          <Undo2 className="h-4 w-4 mr-2" /> Voltar para Pré-Impressão
                        </Button>
                      )}
                      {isExitStatus && (department.id === "ctp" || department.id === "digital") && (
                        <Button
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                          onClick={() => { onArchive(order.id); setOpen(false); }}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" /> Mover para O.S Concluídas
                        </Button>
                      )}
                    </>
                  )}
                  {isExitStatus && !isExpedicaoCopy && !(isSpecialOrder && department.id === "expedicao") && (
                    <Button
                      className="w-full"
                      onClick={() => setSendDialogOpen(true)}
                      style={{ backgroundColor: "hsl(var(--primary))" }}
                    >
                      <Send className="h-4 w-4 mr-2" /> Enviar → Próximo Setor
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send to Department Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Enviar para qual setor?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Setor de destino</Label>
              <Select value={selectedDept} onValueChange={(v) => { setSelectedDept(v as Department | "pre-impressao"); setSelectedMachine(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre-impressao">Pré-Impressão</SelectItem>
                  {DEPARTMENTS.filter(d => d.id !== department.id).map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                  ))}
                  {department.id !== "expedicao" && (
                    <SelectItem value="expedicao">Expedição</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {selectedDept && DEPARTMENTS.find(d => d.id === selectedDept)?.machines && (
              <div>
                <Label>Máquina</Label>
                <Select value={selectedMachine} onValueChange={setSelectedMachine}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a máquina" /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.find(d => d.id === selectedDept)!.machines!.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button className="w-full" disabled={!selectedDept || (!!DEPARTMENTS.find(d => d.id === selectedDept)?.machines && !selectedMachine)} onClick={handleSendToDepartment}>
              <Send className="h-4 w-4 mr-2" /> Confirmar Envio
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

// PERFORMANCE: memo evita re-render dos ~275 cards quando outro card muda.
// Compara o objeto Order por referência (graças ao merge incremental do realtimeManager).
export const ProductionCard = memo(ProductionCardImpl, (prev, next) => {
  return (
    prev.order === next.order &&
    prev.currentStatus.id === next.currentStatus.id &&
    prev.department.id === next.department.id &&
    prev.updatedByName === next.updatedByName &&
    prev.createdByName === next.createdByName &&
    prev.readOnly === next.readOnly &&
    prev.hasFaturamentoPendencia === next.hasFaturamentoPendencia &&
    prev.parentSector === next.parentSector &&
    prev.onUpdate === next.onUpdate &&
    prev.onMove === next.onMove &&
    prev.onSendToDepartment === next.onSendToDepartment &&
    prev.onSendBackToPrePress === next.onSendBackToPrePress &&
    prev.onArchive === next.onArchive &&
    prev.onDelete === next.onDelete
  );
});

