import { useState, useEffect } from "react";
import { Order } from "@/types/order";
import { DepartmentConfig, DepartmentStatusConfig, Department } from "@/types/production";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { GripVertical, AlertTriangle, UserCheck, Clock, Trash2, Archive, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

const CATEGORIAS_COMPRA = [
  { id: "estoque", label: "Estoque", color: "bg-blue-600 text-white" },
  { id: "os", label: "OS", color: "bg-pink-600 text-white" },
  { id: "manutencao", label: "Manutenção", color: "bg-yellow-500 text-black" },
  { id: "administrativa", label: "Administrativa", color: "bg-green-600 text-white" },
];

const TIPO_ENTREGA_OPTIONS = [
  { id: "moto", label: "MOTO", color: "bg-blue-600 text-white" },
  { id: "carro", label: "CARRO", color: "bg-pink-600 text-white" },
  { id: "retira", label: "RETIRA", color: "bg-yellow-500 text-black" },
];

interface ComprasCardProps {
  order: Order;
  department: DepartmentConfig;
  currentStatus: DepartmentStatusConfig;
  onUpdate: (id: string, data: Partial<Order>) => void;
  onMove: (id: string, newStatus: string, newIndex?: number) => void;
  onSendToDepartment: (id: string, dept: Department, machine?: string) => void;
  onSendBackToPrePress?: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: Record<string, unknown>;
  updatedByName?: string | null;
  createdByName?: string | null;
  readOnly?: boolean;
}

export function ComprasCard({
  order,
  department,
  currentStatus,
  onUpdate,
  onArchive,
  onDelete,
  dragHandleProps,
  updatedByName,
  readOnly = false,
}: ComprasCardProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showExpDialog, setShowExpDialog] = useState(false);
  const [selectedTipoEntrega, setSelectedTipoEntrega] = useState("");
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
  const [editData, setEditData] = useState({
    categoria_compra: (order as any).categoria_compra || "",
    observacao: order.observacao || "",
    descricao: order.descricao || "",
    responsavel_compra: (order as any).responsavel_compra || "",
    fornecedor_compra: (order as any).fornecedor_compra || "",
    vendedor_compra: (order as any).vendedor_compra || "",
    endereco_compra: (order as any).endereco_compra || "",
    urgente: order.urgente || false,
    prazo: order.prazo ? new Date(order.prazo).toISOString().slice(0, 16) : "",
  });

  const isUrgent = order.urgente;
  const categoria = CATEGORIAS_COMPRA.find(c => c.id === (order as any).categoria_compra);
  const ocNumero = (order as any).oc_numero;
  const isPedido = currentStatus.id === "pedido";

  const handleSendToExpedicao = async () => {
    if (!selectedTipoEntrega) return;
    const { error } = await supabase.from("orders").insert({
      titulo: order.titulo,
      descricao: order.descricao,
      cliente: order.cliente,
      observacao: order.observacao || null,
      setor: "expedicao",
      setor_status: "entrada",
      status: order.status,
      posicao: order.urgente ? 0 : 9999,
      urgente: order.urgente,
      urgente_expedicao: order.urgente,
      tipo_entrega: [selectedTipoEntrega.toUpperCase()],
      endereco_entrega: (order as any).endereco_compra || null,
      parent_order_id: order.id,
      criado_por: order.criado_por,
      atualizado_por: order.atualizado_por,
      oc_numero: (order as any).oc_numero,
      categoria_compra: (order as any).categoria_compra || null,
      responsavel_compra: (order as any).responsavel_compra || null,
      fornecedor_compra: (order as any).fornecedor_compra || null,
      vendedor_compra: (order as any).vendedor_compra || null,
      endereco_compra: (order as any).endereco_compra || null,
    } as any);

    if (error) {
      const { toast } = await import("sonner");
      toast.error("Erro ao enviar para Expedição: " + error.message);
      return;
    }

    const { toast } = await import("sonner");
    toast.success("Cópia enviada para Expedição");
    setShowExpDialog(false);
    setSelectedTipoEntrega("");
    setOpen(false);
  };

  const handleSave = () => {
    onUpdate(order.id, {
      descricao: editData.descricao,
      observacao: editData.observacao || null,
      urgente: editData.urgente,
      prazo: editData.urgente && editData.prazo ? new Date(editData.prazo).toISOString() : null,
      categoria_compra: editData.categoria_compra || null,
      responsavel_compra: editData.responsavel_compra || null,
      fornecedor_compra: editData.fornecedor_compra || null,
      vendedor_compra: editData.vendedor_compra || null,
      endereco_compra: editData.endereco_compra || null,
    } as any);
    setEditing(false);
  };

  return (
    <>
      {/* Card compact view */}
      <div
        className="group rounded-xl border shadow-sm hover:shadow-md overflow-hidden relative"
        style={{
          backgroundColor: isUrgent ? "hsl(0 84% 60% / 0.12)" : "hsl(var(--muted))",
          borderColor: isUrgent ? "hsl(0 84% 60% / 0.4)" : "hsl(var(--border))",
        }}
      >
        {/* Categoria banner with optional URGENTE */}
        {categoria ? (
          <div className={`px-2 py-0.5 text-center ${categoria.color}`}>
            {isUrgent && (
              <span className="mr-2 inline-block bg-red-600 text-white text-[10px] font-black uppercase px-1.5 py-0.5 rounded animate-pulse">URGENTE</span>
            )}
            <span className="text-[10px] font-bold uppercase tracking-wide">{categoria.label}</span>
          </div>
        ) : isUrgent ? (
          <div className="bg-red-500 text-white text-[10px] font-bold text-center py-0.5 tracking-wide uppercase flex items-center justify-center gap-1 animate-pulse">
            <AlertTriangle className="h-3 w-3" /> Urgente
          </div>
        ) : null}

        {/* Drag handle */}
        {!readOnly && dragHandleProps && (
          <div
            {...dragHandleProps}
            className="flex items-center justify-center py-1 cursor-grab active:cursor-grabbing hover:bg-black/5 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
          </div>
        )}

        <div className="px-3.5 pb-3 pt-1.5 cursor-pointer" onClick={() => setOpen(true)}>
          {/* Linha 1: OC Number + Responsável */}
          <div className="flex items-center justify-between gap-2">
            <h4 className={`font-semibold text-sm ${isUrgent ? "text-red-700 dark:text-red-400" : "text-card-foreground"}`}>
              OC. {ocNumero ? String(ocNumero).padStart(4, "0") : "—"}
            </h4>
            {(order as any).responsavel_compra && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                {(order as any).responsavel_compra}
              </span>
            )}
          </div>

          {/* Linha 2: Descrição (campo maior) */}
          <p className="text-xs text-muted-foreground line-clamp-3 mt-1">
            {order.descricao}
          </p>

          {/* Linha 3: Fornecedor + Vendedor + Endereço */}
          {((order as any).fornecedor_compra || (order as any).vendedor_compra || (order as any).endereco_compra) && (
            <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground/70 flex-wrap">
              {(order as any).fornecedor_compra && (
                <span>Forn: {(order as any).fornecedor_compra}</span>
              )}
              {(order as any).vendedor_compra && (
                <span>Vend: {(order as any).vendedor_compra}</span>
              )}
              {(order as any).endereco_compra && (
                <span>End: {(order as any).endereco_compra}</span>
              )}
            </div>
          )}

          {/* Updated by */}
          {updatedByName && (
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/60">
              <UserCheck className="h-2.5 w-2.5" /> <span>{updatedByName}</span>
              <Clock className="h-2.5 w-2.5 ml-1" />
              <span>{format(new Date(order.updated_at), "dd/MM HH:mm", { locale: ptBR })}</span>
            </div>
          )}
        </div>
      </div>

      {/* Detail dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>OC. {ocNumero ? String(ocNumero).padStart(4, "0") : "—"}</DialogTitle>
          </DialogHeader>

          {!editing ? (
            <div className="space-y-3">
              {categoria && (
                <span className={`inline-block px-3 py-1 rounded text-xs font-bold ${categoria.color}`}>
                  {categoria.label}
                </span>
              )}

              {order.observacao && <div><span className="text-muted-foreground text-xs">Observação:</span><p className="text-sm italic">{order.observacao}</p></div>}
              <div><span className="text-muted-foreground text-xs">Descrição:</span><p className="text-sm">{order.descricao}</p></div>
              <div><span className="text-muted-foreground text-xs">Responsável:</span><p className="text-sm font-medium">{(order as any).responsavel_compra || "—"}</p></div>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-muted-foreground text-xs">Fornecedor:</span><p>{(order as any).fornecedor_compra || "—"}</p></div>
                <div><span className="text-muted-foreground text-xs">Vendedor:</span><p>{(order as any).vendedor_compra || "—"}</p></div>
                <div><span className="text-muted-foreground text-xs">Endereço:</span><p>{(order as any).endereco_compra || "—"}</p></div>
              </div>

              {isUrgent && (
                <div className="flex items-center gap-1 text-red-600 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4" /> Urgente
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {!readOnly && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Editar</Button>
                    {isPedido && (
                      <Button size="sm" variant="outline" onClick={() => setShowExpDialog(true)}>
                        <Truck className="h-4 w-4 mr-2" /> Enviar → Expedição (Entrada)
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { onArchive(order.id); setOpen(false); }}>
                      <Archive className="h-4 w-4 mr-1" /> Arquivar
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { onDelete(order.id); setOpen(false); }}>
                      <Trash2 className="h-4 w-4 mr-1" /> Excluir
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Categoria */}
              <div>
                <Label className="text-xs uppercase text-muted-foreground mb-2 block">Categoria</Label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIAS_COMPRA.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setEditData(d => ({ ...d, categoria_compra: cat.id }))}
                      className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                        editData.categoria_compra === cat.id
                          ? `${cat.color} ring-2 ring-offset-1 ring-primary/40 scale-105`
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase text-muted-foreground">Observação</Label>
                <Textarea value={editData.observacao} onChange={(e) => setEditData(d => ({ ...d, observacao: e.target.value }))} className="min-h-[50px]" />
              </div>

              <div>
                <Label className="text-xs uppercase text-muted-foreground">Descrição</Label>
                <Textarea value={editData.descricao} onChange={(e) => setEditData(d => ({ ...d, descricao: e.target.value }))} className="min-h-[60px]" />
              </div>

              <div>
                <Label className="text-xs uppercase text-muted-foreground">Responsável</Label>
                <Select value={editData.responsavel_compra} onValueChange={(v) => setEditData(d => ({ ...d, responsavel_compra: v }))}>
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Fornecedor</Label>
                  <Input value={editData.fornecedor_compra} onChange={(e) => setEditData(d => ({ ...d, fornecedor_compra: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Vendedor</Label>
                  <Input value={editData.vendedor_compra} onChange={(e) => setEditData(d => ({ ...d, vendedor_compra: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Endereço</Label>
                  <Input value={editData.endereco_compra} onChange={(e) => setEditData(d => ({ ...d, endereco_compra: e.target.value }))} className="h-9" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="edit-oc-urgente" checked={editData.urgente} onCheckedChange={(checked) => setEditData(d => ({ ...d, urgente: checked === true, prazo: checked ? d.prazo : "" }))} />
                <Label htmlFor="edit-oc-urgente" className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 ${editData.urgente ? "bg-red-600 text-white" : "text-red-600"}`}>
                  <AlertTriangle className="h-4 w-4" /> Urgente
                </Label>
              </div>

              {editData.urgente && (
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Data/Hora Limite</Label>
                  <Input
                    type="datetime-local"
                    value={editData.prazo}
                    onChange={(e) => setEditData(d => ({ ...d, prazo: e.target.value }))}
                    className="h-9"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave}>Salvar</Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Expedição confirmation dialog */}
      <AlertDialog open={showExpDialog} onOpenChange={setShowExpDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar para Expedição</AlertDialogTitle>
            <AlertDialogDescription>
              OC {ocNumero ? String(ocNumero).padStart(4, "0") : "—"} — {order.descricao?.slice(0, 60)}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div>
            <Label className="text-xs uppercase text-muted-foreground mb-2 block">Tipo de Entrega *</Label>
            <div className="flex gap-2">
              {TIPO_ENTREGA_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedTipoEntrega(opt.id)}
                  className={`px-4 py-2 rounded text-xs font-bold transition-all ${
                    selectedTipoEntrega === opt.id
                      ? `${opt.color} ring-2 ring-offset-1 ring-primary/40 scale-105`
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedTipoEntrega("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendToExpedicao} disabled={!selectedTipoEntrega}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
