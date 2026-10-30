import { useState, useEffect } from "react";
import { Order } from "@/types/order";
import { DepartmentConfig, DepartmentStatusConfig, Department } from "@/types/production";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { GripVertical, AlertTriangle, UserCheck, Clock, Trash2, Archive, Truck, Palette, ShoppingCart, Check } from "lucide-react";
import {
  isSpecialSupplyActive,
  isSpecialSupplySent,
  getSpecialSupplyCustomText,
  toggleSpecialSupplySent,
} from "@/lib/processos";
import { toast } from "sonner";
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
  { id: "os", label: "OS", color: "bg-sky-600 text-white" },
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

  // Identificação da O.S. vinculada: Se a ordem veio de uma O.S. (categoria_compra === "os", possui parent_order_id ou título diferente de "OC"),
  // exibimos com prioridade o número da O.S. correspondente para identificar de qual O.S foi comprado o insumo.
  const isFromOS = (order as any).categoria_compra === "os" || !!order.parent_order_id || (!!order.titulo && order.titulo !== "OC");
  const formattedOsNumber = order.titulo
    ? order.titulo.toUpperCase().startsWith("OS")
      ? order.titulo
      : order.titulo.startsWith("#")
      ? `OS. ${order.titulo}`
      : `OS. #${order.titulo}`
    : "";

  const displayCardNumber = isFromOS && formattedOsNumber
    ? formattedOsNumber
    : ocNumero
    ? `OC. ${String(ocNumero).padStart(4, "0")}`
    : formattedOsNumber || "OS";

  const pantoneActive = isSpecialSupplyActive(order.processos, "PANTONE");
  const pantoneSent = isSpecialSupplySent(order.processos, "PANTONE");
  const pantoneText = getSpecialSupplyCustomText(order.processos, "PANTONE");

  const outrosActive = isSpecialSupplyActive(order.processos, "OUTROS");
  const outrosSent = isSpecialSupplySent(order.processos, "OUTROS");
  const outrosText = getSpecialSupplyCustomText(order.processos, "OUTROS");

  const hasItemsToBuy = pantoneActive || outrosActive;

  const isExplicitComprado = order.processos?.some(
    (p) => p === "COMPRADO" || p.startsWith("COMPRADO:") || p === "COMPRA:ok" || p.startsWith("COMPRA:ok:")
  );
  const isComprado = isExplicitComprado || (hasItemsToBuy && (!pantoneActive || pantoneSent) && (!outrosActive || outrosSent));

  const toggleComprado = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let currentProcessos = order.processos ? [...order.processos] : [];
    const opName = (order as any).responsavel_compra || updatedByName || "Compras";

    if (isComprado) {
      currentProcessos = currentProcessos.filter(
        (p) => !p.startsWith("COMPRADO") && !p.startsWith("COMPRA:ok")
      );
      if (pantoneActive && pantoneSent) {
        currentProcessos = toggleSpecialSupplySent(currentProcessos, "PANTONE");
      }
      if (outrosActive && outrosSent) {
        currentProcessos = toggleSpecialSupplySent(currentProcessos, "OUTROS");
      }
      onUpdate(order.id, { processos: currentProcessos });
      if (order.parent_order_id) {
        await supabase.from("orders").update({ processos: currentProcessos }).eq("id", order.parent_order_id);
      }
      toast.info("Status alterado para PENDENTE DE COMPRA");
    } else {
      currentProcessos = currentProcessos.filter(
        (p) => !p.startsWith("COMPRADO") && !p.startsWith("COMPRA:ok")
      );
      currentProcessos.push(`COMPRADO:${Date.now()}:${encodeURIComponent(opName)}`);

      if (pantoneActive && !pantoneSent) {
        currentProcessos = toggleSpecialSupplySent(currentProcessos, "PANTONE", opName);
      }
      if (outrosActive && !outrosSent) {
        currentProcessos = toggleSpecialSupplySent(currentProcessos, "OUTROS", opName);
      }
      onUpdate(order.id, { processos: currentProcessos });
      if (order.parent_order_id) {
        await supabase.from("orders").update({ processos: currentProcessos }).eq("id", order.parent_order_id);
      }
      toast.success("O.S. marcada como COMPRADO (Verde)!");
    }
  };

  const toggleItemBought = async (itemId: "PANTONE" | "OUTROS", e: React.MouseEvent) => {
    e.stopPropagation();
    let currentProcessos = order.processos ? [...order.processos] : [];
    const opName = (order as any).responsavel_compra || updatedByName || "Compras";
    currentProcessos = toggleSpecialSupplySent(currentProcessos, itemId, opName);

    const isP = itemId === "PANTONE" ? !pantoneSent : pantoneSent;
    const isO = itemId === "OUTROS" ? !outrosSent : outrosSent;

    if ((!pantoneActive || isP) && (!outrosActive || isO)) {
      if (!currentProcessos.some((p) => p.startsWith("COMPRADO"))) {
        currentProcessos.push(`COMPRADO:${Date.now()}:${encodeURIComponent(opName)}`);
      }
    } else {
      currentProcessos = currentProcessos.filter((p) => !p.startsWith("COMPRADO"));
    }

    onUpdate(order.id, { processos: currentProcessos });
    if (order.parent_order_id) {
      await supabase.from("orders").update({ processos: currentProcessos }).eq("id", order.parent_order_id);
    }
    toast.success(`${itemId} atualizado!`);
  };

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
        className="group rounded-xl border shadow-sm hover:shadow-md overflow-hidden relative transition-all"
        style={{
          backgroundColor: isComprado
            ? "hsl(142 76% 36% / 0.12)"
            : isUrgent
            ? "hsl(0 84% 60% / 0.12)"
            : "hsl(var(--muted))",
          borderColor: isComprado
            ? "hsl(142 71% 45% / 0.8)"
            : isUrgent
            ? "hsl(0 84% 60% / 0.4)"
            : "hsl(var(--border))",
        }}
      >
        {/* Banner de status / categoria */}
        {isComprado ? (
          <div className="px-2 py-0.5 text-center bg-emerald-600 text-white font-extrabold text-[10px] tracking-wide uppercase flex items-center justify-center gap-1.5 shadow-sm">
            <Check className="h-3 w-3 stroke-[3]" />
            <span>COMPRA CONCLUÍDA</span>
          </div>
        ) : categoria ? (
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
          {/* Linha 1: OC / OS Number + Cliente */}
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              {isUrgent && <span className="h-2 w-2 rounded-full shrink-0 bg-red-500 animate-pulse mt-0.5" />}
              <span
                className="font-mono-tech text-[12px] font-bold px-1.5 py-0.5 rounded bg-[#253745] text-[#CCD0CF] border border-[#4A5C6A]/50 shrink-0"
                title={ocNumero ? `Ordem de Compra: OC. ${String(ocNumero).padStart(4, "0")}` : undefined}
              >
                {displayCardNumber}
              </span>
              {order.cliente && (
                <span className="text-xs font-bold text-foreground truncate uppercase max-w-[170px]" title={order.cliente}>
                  {order.cliente}
                </span>
              )}
            </div>
            {(order as any).responsavel_compra && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                {(order as any).responsavel_compra}
              </span>
            )}
          </div>

          {/* Linha 2: Descrição */}
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
            {order.descricao}
          </p>

          {/* Insumos para Compra: PANTONE & OUTROS */}
          <div className="mt-2 p-2 rounded-lg border border-border/70 bg-background/60 space-y-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1">
                <Palette className="h-3.5 w-3.5 text-[#CCD0CF]" />
                <span>Insumos para Compra</span>
              </span>
              <span className={isComprado ? "text-emerald-500 font-extrabold" : hasItemsToBuy ? "text-amber-500 font-extrabold" : "text-muted-foreground font-normal"}>
                {isComprado ? "✓ COMPRADO" : hasItemsToBuy ? "⚠️ PENDENTE" : "Sem Especiais"}
              </span>
            </div>

            {hasItemsToBuy ? (
              <div className="flex flex-col gap-1 pt-0.5">
                {pantoneActive && (() => {
                  const isDone = pantoneSent || currentStatus.id === "lancamento_ge" || currentStatus.id === "saida";
                  const isPedido = !isDone && currentStatus.id === "pedido";
                  const isMagenta = !isDone && !isPedido;
                  const itemClass = isDone
                    ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/50 shadow-xs font-bold"
                    : isPedido
                    ? "bg-amber-100 hover:bg-amber-200 text-amber-950 dark:text-amber-950 border-amber-400 shadow-2xs font-black"
                    : "bg-fuchsia-100 hover:bg-fuchsia-200 text-fuchsia-950 dark:text-fuchsia-950 border-fuchsia-400 shadow-2xs font-black";
                  const dotClass = isDone
                    ? "bg-emerald-500 shadow-[0_0_6px_#10b981]"
                    : isPedido
                    ? "bg-amber-500 shadow-[0_0_6px_#f59e0b]"
                    : "bg-fuchsia-500 shadow-[0_0_6px_#d946ef]";
                  const statusTag = isDone
                    ? "COMPRADO ✓"
                    : isPedido
                    ? "PEDIDO ⏳"
                    : currentStatus.id === "cotacao"
                    ? "COTAÇÃO ⏳"
                    : "ENTRADA ⏳";

                  return (
                    <div
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] border cursor-default select-none transition-all ${itemClass}`}
                      title={`${statusTag} (muda de cor exclusivamente ao mover no Kanban de Compras)`}
                    >
                      <span className="truncate flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                        <span>PANTONE {pantoneText ? `(${pantoneText})` : ""}</span>
                      </span>
                      <span className="shrink-0 font-mono-tech text-[10px] font-black">
                        {statusTag}
                      </span>
                    </div>
                  );
                })()}

                {outrosActive && (() => {
                  const isDone = outrosSent || currentStatus.id === "lancamento_ge" || currentStatus.id === "saida";
                  const isPedido = !isDone && currentStatus.id === "pedido";
                  const isMagenta = !isDone && !isPedido;
                  const itemClass = isDone
                    ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/50 shadow-xs font-bold"
                    : isPedido
                    ? "bg-amber-100 hover:bg-amber-200 text-amber-950 dark:text-amber-950 border-amber-400 shadow-2xs font-black"
                    : "bg-fuchsia-100 hover:bg-fuchsia-200 text-fuchsia-950 dark:text-fuchsia-950 border-fuchsia-400 shadow-2xs font-black";
                  const dotClass = isDone
                    ? "bg-emerald-500 shadow-[0_0_6px_#10b981]"
                    : isPedido
                    ? "bg-amber-500 shadow-[0_0_6px_#f59e0b]"
                    : "bg-fuchsia-500 shadow-[0_0_6px_#d946ef]";
                  const statusTag = isDone
                    ? "COMPRADO ✓"
                    : isPedido
                    ? "PEDIDO ⏳"
                    : currentStatus.id === "cotacao"
                    ? "COTAÇÃO ⏳"
                    : "ENTRADA ⏳";

                  return (
                    <div
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] border cursor-default select-none transition-all ${itemClass}`}
                      title={`${statusTag} (muda de cor exclusivamente ao mover no Kanban de Compras)`}
                    >
                      <span className="truncate flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                        <span>OUTROS {outrosText ? `(${outrosText})` : ""}</span>
                      </span>
                      <span className="shrink-0 font-mono-tech text-[10px] font-black">
                        {statusTag}
                      </span>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground italic">
                Nenhum Pantone ou Insumo Especial cadastrado nesta O.S.
              </p>
            )}
          </div>

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
            <DialogTitle className="flex items-center gap-2">
              <span>{displayCardNumber}</span>
              {isFromOS && ocNumero && (
                <span className="text-xs text-muted-foreground font-mono-tech font-normal">
                  (OC. {String(ocNumero).padStart(4, "0")})
                </span>
              )}
              {order.cliente && <span className="text-muted-foreground font-normal text-sm">— {order.cliente}</span>}
            </DialogTitle>
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

              <div className="p-3 rounded-xl border border-border bg-background space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1">
                    <Palette className="h-3.5 w-3.5 text-[#CCD0CF]" />
                    Insumos Especiais (Pantone / Outros)
                  </span>
                  <span className={isComprado ? "text-emerald-500 font-extrabold text-xs" : "text-amber-500 font-extrabold text-xs"}>
                    {isComprado ? "COMPRA CONCLUÍDA ✓" : "PENDENTE DE COMPRA ⏳"}
                  </span>
                </div>
                {hasItemsToBuy ? (
                  <div className="space-y-1">
                    {pantoneActive && (
                      <div className="text-xs flex items-center justify-between p-1.5 rounded bg-muted/60">
                        <span>PANTONE: <strong>{pantoneText || "Especificado no layout"}</strong></span>
                        <span className={pantoneSent ? "text-emerald-600 font-bold" : "text-pink-600 dark:text-pink-400 font-bold"}>
                          {pantoneSent ? "COMPRADO ✓" : "COMPRAR ⏳"}
                        </span>
                      </div>
                    )}
                    {outrosActive && (
                      <div className="text-xs flex items-center justify-between p-1.5 rounded bg-muted/60">
                        <span>OUTROS: <strong>{outrosText || "Insumo Especial"}</strong></span>
                        <span className={outrosSent ? "text-emerald-600 font-bold" : "text-pink-600 dark:text-pink-400 font-bold"}>
                          {outrosSent ? "COMPRADO ✓" : "COMPRAR ⏳"}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Nenhum Pantone ou Insumo Especial cadastrado nesta O.S.</p>
                )}
                <Button
                  size="sm"
                  className={`w-full font-bold uppercase ${
                    isComprado
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-amber-500 hover:bg-amber-600 text-amber-950"
                  }`}
                  onClick={() => toggleComprado()}
                >
                  {isComprado ? (
                    <>
                      <Check className="h-4 w-4 mr-1.5 stroke-[3]" />
                      COMPRA CONCLUÍDA (MARCADO DE VERDE)
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4 mr-1.5" />
                      MARCAR COMO COMPRADO
                    </>
                  )}
                </Button>
              </div>

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
