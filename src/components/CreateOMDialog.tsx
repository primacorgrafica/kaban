import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import { Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const SETORES_MANUT = [
  "Acabamento", "Pré-impressão", "Off-set", "Digital", "Expedição", "Predial", "Estoque",
];

const CATEGORIAS = [
  { id: "mecanica", label: "Mecânica", color: "bg-blue-600 text-white" },
  { id: "eletrica", label: "Elétrica", color: "bg-pink-600 text-white" },
  { id: "predial", label: "Predial", color: "bg-gray-500 text-white" },
  { id: "ti", label: "TI", color: "bg-yellow-400 text-black" },
  { id: "melhoria", label: "Melhoria", color: "bg-green-500 text-white" },
];

export function CreateOMDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [equipamentosList, setEquipamentosList] = useState<string[]>([]);

  useEffect(() => {
    const fetchEquipamentos = async () => {
      const { data } = await supabase.from("equipamentos").select("nome").order("nome");
      if (data) setEquipamentosList(data.map((e: any) => e.nome));
    };
    fetchEquipamentos();
  }, []);
  const [form, setForm] = useState({
    equipamento_manut: "",
    setor_manut: "",
    categoria_manut: "",
    descricao: "",
    solucao: "",
    fornecedor_manut: "",
    endereco_manut: "",
    responsavel_manut: "",
    urgente: false,
  });

  const resetForm = () => {
    setForm({
      equipamento_manut: "", setor_manut: "", categoria_manut: "",
      descricao: "", solucao: "", fornecedor_manut: "", endereco_manut: "",
      responsavel_manut: "", urgente: false,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descricao.trim()) {
      toast.error("Preencha a Descrição");
      return;
    }
    if (!form.categoria_manut) {
      toast.error("Selecione uma Categoria");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("orders").insert({
      titulo: "OM",
      descricao: form.descricao.trim(),
      cliente: form.setor_manut.trim() || "Manutenção",
      observacao: form.solucao.trim() || null,
      setor: "manutencao",
      setor_status: "entrada",
      status: "fila_de_entrada",
      urgente: form.urgente,
      criado_por: user?.id || null,
      atualizado_por: user?.id || null,
      equipamento_manut: form.equipamento_manut.trim() || null,
      setor_manut: form.setor_manut.trim() || null,
      categoria_manut: form.categoria_manut,
      solucao: form.solucao.trim() || null,
      fornecedor_manut: form.fornecedor_manut.trim() || null,
      endereco_manut: form.endereco_manut.trim() || null,
      responsavel_manut: form.responsavel_manut.trim() || null,
    } as any);
    setLoading(false);

    if (error) {
      toast.error("Erro ao criar OM: " + error.message);
      return;
    }

    resetForm();
    setOpen(false);
    toast.success("OM criada com sucesso");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nova OM
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Manutenção</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Equipamento + Setor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Equipamento</Label>
              <Input value={form.equipamento_manut} onChange={(e) => setForm(f => ({ ...f, equipamento_manut: e.target.value }))} placeholder="Nome do equipamento" className="h-9" list="equipamentos-list" />
              <datalist id="equipamentos-list">
                {equipamentosList.map((nome) => (
                  <option key={nome} value={nome} />
                ))}
              </datalist>
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Setor</Label>
              <Select value={form.setor_manut} onValueChange={(v) => setForm(f => ({ ...f, setor_manut: v }))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione o setor" />
                </SelectTrigger>
                <SelectContent>
                  {SETORES_MANUT.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Categoria */}
          <div>
            <Label className="text-xs uppercase text-muted-foreground mb-2 block">Categoria *</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, categoria_manut: cat.id }))}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                    form.categoria_manut === cat.id
                      ? `${cat.color} ring-2 ring-offset-1 ring-primary/40 scale-105`
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Descrição */}
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Descrição *</Label>
            <Textarea value={form.descricao} onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descreva o problema ou serviço..." className="min-h-[60px]" />
          </div>

          {/* Solução */}
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Solução</Label>
            <Textarea value={form.solucao} onChange={(e) => setForm(f => ({ ...f, solucao: e.target.value }))} placeholder="Solução aplicada..." className="min-h-[50px]" />
          </div>

          <div>
            <Label className="text-xs uppercase text-muted-foreground">Responsável</Label>
            <Input value={form.responsavel_manut} onChange={(e) => setForm(f => ({ ...f, responsavel_manut: e.target.value }))} placeholder="Nome do responsável" className="h-9" />
          </div>

          {/* Fornecedor + Endereço */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Fornecedor</Label>
              <Input value={form.fornecedor_manut} onChange={(e) => setForm(f => ({ ...f, fornecedor_manut: e.target.value }))} placeholder="Nome do fornecedor" className="h-9" />
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Endereço</Label>
              <Input value={form.endereco_manut} onChange={(e) => setForm(f => ({ ...f, endereco_manut: e.target.value }))} placeholder="Endereço" className="h-9" />
            </div>
          </div>

          {/* Urgente */}
          <div className="flex items-center gap-2">
            <Checkbox id="om-urgente" checked={form.urgente} onCheckedChange={(checked) => setForm(f => ({ ...f, urgente: checked === true }))} />
            <Label htmlFor="om-urgente" className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${form.urgente ? "bg-red-600 text-white animate-pulse" : "text-red-600"}`}>
              <AlertTriangle className="h-4 w-4" /> Urgente
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando..." : "Criar OM"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
