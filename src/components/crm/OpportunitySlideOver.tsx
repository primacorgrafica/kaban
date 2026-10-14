import React, { useState, useEffect } from "react";
import {
  CrmOpportunity,
  CrmStage,
  CrmProposal,
  PRIORITY_CONFIG,
  STATUS_CONFIG_CRM,
  PROPOSAL_STATUS_CONFIG,
  LEAD_ORIGINS,
  formatCurrency,
  isFollowUpLate,
  isFollowUpToday,
} from "@/types/crm";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Building,
  User,
  Calendar,
  Clock,
  Phone,
  Mail,
  FileSpreadsheet,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  FileText,
  DollarSign,
  Printer,
  Copy,
  ExternalLink,
  MessageCircle,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import { useCrmPropostas } from "@/hooks/useCrmPropostas";
import { useCrmFollowUps } from "@/hooks/useCrmFollowUps";
import { CreateProposalDialog } from "./CreateProposalDialog";
import { ProposalPrintModal } from "./ProposalPrintModal";
import { MarkLostDialog } from "./MarkLostDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface OpportunitySlideOverProps {
  opportunity: CrmOpportunity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: CrmStage[];
  onUpdate: (id: string, updates: Partial<CrmOpportunity>) => Promise<boolean>;
  onConvertToOrder?: (opportunity: CrmOpportunity, proposal?: CrmProposal | null) => void;
  onMarkWon?: (id: string) => Promise<boolean>;
  onMarkLost?: (id: string, motivo: string, detalhes?: string) => Promise<boolean>;
}

