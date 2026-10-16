import { useState, useEffect } from "react";
import { Order, OrderStatus, STATUS_CONFIG, STATUS_ORDER } from "@/types/order";
import { DEPARTMENTS, Department } from "@/types/production";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
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
  X,
} from "lucide-react";
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
  PROCESSO_GROUPS,
  ALL_PROCESSOS,
  getProcessoCor,
  ACABAMENTO_TIPOS,
  IMPRESSAO_TIPOS,
  IMPRESSAO_PROCESSOS,
  ACABAMENTO_GROUPS,
} from "@/lib/processos";
import { OrderAttachmentsSection } from "@/components/sharepoint/OrderAttachmentsSection";

const HIDDEN_PROCESSOS = [
  ...(ACABAMENTO_TIPOS as readonly string[]),
  ...IMPRESSAO_TIPOS.map((p) => p.sigla),
];
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
  if (!order) return null;

  const [editing, setEditing] = useState(false);
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
      cliente: editData.cliente,
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
                <p className="text-xs text-muted-foreground font-medium truncate max-w-md mt-0.5">
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
            <div className="space-y-4 p-6 overflow-y-auto max-h-[75vh]">
              {/* ═══ CABEÇALHO ═══ */}
              <div className="border rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Nº OS *</Label>
                    <Input
                      value={editData.titulo}
                      onChange={(e) => setEditData((d) => ({ ...d, titulo: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Cliente *</Label>
                    <Input
                      value={editData.cliente}
                      onChange={(e) => setEditData((d) => ({ ...d, cliente: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Descrição do Serviço</Label>
                  <Input
                    value={editData.descricao}
                    onChange={(e) => setEditData((d) => ({ ...d, descricao: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Vendedor *</Label>
                  <Select
                    value={editData.vendedor}
                    onValueChange={(v) => setEditData((d) => ({ ...d, vendedor: v }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Nome" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendedoresList.map((v) => (
                        <SelectItem key={v.id} value={v.nome}>
                          {v.nome}
                        </SelectItem>
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
                  <Textarea
                    value={editData.observacao}
                    onChange={(e) => setEditData((d) => ({ ...d, observacao: e.target.value }))}
                    placeholder="Observações gerais..."
                    className="min-h-[50px]"
                  />
                </div>
              </div>

              {/* ═══ PROVA ═══ */}
              <div className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Prova *
                  </Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-urgente-prova"
                      checked={editData.urgente_prova}
                      onCheckedChange={(v) => setEditData((d) => ({ ...d, urgente_prova: !!v }))}
                    />
                    <Label
                      htmlFor="edit-urgente-prova"
                      className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${
                        editData.urgente_prova
                          ? "bg-red-600 text-white animate-pulse"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      <AlertTriangle className="h-4 w-4" /> Urgente
                    </Label>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-prova-digital"
                      checked={editData.prova_digital}
                      onCheckedChange={(v) => setEditData((d) => ({ ...d, prova_digital: !!v }))}
                    />
                    <Label
                      htmlFor="edit-prova-digital"
                      className={`text-sm cursor-pointer px-2 py-0.5 rounded text-xs font-semibold ${
                        editData.prova_digital ? "bg-sky-600 text-white" : "bg-muted text-foreground"
                      }`}
                    >
                      Digital
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-prova-email"
                      checked={editData.prova_email}
                      onCheckedChange={(v) => setEditData((d) => ({ ...d, prova_email: !!v }))}
                    />
                    <Label
                      htmlFor="edit-prova-email"
                      className={`text-sm cursor-pointer px-2 py-0.5 rounded text-xs font-semibold ${
                        editData.prova_email ? "bg-pink-600 text-white" : "bg-muted text-foreground"
                      }`}
                    >
                      E-mail
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-saida-direta"
                      checked={editData.saida_direta}
                      onCheckedChange={(v) => setEditData((d) => ({ ...d, saida_direta: !!v }))}
                    />
                    <Label
                      htmlFor="edit-saida-direta"
                      className={`text-sm cursor-pointer px-2 py-0.5 rounded text-xs font-semibold ${
                        editData.saida_direta ? "bg-yellow-500 text-black" : "bg-muted text-foreground"
                      }`}
                    >
                      Saída Direta
                    </Label>
                  </div>
                </div>
              </div>

              {/* ═══ ANEXOS SHAREPOINT (MODO EDIÇÃO) ═══ */}
              <div className="border rounded-lg p-3">
                <OrderAttachmentsSection
                  orderId={order.id}
                  orderTitulo={editData.titulo || order.titulo}
                  readOnly={false}
                  canDelete={true}
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave}>Salvar Alterações</Button>
              </div>
            </div>
          ) : (
            /* ═══ VIEW MODE (DUAL COLUMN SPLIT, CENTRALIZADO) ═══ */
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

                  {/* Bloco de Provas Técnicas */}
                  <div className="p-3.5 rounded-xl border border-border bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-cyan-500" />
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
                  <div className="p-3.5 rounded-xl border border-border bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-purple-500" />
                      <span>Processos & Acabamentos</span>
                    </div>
                    {order.processos && order.processos.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
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
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Nenhum processo informado.</p>
                    )}
                  </div>
                </div>

                {/* ─── COLUNA 2: LOGÍSTICA & AUDITORIA ─── */}
                <div className="space-y-3">
                  {/* Bloco de Logística & Entrega */}
                  <div className="p-3.5 rounded-xl border border-border bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
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
                        <User className="h-3 w-3 text-cyan-600 dark:text-cyan-400" />
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

                {/* ─── SEÇÃO DE ANEXOS DO SHAREPOINT (VISUALIZAÇÃO COMPLETA) ─── */}
                <div className="col-span-1 md:col-span-2 pt-2">
                  <div className="p-4 rounded-xl border border-border bg-slate-50/70 dark:bg-slate-900/50">
                    <OrderAttachmentsSection
                      orderId={order.id}
                      orderTitulo={order.titulo}
                      readOnly={permissions.isViewOnly}
                      canDelete={permissions.canDelete || permissions.canEditCard}
                    />
                  </div>
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
                        onClick={() => setEditing(true)}
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
          )}
        </DialogContent>
      </Dialog>

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
