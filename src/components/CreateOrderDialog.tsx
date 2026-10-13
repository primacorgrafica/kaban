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
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup as RadioGroupBase, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { IMPRESSAO_TIPOS, IMPRESSAO_PROCESSOS, ACABAMENTO_TIPOS, ACABAMENTO_GROUPS } from "@/lib/processos";

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
    urgente: false, urgente_prova: false, urgente_impressao: false, urgente_acabamento: false, urgente_expedicao: false,
    digital_color: false, digital_pb: false,
    prazo: "",
    vendedor: "",
    processos: [] as string[],
    tem_nf: false,
    tem_protocolo: false,
    empresa_entrega: "",
    obs_entrega: "",
    tipo_entrega: [] as string[],
    entrega_para: "",
    entrega_endereco: "",
    entrega_ac: "",
    entrega_data_limite: "",
    status_destino: "" as string,
    setor_destino: "" as string,
  });

  const [isChecking, setIsChecking] = useState(false);
  const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    if (open) {
      supabase.from("vendedores").select("id, nome").order("nome").then(({ data }) => {
        if (data) setVendedores(data);
      });
    }
  }, [open]);

  const toggleProcesso = (sigla: string) => {
    setForm((f) => {
      let newProcessos = f.processos.includes(sigla)
        ? f.processos.filter((p) => p !== sigla)
        : [...f.processos, sigla];

      // CTP e OFF são vinculados
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
    setForm({
      titulo: "", descricao: "", cliente: "", observacao: "", obs_prova: "",
      saida_direta: false, prova_digital: false, prova_email: false,
      endereco_entrega: "", destinatario: "",
      urgente: false, urgente_prova: false, urgente_impressao: false, urgente_acabamento: false, urgente_expedicao: false, digital_color: false, digital_pb: false, prazo: "", vendedor: "",
      processos: [],
      tem_nf: false, tem_protocolo: false, empresa_entrega: "", obs_entrega: "",
      tipo_entrega: [], entrega_para: "", entrega_endereco: "", entrega_ac: "", entrega_data_limite: "",
      status_destino: "",
      setor_destino: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim() || !form.cliente.trim() || !form.vendedor) {
      toast.error("Preencha o Nº OS., Cliente e Vendedor");
      return;
    }
    if (!form.descricao.trim()) {
      toast.error("Preencha a Descrição do Serviço");
      return;
    }
    if (!form.prova_email && !form.prova_digital && !form.saida_direta) {
      toast.error("Selecione pelo menos uma opção de prova (E-mail, Digital ou Saída Direta)");
      return;
    }

    setIsChecking(true);
    const { data: existing } = await supabase
      .from("orders")
      .select("id")
      .eq("titulo", form.titulo.trim())
      .limit(1);
    setIsChecking(false);

    if (existing && existing.length > 0) {
      toast.error("OS. já criada! Já existe uma ordem com o número " + form.titulo.trim());
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
      endereco_entrega: (form.prova_digital || form.prova_email) ? (form.endereco_entrega.trim() || undefined) : undefined,
      destinatario: (form.prova_digital || form.prova_email) ? (form.destinatario.trim() || undefined) : undefined,
      urgente: form.urgente_prova || form.urgente_impressao || form.urgente_acabamento || form.urgente_expedicao,
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
      entrega_data_limite: form.entrega_data_limite ? new Date(form.entrega_data_limite).toISOString() : undefined,
      status_destino: form.status_destino || undefined,
      setor_destino: form.setor_destino || undefined,
    });
    resetForm();
    setOpen(false);
    toast.success("OS. criada com sucesso");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nova OS.
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Serviço</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ═══ CABEÇALHO ═══ */}
          <div className="border rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="titulo" className="text-xs uppercase text-muted-foreground">Nº OS. *</Label>
                <Input id="titulo" value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} placeholder="Ex: 12345" className="h-9" />
              </div>
              <div>
                <Label htmlFor="cliente" className="text-xs uppercase text-muted-foreground">Cliente *</Label>
                <Input id="cliente" value={form.cliente} onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))} placeholder="Nome do cliente" className="h-9" />
              </div>
            </div>
            <div>
              <Label htmlFor="descricao" className="text-xs uppercase text-muted-foreground">Descrição do Serviço</Label>
              <Input id="descricao" value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} placeholder="Ex: 5000 folders 4×4" className="h-9" />
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Vendedor *</Label>
              <Select value={form.vendedor} onValueChange={(v) => setForm((f) => ({ ...f, vendedor: v }))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Nome" />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="observacao" className="text-xs uppercase text-muted-foreground">OBS</Label>
              <Textarea id="observacao" value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} placeholder="Observações gerais..." className="min-h-[50px]" />
            </div>
          </div>

          {/* ═══ PROVA ═══ */}
          <div className="border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Prova *</Label>
              <div className="flex items-center gap-2">
                <Checkbox id="urgente-prova" checked={form.urgente_prova} onCheckedChange={(checked) => setForm((f) => ({ ...f, urgente_prova: checked === true }))} />
                <Label htmlFor="urgente-prova" className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${form.urgente_prova ? "bg-red-600 text-white animate-pulse" : "text-red-600 dark:text-red-400"}`}>
                  <AlertTriangle className="h-4 w-4" /> Urgente
                </Label>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Checkbox id="prova_digital" checked={form.prova_digital} onCheckedChange={(checked) => setForm((f) => ({ ...f, prova_digital: checked === true }))} />
                <Label htmlFor="prova_digital" className={`text-sm cursor-pointer px-2 py-0.5 rounded text-xs font-semibold ${form.prova_digital ? "bg-sky-600 text-white" : "bg-muted text-foreground"}`}>Digital</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="prova_email" checked={form.prova_email} onCheckedChange={(checked) => setForm((f) => ({ ...f, prova_email: checked === true }))} />
                <Label htmlFor="prova_email" className={`text-sm cursor-pointer px-2 py-0.5 rounded text-xs font-semibold ${form.prova_email ? "bg-pink-600 text-white" : "bg-muted text-foreground"}`}>E-mail</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="saida_direta" checked={form.saida_direta} onCheckedChange={(checked) => setForm((f) => ({ ...f, saida_direta: checked === true }))} />
                <Label htmlFor="saida_direta" className={`text-sm cursor-pointer px-2 py-0.5 rounded text-xs font-semibold ${form.saida_direta ? "bg-yellow-500 text-black" : "bg-muted text-foreground"}`}>Saída Direta</Label>
              </div>
            </div>
            {(form.prova_digital || form.prova_email) && (
              <div className="space-y-2 pl-2 border-l-2 border-sky-200">
                <Input value={form.destinatario} onChange={(e) => setForm((f) => ({ ...f, destinatario: e.target.value }))} placeholder="A/C:" className="h-8 text-sm" />
                <Input value={form.endereco_entrega} onChange={(e) => setForm((f) => ({ ...f, endereco_entrega: e.target.value }))} placeholder="Endereço:" className="h-8 text-sm" />
                <Textarea value={form.obs_prova} onChange={(e) => setForm((f) => ({ ...f, obs_prova: e.target.value }))} placeholder="OBS prova..." className="text-sm min-h-[40px]" rows={2} />
              </div>
            )}

          </div>

          {/* ═══ IMPRESSÃO ═══ */}
          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Impressão</Label>
              <div className="flex items-center gap-2">
                <Checkbox id="urgente-impressao" checked={form.urgente_impressao} onCheckedChange={(checked) => setForm((f) => ({ ...f, urgente_impressao: checked === true }))} />
                <Label htmlFor="urgente-impressao" className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${form.urgente_impressao ? "bg-red-600 text-white animate-pulse" : "text-red-600 dark:text-red-400"}`}>
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
                      form.processos.includes(p.sigla)
                        ? `${p.cor} ring-2 ring-offset-1 ring-primary/40`
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                    onClick={() => toggleProcesso(p.sigla)}
                  >
                    {p.sigla}
                  </Badge>
                );
              })}
              {IMPRESSAO_TIPOS.map((p) => (
                <div key={p.sigla} className="flex items-center gap-0.5">
                  <Checkbox
                    id={`imp-${p.sigla}`}
                    checked={form.processos.includes(p.sigla)}
                    onCheckedChange={() => toggleProcesso(p.sigla)}
                    className="h-3.5 w-3.5"
                  />
                  <Label
                    htmlFor={`imp-${p.sigla}`}
                    className={`cursor-pointer px-1.5 py-0.5 rounded text-xs font-semibold ${
                      form.processos.includes(p.sigla)
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
                      form.processos.includes(p.sigla)
                        ? `${p.cor} ring-2 ring-offset-1 ring-primary/40`
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                    onClick={() => toggleProcesso(p.sigla)}
                  >
                    {p.sigla}
                  </Badge>
                );
              })}
              <div className="flex items-center gap-2">
                <Checkbox id="digital-color" checked={form.digital_color} onCheckedChange={(checked) => setForm((f) => ({ ...f, digital_color: checked === true }))} />
                <Label htmlFor="digital-color" className={`text-sm cursor-pointer px-2 py-0.5 rounded text-xs font-semibold ${form.digital_color ? "bg-blue-600 text-white" : "bg-muted text-foreground"}`}>Color</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="digital-pb" checked={form.digital_pb} onCheckedChange={(checked) => setForm((f) => ({ ...f, digital_pb: checked === true }))} />
                <Label htmlFor="digital-pb" className={`text-sm cursor-pointer px-2 py-0.5 rounded text-xs font-semibold ${form.digital_pb ? "bg-gray-500 text-white" : "bg-muted text-foreground"}`}>PB</Label>
              </div>
            </div>
          </div>

          {/* ═══ ACABAMENTO ═══ */}
          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Acabamento</Label>
              <div className="flex items-center gap-2">
                <Checkbox id="urgente-acabamento" checked={form.urgente_acabamento} onCheckedChange={(checked) => setForm((f) => ({ ...f, urgente_acabamento: checked === true }))} />
                <Label htmlFor="urgente-acabamento" className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${form.urgente_acabamento ? "bg-red-600 text-white animate-pulse" : "text-red-600 dark:text-red-400"}`}>
                  <AlertTriangle className="h-4 w-4" /> Urgente
                </Label>
              </div>
            </div>
            <RadioGroupBase
              value={form.processos.find((p) => (ACABAMENTO_TIPOS as readonly string[]).includes(p)) || ""}
              onValueChange={(v) => {
                setForm((f) => ({
                  ...f,
                  processos: [
                    ...f.processos.filter((p) => !(ACABAMENTO_TIPOS as readonly string[]).includes(p)),
                    v,
                  ],
                }));
              }}
              className="flex items-center gap-4"
            >
              {ACABAMENTO_TIPOS.map((tipo) => {
                const selected = form.processos.includes(tipo);
                const colorClass = tipo === "Promocional" ? "bg-blue-600 text-white" :
                  tipo === "Editorial" ? "bg-pink-600 text-white" :
                  "bg-yellow-500 text-black";
                return (
                  <div key={tipo} className="flex items-center gap-2">
                    <RadioGroupItem value={tipo} id={`acab-${tipo}`} />
                    <Label htmlFor={`acab-${tipo}`} className={`text-sm cursor-pointer font-semibold px-2 py-0.5 rounded text-xs ${selected ? colorClass : ""}`}>{tipo}</Label>
                  </div>
                );
              })}
            </RadioGroupBase>
            {ACABAMENTO_GROUPS.map((group, gi) => (
              <div key={gi}>
                
                <div className={`flex flex-nowrap justify-between mt-0.5 ${gi === 2 ? "bg-purple-100 dark:bg-purple-900/40 rounded-md p-2 -mx-0.5" : ""}`}>
                  {group.items.map((p) => (
                    <Badge
                      key={p.sigla}
                      variant="outline"
                      className={`cursor-pointer text-[11px] px-1.5 py-0.5 select-none transition-all font-bold border ${
                        form.processos.includes(p.sigla)
                          ? `${p.cor} ring-2 ring-offset-1 ring-primary/40`
                          : "bg-background text-muted-foreground border-border hover:bg-muted"
                      }`}
                      onClick={() => toggleProcesso(p.sigla)}
                    >
                      {p.sigla}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ═══ ENTREGA ═══ */}
          <div className="border rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Expedição</Label>
              <div className="flex items-center gap-2">
                <Checkbox id="urgente-expedicao" checked={form.urgente_expedicao} onCheckedChange={(checked) => setForm((f) => ({ ...f, urgente_expedicao: checked === true }))} />
                <Label htmlFor="urgente-expedicao" className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${form.urgente_expedicao ? "bg-red-600 text-white animate-pulse" : "text-red-600 dark:text-red-400"}`}>
                  <AlertTriangle className="h-4 w-4" /> Urgente
                </Label>
              </div>
            </div>
            
            {/* Tipo Entrega: CARRO / MOTO / RETIRA (multiple selection) */}
            <div className="flex items-center gap-4 flex-wrap">
              {["MOTO", "CARRO", "RETIRA"].map((tipo) => (
                <div key={tipo} className="flex items-center gap-2">
                  <Checkbox
                    id={`entrega-${tipo}`}
                    checked={form.tipo_entrega.includes(tipo)}
                    onCheckedChange={() => toggleTipoEntrega(tipo)}
                  />
                  <Label htmlFor={`entrega-${tipo}`} className={`text-sm cursor-pointer font-semibold px-2 py-0.5 rounded text-xs ${
                    form.tipo_entrega.includes(tipo) 
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

            {/* ENTREGAR COM: NF / PROTOCOLO - Checkboxes */}
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">Entregar com</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="tem-nf"
                    checked={form.tem_nf}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, tem_nf: checked === true }))}
                  />
                  <Label htmlFor="tem-nf" className="text-sm cursor-pointer font-semibold">NF</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="tem-protocolo"
                    checked={form.tem_protocolo}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, tem_protocolo: checked === true }))}
                  />
                  <Label htmlFor="tem-protocolo" className="text-sm cursor-pointer font-semibold">Protocolo</Label>
                </div>
              </div>
            </div>

            {/* DA: PRIMACOR / IMPRIMASET / CLIENTE */}
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Da</Label>
              <RadioGroupBase
                value={form.empresa_entrega}
                onValueChange={(v) => setForm((f) => ({ ...f, empresa_entrega: v }))}
                className="flex items-center gap-4 mt-1"
              >
                {["PRIMACOR", "IMPRIMASET", "CLIENTE"].map((emp) => (
                  <div key={emp} className="flex items-center gap-2">
                    <RadioGroupItem value={emp} id={`empresa-${emp}`} />
                    <Label htmlFor={`empresa-${emp}`} className={`text-sm cursor-pointer font-semibold px-2 py-0.5 rounded text-xs ${
                      form.empresa_entrega === emp
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


            {/* ENDEREÇO */}
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Endereço</Label>
              <Input value={form.entrega_endereco} onChange={(e) => setForm((f) => ({ ...f, entrega_endereco: e.target.value }))} placeholder="Endereço de entrega" className="h-9" />
            </div>

            {/* A/C */}
            <div>
              <Label className="text-xs uppercase text-muted-foreground">A/C</Label>
              <Input value={form.entrega_ac} onChange={(e) => setForm((f) => ({ ...f, entrega_ac: e.target.value }))} placeholder="Aos cuidados de..." className="h-9" />
            </div>

            {/* DATA LIMITE */}
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Data Entrega</Label>
              <Input type="datetime-local" value={form.entrega_data_limite} onChange={(e) => setForm((f) => ({ ...f, entrega_data_limite: e.target.value }))} className="h-9" />
            </div>

            {/* OBS */}
            <div>
              <Label htmlFor="obs_entrega" className="text-xs uppercase text-muted-foreground">OBS</Label>
              <Textarea id="obs_entrega" value={form.obs_entrega} onChange={(e) => setForm((f) => ({ ...f, obs_entrega: e.target.value }))} placeholder="Observações da entrega..." className="min-h-[40px]" />
            </div>

          </div>

          {/* ═══ ENVIAR PARA SETOR ═══ */}
          <div className="border rounded-lg p-3 space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Enviar para (opcional)</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={form.setor_destino === "desenvolvimento" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setForm((f) => ({ ...f, setor_destino: f.setor_destino === "desenvolvimento" ? "" : "desenvolvimento", status_destino: "" }))}
              >
                Embalagens
              </Button>
              <Button
                type="button"
                variant={form.setor_destino === "" && form.status_destino === "" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setForm((f) => ({ ...f, setor_destino: "", status_destino: "" }))}
              >
                Pré-Impressão
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Se não selecionar, a OS vai para a ENTRADA da Pré-Impressão.</p>
          </div>


          {/* Footer */}
          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" disabled={isChecking} className="flex-1">
              {isChecking ? "Verificando..." : "Criar OS"}
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
