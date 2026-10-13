import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Order } from "@/types/order";
import { DepartmentConfig, DepartmentStatusConfig, Department, DEPARTMENTS } from "@/types/production";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { GripVertical, AlertTriangle, UserCheck, Clock, Trash2, Archive, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TIPO_ENTREGA_OPTIONS = [
  { id: "carro", label: "CARRO", color: "bg-pink-600 text-white" },
  { id: "moto", label: "MOTO", color: "bg-blue-600 text-white" },
  { id: "retira", label: "RETIRA", color: "bg-yellow-500 text-black" },
];

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

interface ManutencaoCardProps {
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

export function ManutencaoCard({
  order,
  department,
  currentStatus,
  onUpdate,
  onMove,
  onSendToDepartment,
  onSendBackToPrePress,
  onArchive,
  onDelete,
  dragHandleProps,
  updatedByName,
  readOnly = false,
}: ManutencaoCardProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showExpDialog, setShowExpDialog] = useState(false);
  const [selectedTipoEntrega, setSelectedTipoEntrega] = useState<string>("");
  const [editData, setEditData] = useState({
    equipamento_manut: (order as any).equipamento_manut || "",
    setor_manut: (order as any).setor_manut || "",
    categoria_manut: (order as any).categoria_manut || "",
    descricao: order.descricao || "",
    solucao: (order as any).solucao || "",
    fornecedor_manut: (order as any).fornecedor_manut || "",
    endereco_manut: (order as any).endereco_manut || "",
    responsavel_manut: (order as any).responsavel_manut || "",
    urgente: order.urgente || false,
  });

  const isEmAndamento = currentStatus.id === "em_andamento";
  const isUrgent = order.urgente;

  const categoria = CATEGORIAS.find(c => c.id === (order as any).categoria_manut);
  const omNumero = (order as any).om_numero;

  const handleSendToExpedicao = async () => {
    if (!selectedTipoEntrega) return;

    // Create a copy in Expedição, original stays in Manutenção
    const { error } = await supabase.from("orders").insert({
      titulo: order.titulo,
      descricao: order.descricao,
      cliente: order.cliente,
      observacao: order.observacao || null,
      vendedor: order.vendedor || null,
      setor: "expedicao",
      setor_status: "entrada",
      status: order.status,
      posicao: order.urgente ? 0 : 9999,
      urgente: order.urgente,
      urgente_expedicao: order.urgente,
      tipo_entrega: [selectedTipoEntrega.toUpperCase()],
      endereco_entrega: (order as any).endereco_manut || null,
      parent_order_id: order.id,
      criado_por: order.criado_por,
      atualizado_por: order.atualizado_por,
      // Carry OM fields
      om_numero: (order as any).om_numero,
      equipamento_manut: (order as any).equipamento_manut || null,
      setor_manut: (order as any).setor_manut || null,
      categoria_manut: (order as any).categoria_manut || null,
      responsavel_manut: (order as any).responsavel_manut || null,
      fornecedor_manut: (order as any).fornecedor_manut || null,
      endereco_manut: (order as any).endereco_manut || null,
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
      urgente: editData.urgente,
      equipamento_manut: editData.equipamento_manut || null,
      setor_manut: editData.setor_manut || null,
      categoria_manut: editData.categoria_manut || null,
      solucao: editData.solucao || null,
      fornecedor_manut: editData.fornecedor_manut || null,
      endereco_manut: editData.endereco_manut || null,
      responsavel_manut: editData.responsavel_manut || null,
    } as any);
    setEditing(false);
  };

  return (
    <>
      {/* Card compact view */}
      <div
        className={`group rounded-xl border shadow-sm hover:shadow-md overflow-hidden relative`}
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

        <div className="px-3.5 pb-3 cursor-pointer" onClick={() => setOpen(true)}>
          {/* Linha 1: OM Number + Equipamento */}
          <div className="flex items-center gap-2">
            <h4 className={`font-semibold text-sm ${isUrgent ? "text-red-700 dark:text-red-400" : "text-card-foreground"}`}>
              OM. {omNumero ? String(omNumero).padStart(4, "0") : "—"}
            </h4>
            {(order as any).equipamento_manut && (
              <span className="text-sm font-medium text-card-foreground">
                {(order as any).equipamento_manut}
              </span>
            )}
          </div>

          {/* Linha 2: Setor + Responsável */}
          <div className="flex items-center justify-between mt-0.5">
            {(order as any).setor_manut ? (
              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {(order as any).setor_manut}
              </span>
            ) : <span />}
            {(order as any).responsavel_manut && (
              <span className="text-[10px] text-muted-foreground">
                Resp: {(order as any).responsavel_manut}
              </span>
            )}
          </div>

          {/* Linha 3: Descrição */}
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {order.descricao}
          </p>

          {/* Linha 4: Fornecedor */}
          {(order as any).fornecedor_manut && (
            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground/70">
              <span className="shrink-0">Forn: {(order as any).fornecedor_manut}</span>
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
            <DialogTitle>OM. {omNumero ? String(omNumero).padStart(4, "0") : "—"}</DialogTitle>
          </DialogHeader>

          {!editing ? (
            <div className="space-y-3">
              {categoria && (
                <span className={`inline-block px-3 py-1 rounded text-xs font-bold ${categoria.color}`}>
                  {categoria.label}
                </span>
              )}

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground text-xs">Equipamento:</span><p className="font-medium">{(order as any).equipamento_manut || "—"}</p></div>
                <div><span className="text-muted-foreground text-xs">Setor:</span><p className="font-medium">{(order as any).setor_manut || "—"}</p></div>
              </div>

              <div><span className="text-muted-foreground text-xs">Responsável:</span><p className="text-sm font-medium">{(order as any).responsavel_manut || "—"}</p></div>

              <div><span className="text-muted-foreground text-xs">Descrição:</span><p className="text-sm">{order.descricao}</p></div>
              <div><span className="text-muted-foreground text-xs">Solução:</span><p className="text-sm">{(order as any).solucao || "—"}</p></div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground text-xs">Fornecedor:</span><p>{(order as any).fornecedor_manut || "—"}</p></div>
                <div><span className="text-muted-foreground text-xs">Endereço:</span><p>{(order as any).endereco_manut || "—"}</p></div>
              </div>

              {isUrgent && (
                <div className="flex items-center gap-1 text-red-600 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4" /> Urgente
                </div>
              )}

              {!readOnly && isEmAndamento && (
                <div className="pt-2 border-t">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => setShowExpDialog(true)}
                  >
                    <Truck className="h-4 w-4 mr-2" /> Enviar → Expedição (Entrada)
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {!readOnly && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Editar</Button>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Equipamento</Label>
                  <Input value={editData.equipamento_manut} onChange={(e) => setEditData(d => ({ ...d, equipamento_manut: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Setor</Label>
                  <Select value={editData.setor_manut} onValueChange={(v) => setEditData(d => ({ ...d, setor_manut: v }))}>
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

              <div>
                <Label className="text-xs uppercase text-muted-foreground mb-2 block">Categoria</Label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIAS.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setEditData(d => ({ ...d, categoria_manut: cat.id }))}
                      className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                        editData.categoria_manut === cat.id
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
                <Label className="text-xs uppercase text-muted-foreground">Descrição</Label>
                <Textarea value={editData.descricao} onChange={(e) => setEditData(d => ({ ...d, descricao: e.target.value }))} className="min-h-[60px]" />
              </div>

              <div>
                <Label className="text-xs uppercase text-muted-foreground">Solução</Label>
                <Textarea value={editData.solucao} onChange={(e) => setEditData(d => ({ ...d, solucao: e.target.value }))} className="min-h-[50px]" />
              </div>

              <div>
                <Label className="text-xs uppercase text-muted-foreground">Responsável</Label>
                <Input value={editData.responsavel_manut} onChange={(e) => setEditData(d => ({ ...d, responsavel_manut: e.target.value }))} className="h-9" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Fornecedor</Label>
                  <Input value={editData.fornecedor_manut} onChange={(e) => setEditData(d => ({ ...d, fornecedor_manut: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Endereço</Label>
                  <Input value={editData.endereco_manut} onChange={(e) => setEditData(d => ({ ...d, endereco_manut: e.target.value }))} className="h-9" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="edit-om-urgente" checked={editData.urgente} onCheckedChange={(checked) => setEditData(d => ({ ...d, urgente: checked === true }))} />
                <Label htmlFor="edit-om-urgente" className={`text-sm font-medium cursor-pointer flex items-center gap-1.5 rounded px-1.5 py-0.5 ${editData.urgente ? "bg-red-600 text-white" : "text-red-600"}`}>
                  <AlertTriangle className="h-4 w-4" /> Urgente
                </Label>
              </div>

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
              OM {omNumero ? String(omNumero).padStart(4, "0") : "—"} — {(order as any).equipamento_manut || "Sem equipamento"}
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
