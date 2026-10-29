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

const CATEGORIAS_COMPRA = [
  { id: "estoque", label: "Estoque", color: "bg-blue-600 text-white" },
  { id: "os", label: "OS", color: "bg-sky-600 text-white" },
  { id: "manutencao", label: "Manutenção", color: "bg-yellow-500 text-black" },
  { id: "administrativa", label: "Administrativa", color: "bg-green-600 text-white" },
];

export function CreateOCDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("user_id, nome").order("nome"),
        supabase.from("user_roles").select("user_id, role").eq("role", "operador"),
      ]);
      const operadorIds = new Set((roles || []).map(r => r.user_id));
      if (profiles) setUsuarios(profiles.filter(p => !operadorIds.has(p.user_id)).map(p => ({ id: p.user_id, nome: p.nome })));
    };
    fetchUsers();
  }, []);
  const [form, setForm] = useState({
    categoria_compra: "",
    observacao: "",
    descricao: "",
    responsavel_compra: "",
    fornecedor_compra: "",
    vendedor_compra: "",
    endereco_compra: "",
    urgente: false,
    prazo: "",
  });

  const resetForm = () => {
    setForm({
      categoria_compra: "",
      observacao: "",
      descricao: "",
      responsavel_compra: "",
      fornecedor_compra: "",
      vendedor_compra: "",
      endereco_compra: "",
      urgente: false,
      prazo: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descricao.trim()) {
      toast.error("Preencha a Descrição");
      return;
    }
    if (!form.categoria_compra) {
      toast.error("Selecione uma Categoria");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("orders").insert({
      titulo: "OC",
      descricao: form.descricao.trim(),
      observacao: form.observacao.trim() || null,
      cliente: form.categoria_compra,
      setor: "compras",
      setor_status: "entrada",
      status: "fila_de_entrada",
      urgente: form.urgente,
      prazo: form.urgente && form.prazo ? new Date(form.prazo).toISOString() : null,
      criado_por: user?.id || null,
      atualizado_por: user?.id || null,
      categoria_compra: form.categoria_compra,
      responsavel_compra: form.responsavel_compra.trim() || null,
      fornecedor_compra: form.fornecedor_compra.trim() || null,
      vendedor_compra: form.vendedor_compra.trim() || null,
      endereco_compra: form.endereco_compra.trim() || null,
    } as any);
    setLoading(false);

    if (error) {
      toast.error("Erro ao criar OC: " + error.message);
      return;
    }

    resetForm();
    setOpen(false);
    toast.success("OC criada com sucesso");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nova OC
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Compra</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Categoria */}
          <div>
            <Label className="text-xs uppercase text-muted-foreground mb-2 block">Categoria *</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS_COMPRA.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, categoria_compra: cat.id }))}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                    form.categoria_compra === cat.id
                      ? `${cat.color} ring-2 ring-offset-1 ring-primary/40 scale-105`
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Observação */}
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Observação</Label>
            <Textarea value={form.observacao} onChange={(e) => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Observações..." className="min-h-[50px]" />
          </div>

          {/* Descrição */}
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Descrição *</Label>
            <Textarea value={form.descricao} onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descreva a compra..." className="min-h-[60px]" />
          </div>

          {/* Responsável */}
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Responsável</Label>
            <Select value={form.responsavel_compra} onValueChange={(v) => setForm(f => ({ ...f, responsavel_compra: v }))}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione o responsável" />
              </SelectTrigger>
              <SelectContent>
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.nome}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fornecedor + Vendedor + Endereço */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Fornecedor</Label>
              <Input value={form.fornecedor_compra} onChange={(e) => setForm(f => ({ ...f, fornecedor_compra: e.target.value }))} placeholder="Fornecedor" className="h-9" />
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Vendedor</Label>
              <Input value={form.vendedor_compra} onChange={(e) => setForm(f => ({ ...f, vendedor_compra: e.target.value }))} placeholder="Vendedor" className="h-9" />
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Endereço</Label>
              <Input value={form.endereco_compra} onChange={(e) => setForm(f => ({ ...f, endereco_compra: e.target.value }))} placeholder="Endereço" className="h-9" />
            </div>
          </div>

          {/* Urgente */}
          <div className="flex items-center gap-2">
            <Checkbox id="oc-urgente" checked={form.urgente} onCheckedChange={(checked) => setForm(f => ({ ...f, urgente: checked === true, prazo: checked ? f.prazo : "" }))} />
            <Label htmlFor="oc-urgente" className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${form.urgente ? "bg-red-600 text-white animate-pulse" : "text-red-600"}`}>
              <AlertTriangle className="h-4 w-4" /> Urgente
            </Label>
          </div>

          {form.urgente && (
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Data/Hora Limite</Label>
              <Input
                type="datetime-local"
                value={form.prazo}
                onChange={(e) => setForm(f => ({ ...f, prazo: e.target.value }))}
                className="h-9"
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando..." : "Criar OC"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
