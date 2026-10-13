import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Check,
  FileText,
  Printer,
  PackageCheck,
  Building,
  User,
  Hash,
  Sparkles,
  Calendar,
  Truck,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  IMPRESSAO_TIPOS,
  IMPRESSAO_PROCESSOS,
  ACABAMENTO_TIPOS,
  ACABAMENTO_GROUPS,
} from "@/lib/processos";

interface CreateOrderDialogProps {
  onAdd: (data: {
    titulo: string;
    descricao: string;
    cliente: string;
    observacao?: string;
    obs_prova?: string;
    saida_direta?: boolean;
    prova_digital?: boolean;
    prova_email?: boolean;
    endereco_entrega?: string;
    destinatario?: string;
    urgente?: boolean;
    urgente_prova?: boolean;
    urgente_impressao?: boolean;
    urgente_acabamento?: boolean;
    urgente_expedicao?: boolean;
    digital_color?: boolean;
    digital_pb?: boolean;
    prazo?: string;
    vendedor?: string;
    processos?: string[];
    nf?: string;
    protocolo?: string;
    empresa_entrega?: string;
    obs_entrega?: string;
    tipo_entrega?: string[];
    entrega_para?: string;
    entrega_endereco?: string;
    entrega_ac?: string;
    entrega_data_limite?: string;
    status_destino?: string;
    setor_destino?: string;
  }) => void;
}

