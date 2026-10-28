import { useState, useEffect } from "react";
import { Order, OrderStatus, STATUS_CONFIG, STATUS_ORDER } from "@/types/order";
import { Department, DEPARTMENTS } from "@/types/production";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  Calendar,
  User,
  Truck,
  AlertTriangle,
  Play,
  Pause,
  Send,
  FileDown,
  Copy,
  Trash2,
  Archive,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Layers,
  MapPin,
  Tag,
  Briefcase,
  Printer,
  ChevronRight,
  ShieldCheck,
  Bike,
  Navigation,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { exportSingleOrderPDF } from "@/lib/pdfExport";
import { OrderAttachmentsSection } from "@/components/sharepoint/OrderAttachmentsSection";
import { CreateOrderDialog } from "./CreateOrderDialog";
import { OrderEmailEventsSection } from "@/components/email/OrderEmailEventsSection";
import { supabase } from "@/integrations/supabase/client";
import { DELIVERY_STATUS_CONFIG, DeliveryStatus } from "@/types/delivery";
import { cn } from "@/lib/utils";

interface OrderSlideOverProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, data: Partial<Order>) => void;
  onMove?: (id: string, status: OrderStatus) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (order: Order) => void;
  onSendToProduction?: (id: string, department: Department, machine?: string) => void;
  onSendToExpedicao?: (id: string) => void;
  updatedByName?: string | null;
  createdByName?: string | null;
}

