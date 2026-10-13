import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link } from "react-router-dom";
import { ArrowLeft, LogOut, Wrench, Plus, Trash2, Pencil, Search, FileDown } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoSidebar from "@/assets/logo-sidebar.png";

interface Equipamento {
  id: string;
  codigo: string;
  nome: string;
  setor: string | null;
  fabricante: string | null;
  modelo: string | null;
  ano_fabricacao: number | null;
  especificacoes: string | null;
  consumiveis: string | null;
  pecas_sobressalentes: string | null;
  manutencoes: string | null;
  apontamentos: string | null;
  operadores: string[] | null;
  created_at: string;
}

interface FormData {
  codigo: string;
  nome: string;
  setor: string;
  fabricante: string;
  modelo: string;
  ano_fabricacao: string;
  especificacoes: string;
  consumiveis: string;
  pecas_sobressalentes: string;
  manutencoes: string;
  apontamentos: string;
  operadores: string[];
}

const EMPTY_FORM: FormData = {
  codigo: "",
  nome: "",
  setor: "",
  fabricante: "",
  modelo: "",
  ano_fabricacao: "",
  especificacoes: "",
  consumiveis: "",
  pecas_sobressalentes: "",
  manutencoes: "",
  apontamentos: "",
  operadores: [],
};

export default function EquipamentosPage() {
  const { signOut, user: currentUser } = useAuth();
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [operadorNames, setOperadorNames] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSetor, setFilterSetor] = useState("");
  const [filterFabricante, setFilterFabricante] = useState("");

  const SETORES_PRODUCAO = ["Pré-Impressão", "CTP", "Digital", "Off-Set", "Acabamento", "Expedição"];
  const uniqueSetores = SETORES_PRODUCAO;
  const uniqueFabricantes = [...new Set(equipamentos.map((e) => e.fabricante).filter(Boolean))].sort() as string[];

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  // View / Edit dialog
  const [selectedEquip, setSelectedEquip] = useState<Equipamento | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Equipamento | null>(null);
  const [deleting, setDeleting] = useState(false);

  // OM history for selected equipment
  const [omHistory, setOmHistory] = useState<{ om_numero: number | null; updated_at: string; descricao: string }[]>([]);

  const fetchEquipamentos = useCallback(async () => {
    const { data } = await supabase
      .from("equipamentos")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setEquipamentos(data as unknown as Equipamento[]);
    setLoading(false);
  }, []);

  const fetchOperadores = useCallback(async () => {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "operador");
    if (!roles || roles.length === 0) { setOperadorNames([]); return; }
    const userIds = roles.map((r: any) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("nome")
      .in("user_id", userIds);
    if (profiles) {
      setOperadorNames(profiles.map((p: any) => p.nome).sort());
    }
  }, []);

  useEffect(() => { fetchEquipamentos(); fetchOperadores(); }, [fetchEquipamentos, fetchOperadores]);

  const updateField = (setter: React.Dispatch<React.SetStateAction<FormData>>) => (field: string, value: string) => {
    setter((prev) => ({ ...prev, [field]: value }));
  };

  const toggleOperador = (setter: React.Dispatch<React.SetStateAction<FormData>>, nome: string) => {
    setter((prev) => {
      const current = prev.operadores;
      const next = current.includes(nome) ? current.filter((n) => n !== nome) : [...current, nome];
      return { ...prev, operadores: next };
    });
  };

  const formToInsert = (f: FormData) => ({
    codigo: f.codigo.trim(),
    nome: f.nome.trim(),
    setor: f.setor.trim() || null,
    fabricante: f.fabricante.trim() || null,
    modelo: f.modelo.trim() || null,
    ano_fabricacao: f.ano_fabricacao ? parseInt(f.ano_fabricacao) : null,
    especificacoes: f.especificacoes.trim() || null,
    consumiveis: f.consumiveis.trim() || null,
    pecas_sobressalentes: f.pecas_sobressalentes.trim() || null,
    manutencoes: f.manutencoes.trim() || null,
    apontamentos: f.apontamentos.trim() || null,
    operadores: f.operadores.length > 0 ? f.operadores : null,
  });

  const equipToForm = (eq: Equipamento): FormData => ({
    codigo: eq.codigo || "",
    nome: eq.nome || "",
    setor: eq.setor || "",
    fabricante: eq.fabricante || "",
    modelo: eq.modelo || "",
    ano_fabricacao: eq.ano_fabricacao?.toString() || "",
    especificacoes: eq.especificacoes || "",
    consumiveis: eq.consumiveis || "",
    pecas_sobressalentes: eq.pecas_sobressalentes || "",
    manutencoes: eq.manutencoes || "",
    apontamentos: eq.apontamentos || "",
    operadores: eq.operadores || [],
  });

  const handleCreate = async () => {
    if (!form.codigo.trim() || !form.nome.trim()) {
      toast.error("Código e Nome são obrigatórios");
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("equipamentos").insert(formToInsert(form) as any);
    if (error) {
      toast.error("Erro ao cadastrar equipamento");
    } else {
      toast.success("Equipamento cadastrado!");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      fetchEquipamentos();
    }
    setCreating(false);
  };

  const openView = async (eq: Equipamento) => {
    setSelectedEquip(eq);
    setEditMode(false);
    setViewOpen(true);
    // Fetch OM history for this equipment
    const { data } = await supabase
      .from("orders")
      .select("om_numero, updated_at, descricao")
      .eq("setor", "manutencao")
      .eq("equipamento_manut", eq.nome)
      .order("updated_at", { ascending: false });
    setOmHistory((data as any[]) || []);
  };

  const startEdit = () => {
    if (!selectedEquip) return;
    setEditForm(equipToForm(selectedEquip));
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedEquip) return;
    if (!editForm.codigo.trim() || !editForm.nome.trim()) {
      toast.error("Código e Nome são obrigatórios");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("equipamentos").update(formToInsert(editForm) as any).eq("id", selectedEquip.id);
    if (error) {
      toast.error("Erro ao atualizar equipamento");
    } else {
      toast.success("Equipamento atualizado!");
      setViewOpen(false);
      setSelectedEquip(null);
      fetchEquipamentos();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("equipamentos").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error("Erro ao excluir equipamento");
    } else {
      toast.success(`Equipamento "${deleteTarget.nome}" excluído`);
      setEquipamentos((prev) => prev.filter((e) => e.id !== deleteTarget.id));
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const exportEquipamentoPDF = (eq: Equipamento) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Logo
    try {
      doc.addImage(logoSidebar, "PNG", 14, 10, 40, 14);
    } catch {}

    // Title
    doc.setFontSize(16);
    doc.setTextColor(30, 64, 175);
    doc.text("Cadastro de Equipamento", 14, 34);

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 40);

    // Info table
    const rows: string[][] = [
      ["Código", eq.codigo || "—"],
      ["Nome", eq.nome || "—"],
      ["Setor", eq.setor || "—"],
      ["Fabricante", eq.fabricante || "—"],
      ["Modelo", eq.modelo || "—"],
      ["Ano de Fabricação", eq.ano_fabricacao ? String(eq.ano_fabricacao) : "—"],
      ["Operadores", eq.operadores && eq.operadores.length > 0 ? eq.operadores.join(", ") : "—"],
    ];

    autoTable(doc, {
      startY: 46,
      head: [["Campo", "Valor"]],
      body: rows,
      theme: "grid",
      headStyles: { fillColor: [30, 64, 175], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 45, fontStyle: "bold" } },
    });

    // Long text fields
    const textFields: { label: string; value: string | null }[] = [
      { label: "Especificações", value: eq.especificacoes },
      { label: "Consumíveis", value: eq.consumiveis },
      { label: "Peças Sobressalentes", value: eq.pecas_sobressalentes },
      { label: "Manutenções", value: eq.manutencoes },
      { label: "Apontamentos", value: eq.apontamentos },
    ];

    let currentY = (doc as any).lastAutoTable?.finalY || 100;

    for (const field of textFields) {
      if (currentY > 260) {
        doc.addPage();
        currentY = 20;
      }
      currentY += 8;
      doc.setFontSize(10);
      doc.setTextColor(30, 64, 175);
      doc.text(field.label, 14, currentY);
      currentY += 5;
      doc.setFontSize(9);
      doc.setTextColor(60);
      const text = field.value || "—";
      const lines = doc.splitTextToSize(text, pageWidth - 28);
      doc.text(lines, 14, currentY);
      currentY += lines.length * 4.5;
    }

    // OM History
    if (omHistory.length > 0) {
      if (currentY > 240) {
        doc.addPage();
        currentY = 20;
      }
      currentY += 8;
      doc.setFontSize(10);
      doc.setTextColor(30, 64, 175);
      doc.text("Histórico de OMs", 14, currentY);

      const omRows = omHistory.map((om) => [
        om.om_numero ? String(om.om_numero).padStart(4, "0") : "—",
        format(new Date(om.updated_at), "dd/MM/yyyy"),
        om.descricao,
      ]);

      autoTable(doc, {
        startY: currentY + 3,
        head: [["OM", "Última Atualização", "Descrição"]],
        body: omRows,
        theme: "grid",
        headStyles: { fillColor: [30, 64, 175], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
      });
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(160);
      doc.text(`Página ${i} de ${pageCount}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 8);
    }

    doc.save(`Equipamento_${(eq.nome || eq.codigo).replace(/\s+/g, "_")}.pdf`);
    toast.success("PDF gerado com sucesso!");
  };

  const renderFormFields = (
    data: FormData,
    onChange: (field: string, value: string) => void,
    readOnly = false,
    onToggleOp?: (nome: string) => void,
    showOmHistory = false
  ) => (
    <div className="space-y-4 max-h-[60vh] overflow-auto pr-1">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Código *</Label>
          <Input value={data.codigo} onChange={(e) => onChange("codigo", e.target.value)} readOnly={readOnly} />
        </div>
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input value={data.nome} onChange={(e) => onChange("nome", e.target.value)} readOnly={readOnly} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Setor</Label>
          {readOnly ? (
            <p className="text-sm text-muted-foreground">{data.setor || "—"}</p>
          ) : (
            <Select value={data.setor} onValueChange={(v) => onChange("setor", v === "_none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Nenhum</SelectItem>
                {uniqueSetores.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Fabricante</Label>
          {readOnly ? (
            <p className="text-sm text-muted-foreground">{data.fabricante || "—"}</p>
          ) : (
            <Input
              value={data.fabricante}
              onChange={(e) => onChange("fabricante", e.target.value)}
              placeholder="Digite o fabricante"
            />
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Modelo</Label>
          <Input value={data.modelo} onChange={(e) => onChange("modelo", e.target.value)} readOnly={readOnly} />
        </div>
        <div className="space-y-1.5">
          <Label>Ano Fabricação</Label>
          <Input type="number" value={data.ano_fabricacao} onChange={(e) => onChange("ano_fabricacao", e.target.value)} readOnly={readOnly} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Operadores</Label>
        {readOnly ? (
          <p className="text-sm text-muted-foreground">{data.operadores.length > 0 ? data.operadores.join(", ") : "—"}</p>
        ) : (
          <div className="border border-input rounded-md p-3 space-y-2 max-h-32 overflow-auto">
            {operadorNames.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum operador cadastrado</p>
            ) : (
              operadorNames.map((nome) => (
                <label key={nome} className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox
                    checked={data.operadores.includes(nome)}
                    onCheckedChange={() => onToggleOp?.(nome)}
                  />
                  {nome}
                </label>
              ))
            )}
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Especificações</Label>
        <Textarea value={data.especificacoes} onChange={(e) => onChange("especificacoes", e.target.value)} readOnly={readOnly} rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label>Consumíveis</Label>
        <Textarea value={data.consumiveis} onChange={(e) => onChange("consumiveis", e.target.value)} readOnly={readOnly} rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label>Peças Sobressalentes</Label>
        <Textarea value={data.pecas_sobressalentes} onChange={(e) => onChange("pecas_sobressalentes", e.target.value)} readOnly={readOnly} rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label>Manutenções</Label>
        <Textarea value={data.manutencoes} onChange={(e) => onChange("manutencoes", e.target.value)} readOnly={readOnly} rows={3} />
        {showOmHistory && omHistory.length > 0 && (
          <div className="mt-2 border border-border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">OM</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Última Atualização</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {omHistory.map((om, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-2 py-1.5 font-mono">{om.om_numero ? String(om.om_numero).padStart(4, "0") : "—"}</td>
                    <td className="px-2 py-1.5">{format(new Date(om.updated_at), "dd/MM/yyyy")}</td>
                    <td className="px-2 py-1.5 truncate max-w-[200px]">{om.descricao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showOmHistory && omHistory.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">Nenhuma OM arquivada para este equipamento.</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Apontamentos</Label>
        <Textarea value={data.apontamentos} onChange={(e) => onChange("apontamentos", e.target.value)} readOnly={readOnly} rows={3} />
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className="hidden lg:flex w-56 flex-col text-sidebar-foreground"
        style={{ background: "var(--gradient-sidebar)" }}
      >
        <div className="px-5 py-5 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
            <Wrench className="h-4 w-4" />
          </div>
          <h1 className="text-base font-bold text-sidebar-primary-foreground tracking-tight">Equipamentos</h1>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          <div className="px-3 py-2 text-xs text-sidebar-foreground/40 uppercase tracking-wider">Resumo</div>
          <div className="flex items-center justify-between px-3 py-2 text-sm text-sidebar-foreground/70">
            <span>Total Cadastrados</span>
            <span className="text-xs text-sidebar-foreground/40">{equipamentos.length}</span>
          </div>
        </nav>

        <div className="px-3 py-2 border-t border-sidebar-border/50">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>

        <div className="px-3 py-3 border-t border-sidebar-border/50">
          <div className="text-xs text-sidebar-foreground/40 truncate mb-2 px-3">{currentUser?.email}</div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border/50 flex items-center gap-3 px-4 flex-shrink-0 glass">
          <Link to="/" className="lg:hidden">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <Wrench className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Cadastro de Equipamentos</h2>
          <div className="flex-1" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, fabricante, operador..."
              className="h-9 w-64 pl-9 text-sm"
            />
          </div>

          <Select value={filterSetor} onValueChange={setFilterSetor}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="Setor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Setores</SelectItem>
              {uniqueSetores.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterFabricante} onValueChange={setFilterFabricante}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="Fabricante" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos Fabricantes</SelectItem>
              {uniqueFabricantes.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Novo Equipamento
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>Cadastrar Novo Equipamento</DialogTitle>
              </DialogHeader>
              {renderFormFields(form, updateField(setForm), false, (nome) => toggleOperador(setForm, nome))}
              <Button className="w-full mt-2" onClick={handleCreate} disabled={creating}>
                {creating ? "Cadastrando..." : "Cadastrar Equipamento"}
              </Button>
            </DialogContent>
          </Dialog>
        </header>

        <main className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">Carregando...</div>
          ) : equipamentos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <Wrench className="h-10 w-10 opacity-30" />
              <p>Nenhum equipamento cadastrado</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Fabricante</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="w-[120px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipamentos
                    .filter((eq) => {
                      if (searchQuery.trim()) {
                        const q = searchQuery.toLowerCase();
                        const matchSearch =
                          (eq.nome || "").toLowerCase().includes(q) ||
                          (eq.fabricante || "").toLowerCase().includes(q) ||
                          (eq.operadores || []).some((op) => op.toLowerCase().includes(q));
                        if (!matchSearch) return false;
                      }
                      if (filterSetor && filterSetor !== "todos" && eq.setor !== filterSetor) return false;
                      if (filterFabricante && filterFabricante !== "todos" && eq.fabricante !== filterFabricante) return false;
                      return true;
                    })
                    .map((eq) => (
                    <TableRow key={eq.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openView(eq)}>
                      <TableCell className="font-mono text-xs">{eq.codigo || "—"}</TableCell>
                      <TableCell className="font-medium text-sm">{eq.nome}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{eq.setor || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{eq.fabricante || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{eq.modelo || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                            setSelectedEquip(eq);
                            setEditForm(equipToForm(eq));
                            setEditMode(true);
                            setViewOpen(true);
                          }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(eq)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </main>
      </div>

      {/* View / Edit Dialog */}
      <Dialog open={viewOpen} onOpenChange={(open) => { setViewOpen(open); if (!open) { setEditMode(false); setSelectedEquip(null); } }}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-8">
              <span>{editMode ? "Editar Equipamento" : "Detalhes do Equipamento"}</span>
              {!editMode && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => selectedEquip && exportEquipamentoPDF(selectedEquip)}>
                    <FileDown className="h-3.5 w-3.5" /> PDF
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={startEdit}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>
          {editMode
            ? renderFormFields(editForm, updateField(setEditForm), false, (nome) => toggleOperador(setEditForm, nome), true)
            : selectedEquip && renderFormFields(equipToForm(selectedEquip), () => {}, true, undefined, true)
          }
          {editMode && (
            <Button className="w-full mt-2" onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Equipamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o equipamento <strong>"{deleteTarget?.nome}"</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