export function CreateOrderDialog({ onAdd }: CreateOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isChecking, setIsChecking] = useState(false);
  const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([]);

  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    cliente: "",
    observacao: "",
    obs_prova: "",
    saida_direta: false,
    prova_digital: false,
    prova_email: false,
    endereco_entrega: "",
    destinatario: "",
    urgente: false,
    urgente_prova: false,
    urgente_impressao: false,
    urgente_acabamento: false,
    urgente_expedicao: false,
    digital_color: false,
    digital_pb: false,
    prazo: "",
    vendedor: "",
    processos: [] as string[],
    tem_nf: false,
    tem_protocolo: false,
    empresa_entrega: "PRIMACOR",
    obs_entrega: "",
    tipo_entrega: [] as string[],
    entrega_para: "",
    entrega_endereco: "",
    entrega_ac: "",
    entrega_data_limite: "",
    status_destino: "",
    setor_destino: "",
  });

  useEffect(() => {
    if (open) {
      supabase
        .from("vendedores")
        .select("id, nome")
        .order("nome")
        .then(({ data }) => {
          if (data) setVendedores(data);
        });
    }
  }, [open]);

  const toggleProcesso = (sigla: string) => {
    setForm((f) => {
      let newProcessos = f.processos.includes(sigla)
        ? f.processos.filter((p) => p !== sigla)
        : [...f.processos, sigla];

      // CTP e OFF são vinculados na lógica gráfica
      if (sigla === "CTP" && !f.processos.includes("CTP") && !newProcessos.includes("OFF")) {
        newProcessos.push("OFF");
      }
      if (sigla === "OFF" && !f.processos.includes("OFF") && !newProcessos.includes("CTP")) {
        newProcessos.push("CTP");
      }

      return { ...f, processos: newProcessos };
    });
  };

  const toggleTipoEntrega = (tipo: string) => {
    setForm((f) => ({
      ...f,
      tipo_entrega: f.tipo_entrega.includes(tipo)
        ? f.tipo_entrega.filter((t) => t !== tipo)
        : [...f.tipo_entrega, tipo],
    }));
  };

  const resetForm = () => {
    setStep(1);
    setForm({
      titulo: "",
      descricao: "",
      cliente: "",
      observacao: "",
      obs_prova: "",
      saida_direta: false,
      prova_digital: false,
      prova_email: false,
      endereco_entrega: "",
      destinatario: "",
      urgente: false,
      urgente_prova: false,
      urgente_impressao: false,
      urgente_acabamento: false,
      urgente_expedicao: false,
      digital_color: false,
      digital_pb: false,
      prazo: "",
      vendedor: "",
      processos: [],
      tem_nf: false,
      tem_protocolo: false,
      empresa_entrega: "PRIMACOR",
      obs_entrega: "",
      tipo_entrega: [],
      entrega_para: "",
      entrega_endereco: "",
      entrega_ac: "",
      entrega_data_limite: "",
      status_destino: "",
      setor_destino: "",
    });
  };

  const validateStep1 = () => {
    if (!form.titulo.trim()) {
      toast.error("Informe o Nº da O.S.");
      return false;
    }
    if (!form.cliente.trim()) {
      toast.error("Informe o Nome do Cliente");
      return false;
    }
    if (!form.descricao.trim()) {
      toast.error("Informe a Descrição do Serviço");
      return false;
    }
    if (!form.vendedor) {
      toast.error("Selecione o Vendedor responsável");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!form.prova_email && !form.prova_digital && !form.saida_direta) {
      toast.error("Selecione ao menos uma opção de Prova (Digital, E-mail ou Saída Direta)");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1) {
      if (validateStep1()) setStep(2);
    } else if (step === 2) {
      if (validateStep2()) setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validateStep1() || !validateStep2()) return;

    setIsChecking(true);
    const { data: existing } = await supabase
      .from("orders")
      .select("id")
      .eq("titulo", form.titulo.trim())
      .limit(1);
    setIsChecking(false);

    if (existing && existing.length > 0) {
      toast.error("Número de O.S. já existente: " + form.titulo.trim());
      setStep(1);
      return;
    }

    const allProcessos = [...form.processos];

    onAdd({
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim(),
      cliente: form.cliente.trim(),
      observacao: form.observacao.trim() || undefined,
      obs_prova: form.obs_prova.trim() || undefined,
      saida_direta: form.saida_direta,
      prova_digital: form.prova_digital,
      prova_email: form.prova_email,
      endereco_entrega:
        form.prova_digital || form.prova_email
          ? form.endereco_entrega.trim() || undefined
          : undefined,
      destinatario:
        form.prova_digital || form.prova_email
          ? form.destinatario.trim() || undefined
          : undefined,
      urgente:
        form.urgente_prova ||
        form.urgente_impressao ||
        form.urgente_acabamento ||
        form.urgente_expedicao,
      urgente_prova: form.urgente_prova,
      urgente_impressao: form.urgente_impressao,
      urgente_acabamento: form.urgente_acabamento,
      urgente_expedicao: form.urgente_expedicao,
      digital_color: form.digital_color,
      digital_pb: form.digital_pb,
      prazo: form.prazo ? new Date(form.prazo).toISOString() : undefined,
      vendedor: form.vendedor || undefined,
      processos: allProcessos.length > 0 ? allProcessos : undefined,
      nf: form.tem_nf ? "SIM" : undefined,
      protocolo: form.tem_protocolo ? "SIM" : undefined,
      empresa_entrega: form.empresa_entrega || undefined,
      obs_entrega: form.obs_entrega.trim() || undefined,
      tipo_entrega: form.tipo_entrega.length > 0 ? form.tipo_entrega : undefined,
      entrega_para: form.entrega_para.trim() || undefined,
      entrega_endereco: form.entrega_endereco.trim() || undefined,
      entrega_ac: form.entrega_ac.trim() || undefined,
      entrega_data_limite: form.entrega_data_limite
        ? new Date(form.entrega_data_limite).toISOString()
        : undefined,
      status_destino: form.status_destino || undefined,
      setor_destino: form.setor_destino || undefined,
    });

    resetForm();
    setOpen(false);
    toast.success("O.S. criada com sucesso!");
  };

  const stepsConfig = [
    { id: 1, title: "Identificação", desc: "Nº O.S., Cliente & Serviço", icon: FileText },
    { id: 2, title: "Especificações", desc: "Prova & Impressão", icon: Printer },
    { id: 3, title: "Acabamento & Logística", desc: "Processos & Entrega", icon: PackageCheck },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium shadow-md shadow-cyan-500/20 border border-cyan-400/30 rounded-xl transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>Nova O.S.</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl p-0 overflow-hidden border border-border bg-card text-card-foreground shadow-2xl backdrop-blur-2xl rounded-2xl flex flex-col max-h-[92vh]">
        {/* Top Header & Modern Stepper */}
        <div className="px-6 pt-5 pb-4 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground tracking-tight flex items-center gap-2">
                  Nova Ordem de Serviço
                  <span className="text-[10px] font-mono-tech px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 font-normal">
                    PRIMACOR OS v2.0
                  </span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Preencha os dados técnicos da produção gráfica passo a passo
                </p>
              </div>
            </div>

            {/* Step Counter Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border text-xs font-mono-tech text-foreground">
              <span className="text-cyan-600 dark:text-cyan-400 font-bold">Passo {step}</span>
              <span className="text-muted-foreground">/</span>
              <span>3</span>
            </div>
          </div>

          {/* Stepper Wizard Bar */}
          <div className="grid grid-cols-3 gap-3">
            {stepsConfig.map((s) => {
              const Icon = s.icon;
              const isActive = step === s.id;
              const isPast = step > s.id;
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => {
                    if (s.id < step) setStep(s.id as 1 | 2 | 3);
                    else if (s.id === 2 && step === 1 && validateStep1()) setStep(2);
                    else if (s.id === 3 && step === 2 && validateStep2()) setStep(3);
                  }}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left ${
                    isActive
                      ? "bg-cyan-500/10 border-cyan-500/40 text-foreground shadow-[0_0_15px_-3px_rgba(6,182,212,0.25)]"
                      : isPast
                      ? "bg-card border-emerald-500/30 text-foreground hover:bg-accent cursor-pointer"
                      : "bg-muted/40 border-border/60 text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  <div
                    className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
                      isActive
                        ? "bg-cyan-500 text-slate-950 font-black shadow-[0_0_10px_#06b6d4]"
                        : isPast
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isPast ? <Check className="h-3.5 w-3.5" /> : s.id}
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-semibold truncate ${
                        isActive ? "text-cyan-600 dark:text-cyan-400" : isPast ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {s.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate hidden sm:block">
                      {s.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step Content Container (Centralized, No Ugly Scrollbar) */}
        <div className="p-6 flex-1 overflow-y-auto max-h-[58vh]">
          {/* ════════════ ETAPA 1: IDENTIFICAÇÃO & CLIENTE ════════════ */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Nº OS */}
                <div className="md:col-span-4 space-y-1.5">
                  <Label
                    htmlFor="titulo"
                    className="text-xs font-medium text-foreground flex items-center gap-1.5"
                  >
                    <Hash className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span>Nº da O.S.</span>
                    <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="titulo"
                    autoFocus
                    value={form.titulo}
                    onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                    placeholder="Ex: 71250"
                    className="h-10 bg-background border-input text-foreground placeholder:text-muted-foreground focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40 rounded-xl font-mono-tech text-sm font-semibold tracking-wider"
                  />
                </div>

                {/* Cliente */}
                <div className="md:col-span-8 space-y-1.5">
                  <Label
                    htmlFor="cliente"
                    className="text-xs font-medium text-foreground flex items-center gap-1.5"
                  >
                    <Building className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span>Cliente / Razão Social</span>
                    <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="cliente"
                    value={form.cliente}
                    onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
                    placeholder="Ex: Bioclin Química Básica Ltda"
                    className="h-10 bg-background border-input text-foreground placeholder:text-muted-foreground focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40 rounded-xl text-sm"
                  />
                </div>
              </div>

              {/* Descrição do Serviço */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="descricao"
                  className="text-xs font-medium text-foreground flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>Descrição do Serviço / Produto</span>
                  <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="descricao"
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Caixa Cartucho 350g com Laminação Fosca e Verniz UV Localizado"
                  className="h-10 bg-background border-input text-foreground placeholder:text-muted-foreground focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40 rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Vendedor */}
                <div className="md:col-span-6 space-y-1.5">
                  <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span>Vendedor Responsável</span>
                    <span className="text-rose-500">*</span>
                  </Label>
                  <Select
                    value={form.vendedor}
                    onValueChange={(v) => setForm((f) => ({ ...f, vendedor: v }))}
                  >
                    <SelectTrigger className="h-10 bg-background border-input text-foreground rounded-xl focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40">
                      <SelectValue placeholder="Selecione o vendedor" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border text-popover-foreground rounded-xl shadow-xl">
                      {vendedores.map((v) => (
                        <SelectItem
                          key={v.id}
                          value={v.nome}
                          className="hover:bg-accent hover:text-accent-foreground cursor-pointer"
                        >
                          {v.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Destino Inicial */}
                <div className="md:col-span-6 space-y-1.5">
                  <Label className="text-xs font-medium text-foreground">
                    Encaminhar Inicialmente Para
                  </Label>
                  <div className="grid grid-cols-2 gap-2 h-10">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, setor_destino: "", status_destino: "" }))
                      }
                      className={`h-full rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                        form.setor_destino === ""
                          ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-700 dark:text-cyan-300 shadow-sm"
                          : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      <span>Pré-Impressão</span>
                      {form.setor_destino === "" && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          setor_destino: "desenvolvimento",
                          status_destino: "",
                        }))
                      }
                      className={`h-full rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                        form.setor_destino === "desenvolvimento"
                          ? "bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-300 shadow-sm"
                          : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      <span>Embalagens</span>
                      {form.setor_destino === "desenvolvimento" && (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Observações Gerais */}
              <div className="space-y-1.5">
                <Label htmlFor="observacao" className="text-xs font-medium text-foreground">
                  Observações Gerais da Ordem
                </Label>
                <Textarea
                  id="observacao"
                  value={form.observacao}
                  onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                  placeholder="Informações adicionais, detalhes de faca, arquivos recebidos..."
                  className="min-h-[70px] bg-background border-input text-foreground placeholder:text-muted-foreground focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40 rounded-xl text-xs"
                />
              </div>
            </div>
          )}

          {/* ════════════ ETAPA 2: PROVA & IMPRESSÃO ════════════ */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              {/* BLOCO DE PROVA */}
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_#22d3ee]" />
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Tipo de Prova <span className="text-rose-500">*</span>
                    </Label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, urgente_prova: !f.urgente_prova }))}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      form.urgente_prova
                        ? "bg-rose-500/20 border-rose-500/50 text-rose-600 dark:text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                    <span>Prova Urgente</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {/* Digital */}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, prova_digital: !f.prova_digital }))}
                    className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      form.prova_digital
                        ? "bg-sky-500/20 border-sky-400 text-sky-700 dark:text-sky-300 font-bold shadow-[0_0_15px_-3px_rgba(14,165,233,0.3)]"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                    }`}
                  >
                    <span className="text-xs">Prova Digital</span>
                    <span className="text-[10px] text-muted-foreground">Impressão direta</span>
                  </button>

                  {/* E-mail */}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, prova_email: !f.prova_email }))}
                    className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      form.prova_email
                        ? "bg-pink-500/20 border-pink-400 text-pink-700 dark:text-pink-300 font-bold shadow-[0_0_15px_-3px_rgba(236,72,153,0.3)]"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                    }`}
                  >
                    <span className="text-xs">Prova E-mail</span>
                    <span className="text-[10px] text-muted-foreground">Envio em PDF</span>
                  </button>

                  {/* Saída Direta */}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, saida_direta: !f.saida_direta }))}
                    className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      form.saida_direta
                        ? "bg-amber-500/20 border-amber-400 text-amber-700 dark:text-amber-300 font-bold shadow-[0_0_15px_-3px_rgba(245,158,11,0.3)]"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                    }`}
                  >
                    <span className="text-xs">Saída Direta</span>
                    <span className="text-[10px] text-muted-foreground">Sem aprovação</span>
                  </button>
                </div>

                {/* Detalhes de entrega da prova (se Digital ou Email) */}
                {(form.prova_digital || form.prova_email) && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border">
                    <Input
                      value={form.destinatario}
                      onChange={(e) => setForm((f) => ({ ...f, destinatario: e.target.value }))}
                      placeholder="Aos Cuidados (A/C)..."
                      className="h-8 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                    />
                    <Input
                      value={form.endereco_entrega}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, endereco_entrega: e.target.value }))
                      }
                      placeholder="Endereço ou E-mail para envio..."
                      className="h-8 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                    />
                    <Input
                      value={form.obs_prova}
                      onChange={(e) => setForm((f) => ({ ...f, obs_prova: e.target.value }))}
                      placeholder="Obs específica de prova..."
                      className="h-8 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                    />
                  </div>
                )}
              </div>

              {/* BLOCO DE IMPRESSÃO */}
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Processos de Impressão & Cores
                    </Label>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, urgente_impressao: !f.urgente_impressao }))
                    }
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      form.urgente_impressao
                        ? "bg-rose-500/20 border-rose-500/50 text-rose-600 dark:text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                    <span>Impressão Urgente</span>
                  </button>
                </div>

                {/* Linha 1: CTP, OFF e Cores Principais */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono-tech text-muted-foreground mr-1">Off-Set:</span>
                  {(["CTP", "OFF"] as const).map((sigla) => {
                    const active = form.processos.includes(sigla);
                    return (
                      <button
                        type="button"
                        key={sigla}
                        onClick={() => toggleProcesso(sigla)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          active
                            ? "bg-blue-600 text-white border-blue-400 shadow-[0_0_10px_rgba(37,99,235,0.4)]"
                            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        {sigla}
                      </button>
                    );
                  })}

                  <div className="h-4 w-[1px] bg-border mx-1" />

                  {IMPRESSAO_TIPOS.map((p) => {
                    const active = form.processos.includes(p.sigla);
                    return (
                      <button
                        type="button"
                        key={p.sigla}
                        onClick={() => toggleProcesso(p.sigla)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          active
                            ? p.sigla === "CMYK+IR"
                              ? "bg-pink-600 text-white border-pink-400"
                              : p.sigla === "CMYK+VM"
                              ? "bg-amber-500 text-black border-amber-300 font-extrabold"
                              : p.sigla === "PANTONE"
                              ? "bg-emerald-600 text-white border-emerald-400"
                              : "bg-cyan-600 text-white border-cyan-400"
                            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        {p.sigla}
                      </button>
                    );
                  })}
                </div>

                {/* Linha 2: Impressão Digital & Plotter */}
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
                  <span className="text-[11px] font-mono-tech text-muted-foreground mr-1">Digital:</span>
                  {(["DIG", "PLO"] as const).map((sigla) => {
                    const active = form.processos.includes(sigla);
                    return (
                      <button
                        type="button"
                        key={sigla}
                        onClick={() => toggleProcesso(sigla)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                          active
                            ? "bg-emerald-600 text-white border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        {sigla}
                      </button>
                    );
                  })}

                  <div className="h-4 w-[1px] bg-border mx-1" />

                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, digital_color: !f.digital_color }))}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      form.digital_color
                        ? "bg-blue-600 text-white border-blue-400 font-bold"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    Color
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, digital_pb: !f.digital_pb }))}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      form.digital_pb
                        ? "bg-slate-500 text-white border-slate-300 font-bold"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    Preto & Branco (PB)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════════════ ETAPA 3: ACABAMENTO & LOGÍSTICA ════════════ */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              {/* ACABAMENTOS */}
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_#a855f7]" />
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Processos de Acabamento Gráfico
                    </Label>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, urgente_acabamento: !f.urgente_acabamento }))
                    }
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      form.urgente_acabamento
                        ? "bg-rose-500/20 border-rose-500/50 text-rose-600 dark:text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                    <span>Acabamento Urgente</span>
                  </button>
                </div>

                {/* Categoria do Acabamento */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono-tech text-muted-foreground mr-2">Linha:</span>
                  {ACABAMENTO_TIPOS.map((tipo) => {
                    const isSelected = form.processos.includes(tipo);
                    return (
                      <button
                        type="button"
                        key={tipo}
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            processos: [
                              ...f.processos.filter(
                                (p) => !(ACABAMENTO_TIPOS as readonly string[]).includes(p)
                              ),
                              tipo,
                            ],
                          }));
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                          isSelected
                            ? tipo === "Promocional"
                              ? "bg-blue-600 text-white border-blue-400 shadow-sm"
                              : tipo === "Editorial"
                              ? "bg-pink-600 text-white border-pink-400 shadow-sm"
                              : "bg-amber-500 text-black border-amber-300 shadow-sm font-extrabold"
                            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        {tipo}
                      </button>
                    );
                  })}
                </div>

                {/* Grid de Siglas de Acabamento Organizadas */}
                <div className="space-y-1.5 pt-1">
                  {ACABAMENTO_GROUPS.map((group, gi) => (
                    <div
                      key={gi}
                      className={`flex flex-wrap gap-1.5 p-1.5 rounded-lg border border-border ${
                        gi === 2 ? "bg-purple-500/10" : "bg-muted/40"
                      }`}
                    >
                      {group.items.map((p) => {
                        const active = form.processos.includes(p.sigla);
                        return (
                          <button
                            type="button"
                            key={p.sigla}
                            onClick={() => toggleProcesso(p.sigla)}
                            className={`px-2 py-1 rounded text-[11px] font-mono-tech font-bold border transition-all ${
                              active
                                ? `${p.cor} ring-2 ring-cyan-500/50 scale-105`
                                : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                            }`}
                          >
                            {p.sigla}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* EXPEDIÇÃO & LOGÍSTICA */}
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Expedição & Entrega
                    </Label>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, urgente_expedicao: !f.urgente_expedicao }))
                    }
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      form.urgente_expedicao
                        ? "bg-rose-500/20 border-rose-500/50 text-rose-600 dark:text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                    <span>Entrega Urgente</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Modal / Veículo */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono-tech text-muted-foreground">Transporte:</span>
                    <div className="flex gap-1.5">
                      {["MOTO", "CARRO", "RETIRA"].map((t) => {
                        const active = form.tipo_entrega.includes(t);
                        return (
                          <button
                            type="button"
                            key={t}
                            onClick={() => toggleTipoEntrega(t)}
                            className={`flex-1 py-1 px-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                              active
                                ? "bg-emerald-600 text-white border-emerald-400 shadow-sm"
                                : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                            }`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Documentos */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono-tech text-muted-foreground">Documentação:</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, tem_nf: !f.tem_nf }))}
                        className={`flex-1 py-1 px-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                          form.tem_nf
                            ? "bg-cyan-600 text-white border-cyan-400 shadow-sm"
                            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        NF
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, tem_protocolo: !f.tem_protocolo }))}
                        className={`flex-1 py-1 px-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                          form.tem_protocolo
                            ? "bg-cyan-600 text-white border-cyan-400 shadow-sm"
                            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        Protocolo
                      </button>
                    </div>
                  </div>

                  {/* Origem */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono-tech text-muted-foreground">Origem:</span>
                    <div className="flex gap-1">
                      {["PRIMACOR", "IMPRIMASET", "CLIENTE"].map((emp) => (
                        <button
                          type="button"
                          key={emp}
                          onClick={() => setForm((f) => ({ ...f, empresa_entrega: emp }))}
                          className={`flex-1 py-1 px-1 rounded-lg text-[10px] font-bold border transition-all truncate ${
                            form.empresa_entrega === emp
                              ? "bg-blue-600 text-white border-blue-400 shadow-sm"
                              : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                          }`}
                        >
                          {emp === "IMPRIMASET" ? "Imprim." : emp.charAt(0) + emp.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Endereço & Data Limite */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <Input
                    value={form.entrega_endereco}
                    onChange={(e) => setForm((f) => ({ ...f, entrega_endereco: e.target.value }))}
                    placeholder="Endereço de entrega final..."
                    className="h-8 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                  />
                  <div className="flex gap-2">
                    <Input
                      value={form.entrega_ac}
                      onChange={(e) => setForm((f) => ({ ...f, entrega_ac: e.target.value }))}
                      placeholder="A/C..."
                      className="h-8 flex-1 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                    />
                    <Input
                      type="datetime-local"
                      value={form.entrega_data_limite}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, entrega_data_limite: e.target.value }))
                      }
                      className="h-8 w-44 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-between shrink-0">
          <div>
            {step > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleBack}
                className="text-xs text-foreground hover:bg-accent gap-1.5 rounded-xl h-10 px-4"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Voltar</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground rounded-xl h-10 px-4"
              >
                Cancelar
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {step < 3 ? (
              <Button
                type="button"
                onClick={handleNext}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-xl h-10 px-5 gap-1.5 shadow-md shadow-cyan-600/20"
              >
                <span>Avançar para {step === 1 ? "Especificações" : "Acabamento"}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={isChecking}
                onClick={() => handleSubmit()}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold rounded-xl h-10 px-6 gap-2 shadow-lg shadow-emerald-500/25"
              >
                <Check className="h-4 w-4" />
                <span>{isChecking ? "Verificando O.S...." : "Criar Ordem de Serviço"}</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
