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
  const [step, setStep] = useState<1 | 2>(1);
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
      setStep(1);
      return;
    }
    if (!form.cliente_nome.trim()) {
      toast.error("Informe o nome do cliente.");
      setStep(1);
      return;
    }
    if (!form.servico_solicitado.trim()) {
      toast.error("Informe o serviço gráfico solicitado.");
      setStep(1);
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
    setStep(1);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetForm();
      }}
    >
      <DialogContent className="max-w-2xl p-0 overflow-hidden border border-border bg-card text-card-foreground shadow-2xl rounded-2xl">
        {/* Header com Stepper */}
        <div className="px-6 pt-5 pb-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
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

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={`flex-1 pb-1 text-xs font-semibold border-b-2 transition-all ${
                step === 1
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              1. Identificação & Cliente
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              className={`flex-1 pb-1 text-xs font-semibold border-b-2 transition-all ${
                step === 2
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              2. Especificações & Follow-up
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
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
                  className="h-10 rounded-xl bg-background border-border text-foreground text-sm"
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
                  placeholder="Digite para buscar clientes existentes ou cadastrar novo..."
                  className="h-10 rounded-xl bg-background border-border text-foreground text-sm"
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
                            <span className="text-[10px] text-muted-foreground font-mono-tech">
                              CNPJ: {c.cnpj}
                            </span>
                          )}
                        </div>
                        {c.telefone && (
                          <span className="text-[10px] text-muted-foreground font-mono-tech">
                            {c.telefone}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Contatos */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" /> Contato
                  </Label>
                  <Input
                    value={form.contato_nome}
                    onChange={(e) => setForm((f) => ({ ...f, contato_nome: e.target.value }))}
                    placeholder="Nome do comprador"
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
                  className="h-10 rounded-xl bg-background border-border text-foreground text-sm"
                  required
                />
              </div>

              {/* Descrição das Necessidades */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Descrição detalhada das necessidades do cliente
                </Label>
                <Textarea
                  value={form.descricao_necessidade}
                  onChange={(e) => setForm((f) => ({ ...f, descricao_necessidade: e.target.value }))}
                  placeholder="Informações adicionais, histórico da demanda, restrições do cliente..."
                  className="min-h-[80px] rounded-xl text-xs bg-background border-border"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    className="h-10 rounded-xl font-mono-tech text-sm font-semibold bg-background border-border"
                  />
                </div>

                {/* Vendedor Responsável */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-foreground flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-primary" />
                    <span>Responsável Comercial</span>
                  </Label>
                  <Select
                    value={form.vendedor_id}
                    onValueChange={(val) => {
                      const v = vendedores.find((item) => item.id === val);
                      setForm((f) => ({ ...f, vendedor_id: val, vendedor_nome: v?.nome || "" }));
                    }}
                  >
                    <SelectTrigger className="h-10 rounded-xl bg-background border-border text-xs">
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Etapa Inicial */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Etapa do Funil</Label>
                  <Select
                    value={form.etapa_id}
                    onValueChange={(val) => setForm((f) => ({ ...f, etapa_id: val }))}
                  >
                    <SelectTrigger className="h-9 rounded-xl bg-background border-border text-xs">
                      <SelectValue placeholder="Etapa" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

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

              {/* Previsão de Fechamento */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/50">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Previsão de Fechamento
                  </Label>
                  <Input
                    type="date"
                    value={form.prazo_fechamento_previsto}
                    onChange={(e) => setForm((f) => ({ ...f, prazo_fechamento_previsto: e.target.value }))}
                    className="h-9 rounded-xl text-xs bg-background border-border font-mono-tech"
                  />
                </div>

                {/* Agendamento do 1º Follow-up */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Data do 1º Contato / Follow-up
                  </Label>
                  <Input
                    type="datetime-local"
                    value={form.proxima_acao_data}
                    onChange={(e) => setForm((f) => ({ ...f, proxima_acao_data: e.target.value }))}
                    className="h-9 rounded-xl text-xs bg-background border-border font-mono-tech"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer com navegação e submissão */}
          <div className="flex items-center justify-between pt-4 border-t border-border mt-6">
            {step === 2 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
                className="rounded-xl border-border text-xs"
              >
                Voltar
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-xs text-muted-foreground"
              >
                Cancelar
              </Button>

              {step === 1 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (!form.titulo.trim() || !form.cliente_nome.trim() || !form.servico_solicitado.trim()) {
                      toast.error("Preencha os campos obrigatórios (*)");
                      return;
                    }
                    setStep(2);
                  }}
                  className="rounded-xl text-xs bg-primary text-primary-foreground font-medium"
                >
                  Avançar
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting}
                  className="rounded-xl text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium shadow-md shadow-cyan-500/20"
                >
                  {submitting ? "Salvando..." : "Salvar Oportunidade"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