export function OrderSlideOver({
  order,
  open,
  onOpenChange,
  onUpdate,
  onMove,
  onArchive,
  onDelete,
  onDuplicate,
  onSendToProduction,
  onSendToExpedicao,
  updatedByName,
  createdByName,
}: OrderSlideOverProps) {
  if (!order) return null;

  const [isEditing, setIsEditing] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [driverName, setDriverName] = useState<string | null>(null);

  useEffect(() => {
    if (!order?.entregador_id) {
      setDriverName(null);
      return;
    }
    let isMounted = true;
    void supabase
      .from("entregadores" as any)
      .select("nome_completo")
      .eq("user_id", order.entregador_id)
      .maybeSingle()
      .then(({ data }) => {
        if (isMounted && data) {
          setDriverName((data as any).nome_completo);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [order?.entregador_id]);

  const [formData, setFormData] = useState({
    titulo: order.titulo,
    cliente: order.cliente,
    descricao: order.descricao,
    observacao: order.observacao || "",
    obs_prova: order.obs_prova || "",
    vendedor: order.vendedor || "",
    prazo: order.prazo || "",
    urgente: order.urgente || false,
    destinatario: order.destinatario || "",
    endereco_entrega: order.endereco_entrega || "",
  });

  useEffect(() => {
    if (order) {
      setFormData({
        titulo: order.titulo,
        cliente: order.cliente,
        descricao: order.descricao,
        observacao: order.observacao || "",
        obs_prova: order.obs_prova || "",
        vendedor: order.vendedor || "",
        prazo: order.prazo || "",
        urgente: order.urgente || false,
        destinatario: order.destinatario || "",
        endereco_entrega: order.endereco_entrega || "",
      });
      setIsEditing(false);
    }
  }, [order]);

  const handleSave = () => {
    onUpdate(order.id, {
      titulo: formData.titulo,
      cliente: formData.cliente,
      descricao: formData.descricao,
      observacao: formData.observacao || null,
      obs_prova: formData.obs_prova || null,
      vendedor: formData.vendedor || null,
      prazo: formData.prazo || null,
      urgente: formData.urgente,
      destinatario: formData.destinatario || null,
      endereco_entrega: formData.endereco_entrega || null,
    });
    setIsEditing(false);
    toast.success("O.S. atualizada com sucesso!");
  };

  const statusInfo = STATUS_CONFIG[order.status] || { label: order.status, colorKey: "novo" };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 flex flex-col bg-card/95 backdrop-blur-2xl border-l border-border/80 shadow-2xl"
        >
        {/* Top Header */}
        <div className="p-5 border-b border-border/60 bg-muted/20">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono-tech text-base font-extrabold text-primary tracking-wide">
                  #{order.titulo}
                </span>
                <Badge
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-status-${statusInfo.colorKey}-bg text-status-${statusInfo.colorKey} border border-status-${statusInfo.colorKey}/30`}
                >
                  {statusInfo.label}
                </Badge>
                {order.urgente && (
                  <Badge variant="destructive" className="text-[10px] px-2 py-0.5 font-bold uppercase animate-pulse">
                    Urgente
                  </Badge>
                )}
                {order.pausado && (
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 bg-amber-500/10 gap-1">
                    <Pause className="w-2.5 h-2.5" /> Pausado
                  </Badge>
                )}
              </div>
              <h2 className="text-lg font-bold text-foreground leading-tight uppercase">{order.cliente}</h2>
              <p className="text-xs text-muted-foreground">{order.descricao}</p>
            </div>

            {/* Quick Status Selector */}
            {onMove && (
              <div className="shrink-0">
                <Select value={order.status} onValueChange={(val: OrderStatus) => onMove(order.id, val)}>
                  <SelectTrigger className="h-8 w-[140px] text-xs font-medium rounded-xl bg-background border-border/70">
                    <SelectValue placeholder="Mover Status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/70">
                    {STATUS_ORDER.map((st) => (
                      <SelectItem key={st} value={st} className="text-xs">
                        {STATUS_CONFIG[st]?.label || st}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Quick Action Toolbar */}
          <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-border/40 overflow-x-auto scrollbar-hide">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onUpdate(order.id, { pausado: !order.pausado })}
              className={`h-7 text-[11px] gap-1 rounded-lg ${
                order.pausado ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-muted/40"
              }`}
            >
              {order.pausado ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              {order.pausado ? "Retomar" : "Pausar"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onUpdate(order.id, { urgente: !order.urgente })}
              className={`h-7 text-[11px] gap-1 rounded-lg ${
                order.urgente ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-muted/40"
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              {order.urgente ? "Remover Urgência" : "Tornar Urgente"}
            </Button>

            {onSendToExpedicao && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSendToExpedicao(order.id)}
                className="h-7 text-[11px] gap-1 rounded-lg bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20"
              >
                <Truck className="w-3 h-3" />
                Expedição
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => exportSingleOrderPDF(order)}
              className="h-7 text-[11px] gap-1 rounded-lg bg-blue-500/10 text-blue-400 border-blue-500/30"
              title="Gerar PDF da O.S."
            >
              <FileDown className="w-3 h-3" />
              PDF
            </Button>

            {onDuplicate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDuplicate(order)}
                className="h-7 text-[11px] gap-1 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <Copy className="w-3 h-3" />
                Duplicar
              </Button>
            )}

            {onArchive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onArchive(order.id)}
                className="h-7 text-[11px] gap-1 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <Archive className="w-3 h-3" />
                Arquivar
              </Button>
            )}
          </div>
        </div>

        {/* Tabbed Content */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-tech">
          <Tabs defaultValue="geral" className="w-full">
            <TabsList className="grid grid-cols-6 w-full h-9 rounded-xl bg-muted/40 p-1 mb-4">
              <TabsTrigger value="geral" className="text-xs rounded-lg">Visão Geral</TabsTrigger>
              <TabsTrigger value="processos" className="text-xs rounded-lg">Processos</TabsTrigger>
              <TabsTrigger value="anexos" className="text-xs rounded-lg">Anexos</TabsTrigger>
              <TabsTrigger value="emails" className="text-xs rounded-lg">E-mails</TabsTrigger>
              <TabsTrigger value="entrega" className="text-xs rounded-lg">Entrega</TabsTrigger>
              <TabsTrigger value="auditoria" className="text-xs rounded-lg">Auditoria</TabsTrigger>
            </TabsList>

            {/* TAB: GERAL */}
            <TabsContent value="geral" className="space-y-4">
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Número da O.S.</Label>
                    <Input
                      value={formData.titulo}
                      onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                      className="h-9 text-xs font-mono-tech mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Cliente</Label>
                    <Input
                      value={formData.cliente}
                      onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                      className="h-9 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Descrição</Label>
                    <Input
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      className="h-9 text-xs mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Vendedor</Label>
                      <Input
                        value={formData.vendedor}
                        onChange={(e) => setFormData({ ...formData, vendedor: e.target.value })}
                        className="h-9 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Prazo</Label>
                      <Input
                        type="datetime-local"
                        value={formData.prazo}
                        onChange={(e) => setFormData({ ...formData, prazo: e.target.value })}
                        className="h-9 text-xs mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Observações Gerais</Label>
                    <Textarea
                      value={formData.observacao}
                      onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                      className="text-xs min-h-[70px] mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Instruções de Prova</Label>
                    <Textarea
                      value={formData.obs_prova}
                      onChange={(e) => setFormData({ ...formData, obs_prova: e.target.value })}
                      className="text-xs min-h-[60px] mt-1"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={handleSave} className="text-xs">Salvar Alterações</Button>
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="text-xs">Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-muted/20 border border-border/50">
                      <span className="text-[10px] text-muted-foreground uppercase font-mono-tech block">Vendedor</span>
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                        <Briefcase className="w-3.5 h-3.5 text-primary" />
                        {order.vendedor || "Não informado"}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-muted/20 border border-border/50">
                      <span className="text-[10px] text-muted-foreground uppercase font-mono-tech block">Prazo de Entrega</span>
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                        <Calendar className="w-3.5 h-3.5 text-primary" />
                        {order.prazo
                          ? format(new Date(order.prazo), "dd/MM/yyyy HH:mm", { locale: ptBR })
                          : "Sem prazo definido"}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-muted/20 border border-border/50">
                      <span className="text-[10px] text-muted-foreground uppercase font-mono-tech block">Setor Atual</span>
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                        <Layers className="w-3.5 h-3.5 text-primary" />
                        {order.setor ? order.setor.toUpperCase() : "PRÉ-IMPRESSÃO"}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-muted/20 border border-border/50">
                      <span className="text-[10px] text-muted-foreground uppercase font-mono-tech block">Máquina Alocada</span>
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                        <Printer className="w-3.5 h-3.5 text-primary" />
                        {order.maquina || "Nenhuma"}
                      </span>
                    </div>
                  </div>

                  {/* Observações */}
                  {order.observacao && (
                    <div className="p-3.5 rounded-xl bg-muted/25 border border-border/50 space-y-1">
                      <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-primary" /> Observações
                      </span>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{order.observacao}</p>
                    </div>
                  )}

                  {/* Provas */}
                  <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 space-y-2">
                    <span className="text-[11px] font-semibold text-foreground block">Modalidades de Prova</span>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {order.prova_digital && <Badge variant="secondary" className="text-[10px]">Prova Digital (WhatsApp)</Badge>}
                      {order.prova_email && <Badge variant="secondary" className="text-[10px]">Prova por E-mail</Badge>}
                      {order.saida_direta && <Badge variant="secondary" className="text-[10px]">Saída Direta (Sem Prova)</Badge>}
                      {!order.prova_digital && !order.prova_email && !order.saida_direta && (
                        <span className="text-xs text-muted-foreground">Prova física convencional</span>
                      )}
                    </div>
                    {order.obs_prova && (
                      <p className="text-xs text-muted-foreground italic border-t border-border/30 pt-2 mt-2">
                        "{order.obs_prova}"
                      </p>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false);
                      setIsEditDialogOpen(true);
                    }}
                    className="w-full text-xs"
                  >
                    Editar Informações Gerais
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* TAB: PROCESSOS */}
            <TabsContent value="processos" className="space-y-4">
              <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 space-y-3">
                <span className="text-xs font-semibold text-foreground block">Roteiro de Processos Gráficos</span>
                {order.processos && order.processos.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {order.processos.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border/70 text-xs font-mono-tech"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#CCD0CF]" />
                        <span>{p}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Nenhum processo gráfico vinculado.</p>
                )}
              </div>

              {order.equipamentos && order.equipamentos.length > 0 && (
                <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 space-y-2">
                  <span className="text-xs font-semibold text-foreground block">Equipamentos Solicitados</span>
                  <div className="flex flex-wrap gap-1.5">
                    {order.equipamentos.map((eq, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] font-mono-tech">
                        {eq}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {onSendToProduction && (
                <div className="p-3.5 rounded-xl bg-card border border-border space-y-2.5">
                  <span className="text-xs font-bold text-foreground dark:text-[#CCD0CF] flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" /> Encaminhar para Setor Produtivo
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {DEPARTMENTS.slice(0, 6).map((dept) => (
                      <Button
                        key={dept.id}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onSendToProduction(order.id, dept.id);
                          toast.success(`O.S. enviada para ${dept.label}`);
                        }}
                        className="text-xs justify-start h-8 hover:bg-accent hover:border-[#9BA8AB]/40"
                      >
                        {dept.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB: ANEXOS (SHAREPOINT) */}
            <TabsContent value="anexos" className="space-y-4">
              <OrderAttachmentsSection
                orderId={order.id}
                orderTitulo={order.titulo}
                readOnly={false}
                canDelete={true}
              />
            </TabsContent>

            {/* TAB: E-MAILS (OUTLOOK) */}
            <TabsContent value="emails" className="space-y-4">
              <OrderEmailEventsSection
                orderId={order.id}
                orderTitulo={order.titulo}
                orderStatus={order.status}
                vendedorNome={order.vendedor}
              />
            </TabsContent>

            {/* TAB: ENTREGA */}
            <TabsContent value="entrega" className="space-y-4">
              {/* Status Logístico e Motoboy */}
              <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bike className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">Status Logístico</span>
                  </div>
                  {order.status_entrega && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-2 py-0.5",
                        DELIVERY_STATUS_CONFIG[order.status_entrega as DeliveryStatus]?.badgeClass
                      )}
                    >
                      {DELIVERY_STATUS_CONFIG[order.status_entrega as DeliveryStatus]?.label || order.status_entrega}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/40">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Entregador Responsável:</span>
                    <span className="font-medium text-foreground">
                      {driverName || (order.entregador_id ? "Motoboy Atribuído" : "Não atribuído")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Ordem da Parada:</span>
                    <span className="font-medium text-foreground">
                      {order.ordem_parada ? `#${order.ordem_parada}` : "—"}
                    </span>
                  </div>
                </div>

                {order.status_entrega === "entregue" && (
                  <div className="p-2 rounded bg-emerald-950/30 border border-emerald-900/50 text-xs text-emerald-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Recebido por: {order.entregue_para || "Comprovante anexado"}
                    </div>
                    {order.data_chegada_entrega && (
                      <span className="text-[10px] text-muted-foreground block">
                        Entregue em: {format(parseISO(order.data_chegada_entrega), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                )}

                {order.status_entrega === "insucesso" && order.motivo_insucesso && (
                  <div className="p-2 rounded bg-red-950/30 border border-red-900/50 text-xs text-red-300">
                    <span className="font-semibold block">Ocorrência de Insucesso:</span>
                    <p className="text-[11px] text-red-200 mt-0.5">{order.motivo_insucesso}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-muted/20 border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-mono-tech block">Destinatário</span>
                  <span className="text-xs font-semibold text-foreground mt-0.5 block">
                    {order.destinatario || "Não informado"}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-muted/20 border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-mono-tech block">Modalidade</span>
                  <span className="text-xs font-semibold text-foreground mt-0.5 block">
                    {order.tipo_entrega && order.tipo_entrega.length > 0
                      ? order.tipo_entrega.join(", ")
                      : "A definir"}
                  </span>
                </div>
              </div>

              {(order.entrega_endereco || order.endereco_entrega) && (
                <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-primary" /> Endereço de Entrega
                    </span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        order.entrega_endereco || order.endereco_entrega || ""
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      <Navigation className="w-3 h-3" /> Abrir no Maps
                    </a>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {order.entrega_endereco || order.endereco_entrega}
                  </p>
                </div>
              )}

              {order.obs_entrega && (
                <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 space-y-1">
                  <span className="text-[11px] font-semibold text-foreground block">Instruções para o Motorista</span>
                  <p className="text-xs text-muted-foreground">{order.obs_entrega}</p>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Nota Fiscal:</span>
                  <span className="font-semibold text-foreground">{order.nf || "Não informado"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Protocolo:</span>
                  <span className="font-semibold text-foreground">{order.protocolo || "Sem protocolo"}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Empresa de Transporte:</span>
                  <span className="font-semibold text-foreground">{order.empresa_entrega || "PRIMACOR"}</span>
                </div>
              </div>
            </TabsContent>

            {/* TAB: AUDITORIA */}
            <TabsContent value="auditoria" className="space-y-4">
              <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Criado por:
                  </span>
                  <span className="font-semibold text-foreground">{createdByName || "Sistema / Automático"}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Data de Criação:
                  </span>
                  <span className="font-mono-tech text-foreground">
                    {order.created_at
                      ? format(new Date(order.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })
                      : "-"}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Última Alteração por:
                  </span>
                  <span className="font-semibold text-foreground">{updatedByName || "Não registrado"}</span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Data da Alteração:
                  </span>
                  <span className="font-mono-tech text-foreground">
                    {order.updated_at
                      ? format(new Date(order.updated_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })
                      : "-"}
                  </span>
                </div>
              </div>

              {order.parent_order_id && (
                <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs">
                  <span className="font-bold text-purple-300 block mb-1">O.S. Filha / Sub-pedido</span>
                  <span className="text-[11px] text-muted-foreground font-mono-tech">
                    Vinculada à O.S. Pai ID: {order.parent_order_id}
                  </span>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <SheetFooter className="p-4 border-t border-border/60 bg-muted/20 flex flex-row items-center justify-between sm:justify-between">
          <span className="text-[11px] text-muted-foreground font-mono-tech">
            UUID: {order.id.slice(0, 8)}...
          </span>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Fechar Painel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    {/* Modal de Edição no Fluxo Idêntico de Criação em 3 Etapas */}
    {order && (
      <CreateOrderDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        orderToEdit={order}
        onUpdate={onUpdate}
      />
    )}
    </>
  );
}