export function OpportunitySlideOver({
  opportunity,
  open,
  onOpenChange,
  stages,
  onUpdate,
  onConvertToOrder,
  onMarkWon,
  onMarkLost,
}: OpportunitySlideOverProps) {
  if (!opportunity) return null;

  const [activeTab, setActiveTab] = useState("detalhes");
  const [isSaving, setIsSaving] = useState(false);
  const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([]);

  // Modais de proposta
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [revisionBaseProposal, setRevisionBaseProposal] = useState<CrmProposal | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [selectedProposalToPrint, setSelectedProposalToPrint] = useState<CrmProposal | null>(null);
  const [markLostModalOpen, setMarkLostModalOpen] = useState(false);

  // Histórico de auditoria
  const [auditHistory, setAuditHistory] = useState<any[]>([]);

  // Hooks do CRM para a oportunidade selecionada
  const {
    proposals,
    loading: proposalsLoading,
    createProposal,
    createRevision,
    updateProposalStatus,
  } = useCrmPropostas(opportunity.id);

  const {
    activities,
    pendingActivities,
    scheduleActivity,
    completeActivity,
    cancelActivity,
  } = useCrmFollowUps(opportunity.id);

  // Estado editável dos dados gerais
  const [formData, setFormData] = useState({
    titulo: opportunity.titulo,
    cliente_nome: opportunity.cliente_nome,
    contato_nome: opportunity.contato_nome || "",
    contato_telefone: opportunity.contato_telefone || "",
    contato_email: opportunity.contato_email || "",
    servico_solicitado: opportunity.servico_solicitado,
    descricao_necessidade: opportunity.descricao_necessidade || "",
    valor_estimado: String(opportunity.valor_estimado || 0),
    prioridade: opportunity.prioridade,
    etapa_id: opportunity.etapa_id,
    vendedor_nome: opportunity.vendedor_nome || "",
    origem_lead: opportunity.origem_lead,
    prazo_fechamento_previsto: opportunity.prazo_fechamento_previsto
      ? opportunity.prazo_fechamento_previsto.slice(0, 10)
      : "",
  });

  // Novo follow-up rápido
  const [newActivity, setNewActivity] = useState({
    titulo: "",
    tipo: "ligacao" as any,
    data_agendada: "",
    descricao: "",
  });

  // Conclusão de atividade com anotação
  const [finishingActivityId, setFinishingActivityId] = useState<string | null>(null);
  const [activityResultNote, setActivityResultNote] = useState("");

  // Carregar vendedores e histórico
  useEffect(() => {
    async function loadData() {
      const [{ data: vends }, { data: hist }] = await Promise.all([
        supabase.from("vendedores").select("id, nome").order("nome"),
        supabase
          .from("crm_oportunidade_historico")
          .select("*")
          .eq("oportunidade_id", opportunity.id)
          .order("created_at", { ascending: false }),
      ]);
      if (vends) setVendedores(vends);
      if (hist) setAuditHistory(hist);
    }
    if (open) {
      void loadData();
      setFormData({
        titulo: opportunity.titulo,
        cliente_nome: opportunity.cliente_nome,
        contato_nome: opportunity.contato_nome || "",
        contato_telefone: opportunity.contato_telefone || "",
        contato_email: opportunity.contato_email || "",
        servico_solicitado: opportunity.servico_solicitado,
        descricao_necessidade: opportunity.descricao_necessidade || "",
        valor_estimado: String(opportunity.valor_estimado || 0),
        prioridade: opportunity.prioridade,
        etapa_id: opportunity.etapa_id,
        vendedor_nome: opportunity.vendedor_nome || "",
        origem_lead: opportunity.origem_lead,
        prazo_fechamento_previsto: opportunity.prazo_fechamento_previsto
          ? opportunity.prazo_fechamento_previsto.slice(0, 10)
          : "",
      });
    }
  }, [open, opportunity]);

  const handleSaveGeneralData = async () => {
    setIsSaving(true);
    try {
      const ok = await onUpdate(opportunity.id, {
        titulo: formData.titulo.trim(),
        cliente_nome: formData.cliente_nome.trim(),
        contato_nome: formData.contato_nome.trim() || null,
        contato_telefone: formData.contato_telefone.trim() || null,
        contato_email: formData.contato_email.trim() || null,
        servico_solicitado: formData.servico_solicitado.trim(),
        descricao_necessidade: formData.descricao_necessidade.trim() || null,
        valor_estimado: Number(formData.valor_estimado) || 0,
        prioridade: formData.prioridade,
        etapa_id: formData.etapa_id,
        vendedor_nome: formData.vendedor_nome || null,
        origem_lead: formData.origem_lead,
        prazo_fechamento_previsto: formData.prazo_fechamento_previsto
          ? new Date(formData.prazo_fechamento_previsto).toISOString()
          : null,
      });
      if (ok) {
        toast.success("Alterações salvas com sucesso!");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleScheduleQuickActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActivity.titulo.trim() || !newActivity.data_agendada) {
      toast.error("Informe o título e data do contato.");
      return;
    }

    const res = await scheduleActivity({
      oportunidade_id: opportunity.id,
      tipo: newActivity.tipo,
      titulo: newActivity.titulo.trim(),
      descricao: newActivity.descricao.trim() || undefined,
      data_agendada: new Date(newActivity.data_agendada).toISOString(),
    });

    if (res) {
      setNewActivity({
        titulo: "",
        tipo: "ligacao",
        data_agendada: "",
        descricao: "",
      });
    }
  };

  const handleConfirmFinishActivity = async (activityId: string) => {
    if (!activityResultNote.trim()) {
      toast.error("Informe o resultado do contato.");
      return;
    }
    await completeActivity(activityId, activityResultNote);
    setFinishingActivityId(null);
    setActivityResultNote("");
  };

  const currentStage = stages.find((s) => s.id === opportunity.etapa_id);
  const priorityCfg = PRIORITY_CONFIG[opportunity.prioridade] || PRIORITY_CONFIG.media;
  const statusCfg = STATUS_CONFIG_CRM[opportunity.status] || STATUS_CONFIG_CRM.aberta;
  const latestProposal = proposals[0] || null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl lg:max-w-3xl p-0 flex flex-col h-full bg-card border-l border-border text-card-foreground shadow-2xl overflow-hidden"
        >
          {/* Header da Oportunidade */}
          <div className="p-5 border-b border-border bg-muted/30 shrink-0">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono-tech font-bold text-muted-foreground bg-muted/80 px-2 py-0.5 rounded border border-border/60">
                  {opportunity.codigo_identificador || `OPT-${opportunity.numero_sequencial}`}
                </span>
                <Badge variant="outline" className={`text-xs ${priorityCfg.badgeClass}`}>
                  {priorityCfg.label}
                </Badge>
                <Badge variant="outline" className={`text-xs ${statusCfg.badgeClass}`}>
                  {statusCfg.label}
                </Badge>
              </div>

              <div className="text-right">
                <span className="text-xs text-muted-foreground block uppercase font-mono-tech">Valor</span>
                <span className="text-lg font-bold font-mono-tech text-foreground text-primary">
                  {formatCurrency(opportunity.valor_estimado)}
                </span>
              </div>
            </div>

            <SheetTitle className="text-lg font-bold text-foreground line-clamp-1">
              {opportunity.titulo}
            </SheetTitle>

            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Building className="h-3.5 w-3.5 text-primary" />
                <span>{opportunity.cliente_nome}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                <span>{opportunity.vendedor_nome || "Sem vendedor"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: currentStage?.cor || "#06b6d4" }}
                />
                <span>Etapa: {currentStage?.nome || "Funil"}</span>
              </div>
            </div>

            {/* Barra de Ações Rápidas no Cabeçalho */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50 flex-wrap">
              {/* Botão de Conversão em OS */}
              {onConvertToOrder && !opportunity.convertida_os_id && (
                <Button
                  size="sm"
                  onClick={() => onConvertToOrder(opportunity, latestProposal)}
                  className="gap-1.5 text-xs bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-medium shadow-md shadow-emerald-500/20 rounded-xl"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Gerar Ordem de Produção (OS)</span>
                </Button>
              )}

              {opportunity.convertida_os_id && (
                <Badge variant="secondary" className="gap-1.5 text-xs font-mono-tech py-1 px-2.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Convertido em OS</span>
                </Badge>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRevisionBaseProposal(null);
                  setProposalModalOpen(true);
                }}
                className="gap-1.5 text-xs rounded-xl border-border hover:border-primary/50"
              >
                <Plus className="h-3.5 w-3.5 text-primary" />
                <span>Novo Orçamento</span>
              </Button>

              {opportunity.status === "aberta" && onMarkWon && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onMarkWon(opportunity.id)}
                  className="gap-1.5 text-xs rounded-xl border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Aprovar Venda</span>
                </Button>
              )}

              {opportunity.status === "aberta" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMarkLostModalOpen(true)}
                  className="gap-1.5 text-xs rounded-xl border-rose-500/40 text-rose-500 hover:bg-rose-500/10"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Perda</span>
                </Button>
              )}
            </div>
          </div>

          {/* Abas do Slide-Over */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-5 border-b border-border bg-muted/10 shrink-0">
              <TabsList className="bg-transparent h-11 p-0 gap-6">
                <TabsTrigger
                  value="detalhes"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 text-xs font-semibold"
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Dados Gerais
                </TabsTrigger>
                <TabsTrigger
                  value="propostas"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 text-xs font-semibold"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                  Orçamentos ({proposals.length})
                </TabsTrigger>
                <TabsTrigger
                  value="followups"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 text-xs font-semibold"
                >
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  Follow-ups ({pendingActivities.length})
                </TabsTrigger>
                <TabsTrigger
                  value="historico"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 text-xs font-semibold"
                >
                  <History className="h-3.5 w-3.5 mr-1.5" />
                  Auditoria
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ABA 1: DADOS GERAIS */}
            <TabsContent value="detalhes" className="flex-1 overflow-y-auto p-6 space-y-5 m-0">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-foreground">Título da Oportunidade</Label>
                  <Input
                    value={formData.titulo}
                    onChange={(e) => setFormData((f) => ({ ...f, titulo: e.target.value }))}
                    className="h-9 rounded-xl text-xs bg-background border-border"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">Cliente / Razão Social</Label>
                    <Input
                      value={formData.cliente_nome}
                      onChange={(e) => setFormData((f) => ({ ...f, cliente_nome: e.target.value }))}
                      className="h-9 rounded-xl text-xs bg-background border-border"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">Contato do Cliente</Label>
                    <Input
                      value={formData.contato_nome}
                      onChange={(e) => setFormData((f) => ({ ...f, contato_nome: e.target.value }))}
                      placeholder="Nome do contato"
                      className="h-9 rounded-xl text-xs bg-background border-border"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">Telefone / WhatsApp</Label>
                    <Input
                      value={formData.contato_telefone}
                      onChange={(e) => setFormData((f) => ({ ...f, contato_telefone: e.target.value }))}
                      placeholder="(31) 99999-9999"
                      className="h-9 rounded-xl text-xs bg-background border-border"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">E-mail</Label>
                    <Input
                      value={formData.contato_email}
                      onChange={(e) => setFormData((f) => ({ ...f, contato_email: e.target.value }))}
                      placeholder="comercial@cliente.com"
                      className="h-9 rounded-xl text-xs bg-background border-border"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-foreground">Serviço Gráfico Solicitado</Label>
                  <Input
                    value={formData.servico_solicitado}
                    onChange={(e) => setFormData((f) => ({ ...f, servico_solicitado: e.target.value }))}
                    className="h-9 rounded-xl text-xs bg-background border-border"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-foreground">Descrição das Necessidades</Label>
                  <Textarea
                    value={formData.descricao_necessidade}
                    onChange={(e) => setFormData((f) => ({ ...f, descricao_necessidade: e.target.value }))}
                    className="min-h-[90px] rounded-xl text-xs bg-background border-border"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-border/40">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">Valor Estimado (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.valor_estimado}
                      onChange={(e) => setFormData((f) => ({ ...f, valor_estimado: e.target.value }))}
                      className="h-9 rounded-xl font-mono-tech text-xs bg-background border-border font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">Prioridade</Label>
                    <Select
                      value={formData.prioridade}
                      onValueChange={(val: any) => setFormData((f) => ({ ...f, prioridade: val }))}
                    >
                      <SelectTrigger className="h-9 rounded-xl text-xs bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">Etapa do Funil</Label>
                    <Select
                      value={formData.etapa_id}
                      onValueChange={(val) => setFormData((f) => ({ ...f, etapa_id: val }))}
                    >
                      <SelectTrigger className="h-9 rounded-xl text-xs bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {stages.map((st) => (
                          <SelectItem key={st.id} value={st.id}>
                            {st.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">Vendedor</Label>
                    <Select
                      value={formData.vendedor_nome}
                      onValueChange={(val) => setFormData((f) => ({ ...f, vendedor_nome: val }))}
                    >
                      <SelectTrigger className="h-9 rounded-xl text-xs bg-background border-border">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {vendedores.map((v) => (
                          <SelectItem key={v.id} value={v.nome}>
                            {v.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">Origem do Lead</Label>
                    <Select
                      value={formData.origem_lead}
                      onValueChange={(val) => setFormData((f) => ({ ...f, origem_lead: val }))}
                    >
                      <SelectTrigger className="h-9 rounded-xl text-xs bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {LEAD_ORIGINS.map((orig) => (
                          <SelectItem key={orig.id} value={orig.id}>
                            {orig.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">Previsão Fechamento</Label>
                    <Input
                      type="date"
                      value={formData.prazo_fechamento_previsto}
                      onChange={(e) => setFormData((f) => ({ ...f, prazo_fechamento_previsto: e.target.value }))}
                      className="h-9 rounded-xl text-xs font-mono-tech bg-background border-border"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <Button
                    onClick={handleSaveGeneralData}
                    disabled={isSaving}
                    size="sm"
                    className="gap-1.5 text-xs bg-primary text-primary-foreground rounded-xl"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{isSaving ? "Salvando..." : "Salvar Alterações"}</span>
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ABA 2: ORÇAMENTOS / PROPOSTAS */}
            <TabsContent value="propostas" className="flex-1 overflow-y-auto p-6 space-y-4 m-0">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-foreground">Propostas e Versões</h4>
                  <p className="text-xs text-muted-foreground">
                    Histórico completo de revisões de orçamentos para esta oportunidade.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setRevisionBaseProposal(null);
                    setProposalModalOpen(true);
                  }}
                  className="gap-1.5 text-xs rounded-xl bg-primary text-primary-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Novo Orçamento</span>
                </Button>
              </div>

              {proposals.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-border/50 rounded-2xl text-muted-foreground space-y-2">
                  <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground/60" />
                  <p className="text-sm font-semibold">Nenhum orçamento registrado ainda.</p>
                  <p className="text-xs">
                    Gere uma proposta comercial detalhada com especificações técnicas e cálculos de desconto.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {proposals.map((prop, idx) => {
                    const isLatest = idx === 0;
                    const stCfg = PROPOSAL_STATUS_CONFIG[prop.status] || PROPOSAL_STATUS_CONFIG.rascunho;

                    return (
                      <div
                        key={prop.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isLatest
                            ? "border-primary/40 bg-card shadow-xs ring-1 ring-primary/20"
                            : "border-border/60 bg-muted/20 opacity-80"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono-tech font-bold text-xs text-foreground bg-muted/80 px-2 py-0.5 rounded border border-border/50">
                              {prop.numero_proposta}
                            </span>
                            {isLatest && (
                              <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/30 font-bold">
                                Versão Atual
                              </Badge>
                            )}
                            <Badge variant="outline" className={`text-[10px] ${stCfg.badgeClass}`}>
                              {stCfg.label}
                            </Badge>
                          </div>

                          <div className="text-right">
                            <span className="text-base font-bold font-mono-tech text-foreground">
                              {formatCurrency(prop.valor_liquido)}
                            </span>
                          </div>
                        </div>

                        {/* Itens da Proposta Resumidos */}
                        <div className="mt-3 divide-y divide-border/40 text-xs bg-muted/30 p-2.5 rounded-lg border border-border/40">
                          {(prop.itens || []).map((it, itemIdx) => (
                            <div key={itemIdx} className="py-1 flex items-center justify-between gap-2">
                              <span className="truncate text-foreground font-medium">
                                {it.quantidade}x {it.descricao_item}
                              </span>
                              <span className="font-mono-tech text-muted-foreground shrink-0">
                                {formatCurrency(it.subtotal)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Condições e Prazos */}
                        <div className="mt-2.5 flex items-center gap-4 text-[11px] text-muted-foreground font-mono-tech flex-wrap">
                          {prop.condicoes_pagamento && <span>💳 {prop.condicoes_pagamento}</span>}
                          {prop.prazo_producao_dias && <span>⏱ {prop.prazo_producao_dias} dias úteis</span>}
                          {prop.validade_dias && <span>⏳ Validade: {prop.validade_dias} dias</span>}
                        </div>

                        {/* Botões de Ação na Proposta */}
                        <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedProposalToPrint(prop);
                                setPrintModalOpen(true);
                              }}
                              className="h-8 gap-1 text-xs rounded-lg border-border"
                            >
                              <Printer className="h-3 w-3" />
                              <span>Imprimir / WhatsApp</span>
                            </Button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isLatest && prop.status !== "aprovada" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateProposalStatus(prop.id, "aprovada")}
                                className="h-8 gap-1 text-xs rounded-lg text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Aprovar</span>
                              </Button>
                            )}
                            {isLatest && prop.status === "rascunho" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateProposalStatus(prop.id, "enviada")}
                                className="h-8 gap-1 text-xs rounded-lg text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
                              >
                                <Send className="h-3 w-3" />
                                <span>Marcar Enviada</span>
                              </Button>
                            )}
                            {isLatest && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setRevisionBaseProposal(prop);
                                  setProposalModalOpen(true);
                                }}
                                className="h-8 gap-1 text-xs rounded-lg text-purple-400 hover:text-purple-300"
                              >
                                <Plus className="h-3 w-3" />
                                <span>Criar Revisão (v{(prop.versao_numero || 1) + 1})</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ABA 3: FOLLOW-UPS E ATIVIDADES */}
            <TabsContent value="followups" className="flex-1 overflow-y-auto p-6 space-y-5 m-0">
              {/* Formulário de Agendamento Rápido */}
              <form
                onSubmit={handleScheduleQuickActivity}
                className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    <span>Agendar Próximo Contato</span>
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-6 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Ação / Título</Label>
                    <Input
                      value={newActivity.titulo}
                      onChange={(e) => setNewActivity((a) => ({ ...a, titulo: e.target.value }))}
                      placeholder="Ex: Ligar para confirmar recebimento do orçamento"
                      className="h-8 rounded-lg text-xs bg-background border-border"
                      required
                    />
                  </div>

                  <div className="md:col-span-3 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Tipo de Contato</Label>
                    <Select
                      value={newActivity.tipo}
                      onValueChange={(val: any) => setNewActivity((a) => ({ ...a, tipo: val }))}
                    >
                      <SelectTrigger className="h-8 rounded-lg text-xs bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="ligacao">Ligação Telefônica</SelectItem>
                        <SelectItem value="whatsapp">Mensagem WhatsApp</SelectItem>
                        <SelectItem value="email">E-mail Comercial</SelectItem>
                        <SelectItem value="reuniao">Reunião</SelectItem>
                        <SelectItem value="envio_amostra">Envio de Amostra</SelectItem>
                        <SelectItem value="visita">Visita Presencial</SelectItem>
                        <SelectItem value="followup_orcamento">Follow-up Proposta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-3 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Data e Horário</Label>
                    <Input
                      type="datetime-local"
                      value={newActivity.data_agendada}
                      onChange={(e) => setNewActivity((a) => ({ ...a, data_agendada: e.target.value }))}
                      className="h-8 rounded-lg text-xs font-mono-tech bg-background border-border"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button type="submit" size="sm" className="h-8 gap-1.5 text-xs rounded-xl bg-primary">
                    <Plus className="h-3.5 w-3.5" />
                    <span>Agendar Follow-up</span>
                  </Button>
                </div>
              </form>

              {/* Lista de Atividades Pendentes e Concluídas */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Linha do Tempo de Atividades ({activities.length})
                </h4>

                {activities.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4">Nenhuma atividade registrada.</p>
                ) : (
                  activities.map((act) => {
                    const isDone = act.status === "concluido";
                    const isLate = !isDone && isFollowUpLate(act.data_agendada);
                    const isToday = !isDone && isFollowUpToday(act.data_agendada);

                    return (
                      <div
                        key={act.id}
                        className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all ${
                          isDone
                            ? "bg-muted/10 border-border/50 opacity-75"
                            : isLate
                            ? "bg-rose-500/[0.04] border-rose-500/40"
                            : "bg-card border-border/80 shadow-xs"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`p-1.5 rounded-lg border text-xs font-bold ${
                                isDone
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                  : isLate
                                  ? "bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse"
                                  : isToday
                                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                  : "bg-muted text-muted-foreground border-border"
                              }`}
                            >
                              {act.tipo.toUpperCase()}
                            </span>
                            <span className="font-semibold text-foreground text-sm">{act.titulo}</span>
                          </div>

                          <div className="text-right font-mono-tech text-[11px]">
                            <span className={isLate ? "text-rose-400 font-bold" : "text-muted-foreground"}>
                              {format(new Date(act.data_agendada), "dd/MM/yyyy HH:mm")}
                            </span>
                          </div>
                        </div>

                        {act.descricao && (
                          <p className="text-muted-foreground pl-1">{act.descricao}</p>
                        )}

                        {act.resultado && (
                          <div className="p-2 rounded bg-muted/40 border border-border/40 text-[11px] text-emerald-300">
                            <strong>Resultado do contato:</strong> {act.resultado}
                          </div>
                        )}

                        {/* Ações de Conclusão */}
                        {!isDone && (
                          <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                            {finishingActivityId === act.id ? (
                              <div className="w-full space-y-2">
                                <Textarea
                                  autoFocus
                                  value={activityResultNote}
                                  onChange={(e) => setActivityResultNote(e.target.value)}
                                  placeholder="Descreva o que foi conversado e o retorno do cliente..."
                                  className="min-h-[60px] text-xs rounded-xl bg-background border-border"
                                />
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFinishingActivityId(null)}
                                    className="h-7 text-xs"
                                  >
                                    Cancelar
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleConfirmFinishActivity(act.id)}
                                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                                  >
                                    Concluir e Salvar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span className="text-[11px] text-muted-foreground">Pendente</span>
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => cancelActivity(act.id)}
                                    className="h-7 text-xs text-muted-foreground hover:text-rose-500"
                                  >
                                    Cancelar
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setFinishingActivityId(act.id);
                                      setActivityResultNote("");
                                    }}
                                    className="h-7 text-xs text-emerald-500 border-emerald-500/40 hover:bg-emerald-500/10"
                                  >
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Concluir Contato
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            {/* ABA 4: HISTÓRICO DE AUDITORIA */}
            <TabsContent value="historico" className="flex-1 overflow-y-auto p-6 space-y-3 m-0">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Trilha de Auditoria e Movimentações
              </h4>

              {auditHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-4">Nenhum evento registrado.</p>
              ) : (
                <div className="space-y-2.5">
                  {auditHistory.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border border-border/60 bg-muted/20 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-muted-foreground font-mono-tech text-[10px]">
                        <span>{item.tipo_evento.toUpperCase()}</span>
                        <span>{format(new Date(item.created_at), "dd/MM/yyyy HH:mm:ss")}</span>
                      </div>
                      <p className="text-foreground font-medium">{item.descricao}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Modais Vinculados */}
      <CreateProposalDialog
        open={proposalModalOpen}
        onOpenChange={setProposalModalOpen}
        opportunity={opportunity}
        baseProposal={revisionBaseProposal}
        onSave={async (data) => {
          if (revisionBaseProposal) {
            return createRevision(revisionBaseProposal.id, data);
          }
          return createProposal(data);
        }}
      />

      <ProposalPrintModal
        open={printModalOpen}
        onOpenChange={setPrintModalOpen}
        proposal={selectedProposalToPrint}
        opportunity={opportunity}
      />

      <MarkLostDialog
        open={markLostModalOpen}
        onOpenChange={setMarkLostModalOpen}
        opportunity={opportunity}
        onConfirm={async (id, motivo, detalhes) => {
          if (onMarkLost) {
            return onMarkLost(id, motivo, detalhes);
          }
          return false;
        }}
      />
    </>
  );
}
