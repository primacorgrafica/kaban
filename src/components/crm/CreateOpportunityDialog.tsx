import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CrmStage,
  LEAD_ORIGINS,
  OpportunityPriority,
  LeadOrigin,
} from "@/types/crm";
import { supabase } from "@/integrations/supabase/client";
import {
  Building,
  User,
  DollarSign,
  Calendar,
  Sparkles,
  Phone,
  Mail,
  FileText,
  Clock,
  Layers,
  Save,
  Flag,
} from "lucide-react";
import { toast } from "sonner";

interface CreateOpportunityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: CrmStage[];
  defaultStageId?: string;
  onSave: (data: any) => Promise<any>;
  onSearchClients: (query: string) => Promise<any[]>;
}

export function CreateOpportunityDialog({
  open,
  onOpenChange,
  stages,
  defaultStageId,
  onSave,
  onSearchClients,
}: CreateOpportunityDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([]);

  // Autocomplete de clientes
  const [clientQuery, setClientQuery] = useState("");
  const [clientSuggestions, setClientSuggestions] = useState<any[]>([]);
  const [isSearchingClient, setIsSearchingClient] = useState(false);

  // Formulário
  const [form, setForm] = useState({
    titulo: "",
    cliente_id: "",
    cliente_nome: "",
    contato_nome: "",
    contato_telefone: "",
    contato_email: "",
    origem_lead: "Indicacao" as LeadOrigin,
    servico_solicitado: "",
    descricao_necessidade: "",
    valor_estimado: "",
    vendedor_id: "",
    vendedor_nome: "",
    prioridade: "media" as OpportunityPriority,
    etapa_id: defaultStageId || (stages[0]?.id || ""),
    prazo_fechamento_previsto: "",
    proxima_acao_descricao: "Primeiro contato comercial",
    proxima_acao_data: "",
  });

  // Carregar lista de vendedores da tabela do banco
  useEffect(() => {
    async function loadVendedores() {
      const { data } = await supabase
        .from("vendedores")
        .select("id, nome")
        .order("nome", { ascending: true });
      if (data) setVendedores(data);
    }
    if (open) {
      void loadVendedores();
      if (defaultStageId) {
        setForm((prev) => ({ ...prev, etapa_id: defaultStageId }));
      }
    }
  }, [open, defaultStageId]);

  // Autocomplete de cliente ao digitar
  useEffect(() => {
    let active = true;
    if (clientQuery.trim().length >= 2) {
      setIsSearchingClient(true);
      onSearchClients(clientQuery).then((results) => {
        if (active) {
          setClientSuggestions(results || []);
          setIsSearchingClient(false);
        }
      });
    } else {
      setClientSuggestions([]);
    }
    return () => {
      active = false;
    };
  }, [clientQuery, onSearchClients]);

  const selectClient = (c: any) => {
    setForm((prev) => ({
      ...prev,
      cliente_id: c.cliente_id || "",
      cliente_nome: c.nome,
      contato_telefone: c.telefone || prev.contato_telefone,
      contato_email: c.email || prev.contato_email,
    }));
    setClientQuery("");
    setClientSuggestions([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.titulo.trim()) {
      toast.error("Informe o título da oportunidade.");
      return;
    }
    if (!form.cliente_nome.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    if (!form.servico_solicitado.trim()) {
      toast.error("Informe o serviço gráfico solicitado.");
      return;
    }

    setSubmitting(true);
    try {
      const selectedVendedor = vendedores.find((v) => v.id === form.vendedor_id);

      const payload = {
        ...form,
        valor_estimado: Number(form.valor_estimado) || 0,
        vendedor_nome: selectedVendedor?.nome || form.vendedor_nome || null,
        etapa_id: form.etapa_id || stages[0]?.id,
        prazo_fechamento_previsto: form.prazo_fechamento_previsto
          ? new Date(form.prazo_fechamento_previsto).toISOString()
          : undefined,
        proxima_acao_data: form.proxima_acao_data
          ? new Date(form.proxima_acao_data).toISOString()
          : undefined,
      };

      const res = await onSave(payload);
      if (res) {
        onOpenChange(false);
        resetForm();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({
      titulo: "",
      cliente_id: "",
      cliente_nome: "",
      contato_nome: "",
      contato_telefone: "",
      contato_email: "",
      origem_lead: "Indicacao",
      servico_solicitado: "",
      descricao_necessidade: "",
      valor_estimado: "",
      vendedor_id: "",
      vendedor_nome: "",
      prioridade: "media",
      etapa_id: defaultStageId || (stages[0]?.id || ""),
      prazo_fechamento_previsto: "",
      proxima_acao_descricao: "Primeiro contato comercial",
      proxima_acao_data: "",
    });
  };

  const selectedStage = stages.find((s) => s.id === form.etapa_id);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetForm();
      }}
    >
      <DialogContent className="max-w-3xl p-0 overflow-hidden border border-border bg-card text-card-foreground shadow-2xl rounded-2xl flex flex-col max-h-[90vh] font-pcp">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-[#253745] border border-[#4A5C6A]/50 flex items-center justify-center text-[#CCD0CF]">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Nova Oportunidade / Lead
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Cadastre o cliente potencial no Funil Comercial da Primacor Gráfica.
                </p>
              </div>
            </div>

            {selectedStage && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-muted/60 text-xs font-pcp">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: selectedStage.cor || "#CCD0CF" }}
                />
                <span className="font-semibold">{selectedStage.nome}</span>
              </div>
            )}
          </div>
        </div>

        {/* Formulário Completo Unificado */}
        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            // Evita que apertar Enter em inputs de texto submeta o formulário sem o usuário querer
            if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
              e.preventDefault();
            }
          }}
          className="p-6 space-y-5 overflow-y-auto flex-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Seção 1: Identificação & Cliente */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Building className="h-3.5 w-3.5 text-primary" />
              <span>1. Identificação da Oportunidade & Cliente</span>
            </h4>

            {/* Título da Oportunidade */}
            <div className="space-y-1.5">
              <Label htmlFor="titulo" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>Título da Oportunidade</span>
                <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="titulo"
                autoFocus
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Ex: Embalagens Cartucho Medicamentos - Lote 50k"
                className="h-9 rounded-xl bg-background border-border text-foreground text-xs"
                required
              />
            </div>

            {/* Cliente com busca integrada */}
            <div className="space-y-1.5 relative">
              <Label htmlFor="cliente" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5 text-primary" />
                <span>Cliente / Razão Social</span>
                <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="cliente"
                value={form.cliente_nome}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((f) => ({ ...f, cliente_nome: val, cliente_id: "" }));
                  setClientQuery(val);
                }}
                placeholder="Digite para buscar clientes cadastrados ou digite um novo..."
                className="h-9 rounded-xl bg-background border-border text-foreground text-xs"
                required
              />

              {/* Dropdown de sugestões de clientes */}
              {clientSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto p-1 divide-y divide-border/40">
                  {clientSuggestions.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectClient(c)}
                      className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted transition-colors flex items-center justify-between"
                    >
                      <div>
                        <span className="font-semibold text-foreground block">{c.nome}</span>
                        {c.cnpj && (
                          <span className="text-[10px] text-muted-foreground font-pcp">
                            CNPJ: {c.cnpj}
                          </span>
                        )}
                      </div>
                      {c.telefone && (
                        <span className="text-[10px] text-muted-foreground font-pcp">
                          {c.telefone}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Contato, Telefone e Email */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" /> Contato
                </Label>
                <Input
                  value={form.contato_nome}
                  onChange={(e) => setForm((f) => ({ ...f, contato_nome: e.target.value }))}
                  placeholder="Nome do contato"
                  className="h-9 rounded-xl text-xs bg-background border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Telefone / WhatsApp
                </Label>
                <Input
                  value={form.contato_telefone}
                  onChange={(e) => setForm((f) => ({ ...f, contato_telefone: e.target.value }))}
                  placeholder="(31) 99999-9999"
                  className="h-9 rounded-xl text-xs bg-background border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" /> E-mail
                </Label>
                <Input
                  type="email"
                  value={form.contato_email}
                  onChange={(e) => setForm((f) => ({ ...f, contato_email: e.target.value }))}
                  placeholder="comprador@empresa.com"
                  className="h-9 rounded-xl text-xs bg-background border-border"
                />
              </div>
            </div>
          </div>

          {/* Seção 2: Serviço Gráfico & Parâmetros Comerciais */}
          <div className="space-y-3.5 pt-4 border-t border-border/60">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>2. Demanda Gráfica & Comercial</span>
            </h4>

            {/* Serviço Gráfico Solicitado */}
            <div className="space-y-1.5">
              <Label htmlFor="servico" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span>Serviço Gráfico Solicitado</span>
                <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="servico"
                value={form.servico_solicitado}
                onChange={(e) => setForm((f) => ({ ...f, servico_solicitado: e.target.value }))}
                placeholder="Ex: Caixa Cartucho Triplex 350g com Laminação Fosca e Hot Stamping"
                className="h-9 rounded-xl bg-background border-border text-foreground text-xs"
                required
              />
            </div>

            {/* Descrição das Necessidades */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Descrição detalhada das necessidades / especificações
              </Label>
              <Textarea
                value={form.descricao_necessidade}
                onChange={(e) => setForm((f) => ({ ...f, descricao_necessidade: e.target.value }))}
                placeholder="Informações adicionais, histórico da demanda, especificações técnicas..."
                className="min-h-[70px] rounded-xl text-xs bg-background border-border"
              />
            </div>

            {/* Valor, Etapa, Vendedor, Prioridade, Origem */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Valor Estimado */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Valor Estimado (R$)</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valor_estimado}
                  onChange={(e) => setForm((f) => ({ ...f, valor_estimado: e.target.value }))}
                  placeholder="0,00"
                  className="h-9 rounded-xl font-pcp text-xs font-semibold bg-background border-border"
                />
              </div>

              {/* Etapa do Funil (COM DESTAQUE) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground flex items-center gap-1">
                  <Flag className="h-3.5 w-3.5 text-[#CCD0CF]" />
                  <span>Etapa do Funil</span>
                  <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={form.etapa_id}
                  onValueChange={(val) => setForm((f) => ({ ...f, etapa_id: val }))}
                >
                  <SelectTrigger className="h-9 rounded-xl bg-background border-border text-xs">
                    <SelectValue placeholder="Selecione a etapa" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: s.cor || "#CCD0CF" }}
                          />
                          <span>{s.nome}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Vendedor Responsável */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-primary" />
                  <span>Vendedor Responsável</span>
                </Label>
                <Select
                  value={form.vendedor_id}
                  onValueChange={(val) => {
                    const v = vendedores.find((item) => item.id === val);
                    setForm((f) => ({ ...f, vendedor_id: val, vendedor_nome: v?.nome || "" }));
                  }}
                >
                  <SelectTrigger className="h-9 rounded-xl bg-background border-border text-xs">
                    <SelectValue placeholder="Selecione o vendedor" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {vendedores.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Prioridade */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Prioridade</Label>
                <Select
                  value={form.prioridade}
                  onValueChange={(val: any) => setForm((f) => ({ ...f, prioridade: val }))}
                >
                  <SelectTrigger className="h-9 rounded-xl bg-background border-border text-xs">
                    <SelectValue placeholder="Prioridade" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Origem do Lead */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Origem do Lead</Label>
                <Select
                  value={form.origem_lead}
                  onValueChange={(val: any) => setForm((f) => ({ ...f, origem_lead: val }))}
                >
                  <SelectTrigger className="h-9 rounded-xl bg-background border-border text-xs">
                    <SelectValue placeholder="Origem" />
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
            </div>
          </div>

          {/* Seção 3: Previsão & Agendamento de Contato */}
          <div className="space-y-3.5 pt-4 border-t border-border/60">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>3. Prazos & Próximo Follow-up</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Previsão de Fechamento */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Previsão de Fechamento
                </Label>
                <Input
                  type="date"
                  value={form.prazo_fechamento_previsto}
                  onChange={(e) => setForm((f) => ({ ...f, prazo_fechamento_previsto: e.target.value }))}
                  className="h-9 rounded-xl text-xs bg-background border-border font-pcp"
                />
              </div>

              {/* Agendamento do 1º Follow-up */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Agendar Data do 1º Contato
                </Label>
                <Input
                  type="datetime-local"
                  value={form.proxima_acao_data}
                  onChange={(e) => setForm((f) => ({ ...f, proxima_acao_data: e.target.value }))}
                  className="h-9 rounded-xl text-xs bg-background border-border font-pcp"
                />
              </div>
            </div>
          </div>

          {/* Footer com botões de ação */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs border-border text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="rounded-xl text-xs bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#CCD0CF] dark:hover:bg-white dark:text-[#06141B] font-bold shadow-md shadow-[#06141B]/20 gap-1.5 transition-all"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{submitting ? "Salvando..." : "Salvar Oportunidade"}</span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
