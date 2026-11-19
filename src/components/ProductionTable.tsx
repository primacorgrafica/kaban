import { getOrderRevision } from "@/lib/orderRevision";
import { formatVendedorNome } from "@/lib/vendedores";
import { getEffectiveOsAnterior } from "@/lib/orderAnterior";
import { useState, useMemo } from "react";
import { Order, OrderStatus, STATUS_CONFIG, STATUS_ORDER } from "@/types/order";
import { Department, DepartmentConfig, DEPARTMENTS } from "@/types/production";
import { isCtpChecklistComplete } from "@/types/ctp";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RotateCcw, Clock,
  Check,
  User,
  FileText,
  Archive,
  Trash2,
  MoreHorizontal,
  ExternalLink,
  ArrowUpDown,
  Send,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Layers,
  Sparkles,
  ChevronRight,
  Filter,
  Repeat,
  Star,
  StarOff,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { OrderDetailDialog } from "./OrderDetailDialog";
import {
  getProcessoCor,
  sortAndFilterProcessos,
  SPECIAL_SUPPLIES,
  isSpecialSupplyActive,
  getSpecialSupplyDetails,
  getSpecialSupplyBadgeClasses,
  toggleSpecialSupplySent,
  formatSafeDate,
  SpecialSupplyId,
} from "@/lib/processos";
import { cleanOsNumber } from "./ProductionCard";
import {
  hasProductionPriority,
  toggleProductionPriority,
  isOrderInProduction,
} from "@/lib/productionPriority";

interface Permissions {
  canEditCard: boolean;
  canAdvanceCards: boolean;
  canPauseCards?: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canSendToProduction: boolean;
  canReorderEntry: boolean;
  isViewOnly: boolean;
}

interface ProductionTableProps {
  orders: Order[];
  onUpdate: (id: string, data: Partial<Order>) => void;
  onMove: (id: string, status: any, newIndex?: number) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (order: Order) => void;
  onSendToProduction?: (id: string, department: Department, machine?: string) => void;
  onSendToMultipleProduction?: (id: string, depts: { department: Department; machine?: string }[]) => void;
  onSendToExpedicao?: (id: string) => void;
  onSendToInspecao?: (id: string) => void | Promise<any>;
  getProfileName: (userId: string | null) => string | null;
  permissions: Permissions;
  departmentContext?: string;
  department?: DepartmentConfig;
  slowAlertIds?: Set<string>;
  showSectorColumn?: boolean;
  currentUserName?: string | null;
}

type SortField = "titulo" | "cliente" | "status" | "prazo" | "created_at" | "setor";
type SortDirection = "asc" | "desc";

export function ProductionTable({
  orders,
  onUpdate,
  onMove,
  onArchive,
  onDelete,
  onDuplicate,
  onSendToProduction,
  onSendToMultipleProduction,
  onSendToExpedicao,
  onSendToInspecao,
  getProfileName,
  permissions,
  departmentContext,
  department,
  slowAlertIds,
  showSectorColumn = false,
  currentUserName,
}: ProductionTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectOrder, setInspectOrder] = useState<Order | null>(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [sendOrder, setSendOrder] = useState<Order | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState<{ department: Department; machine?: string }[]>([]);
  const [currentDept, setCurrentDept] = useState<Department | "">("");
  const [currentMachine, setCurrentMachine] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const getStatusConfig = (order: Order) => {
    if (department) {
      let sId = (order as any).setor_status || "entrada";
      const found = department.statuses.find(s => s.id === sId);
      if (found) {
        return { label: found.label, colorKey: found.colorKey || "andamento" };
      }
    }
    // Se a O.S. tiver setor_status explícito (ex: Produção consolidada)
    if (order.setor_status) {
      const sId = order.setor_status;
      if (sId === "entrada") return { label: "Entrada", colorKey: "entrada" };
      if (sId === "saida") return { label: "Saída", colorKey: "concluido" };
      if (sId === "em_andamento" || sId === "producao" || sId === "gravacao" || sId === "imposicao") return { label: "Produção", colorKey: "andamento" };
      return { label: sId.toUpperCase(), colorKey: "andamento" };
    }
    let st = order.status;
    if (st === "aguardando_novo_arquivo") st = "paralisado";
    return STATUS_CONFIG[st] || { label: order.status, colorKey: "andamento" };
  };

  // Sorting logic
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      // Prioridade na Produção sempre vem em destaque no topo
      const prioA = hasProductionPriority(a);
      const prioB = hasProductionPriority(b);
      if (prioA !== prioB) {
        return prioA ? -1 : 1;
      }

      let comparison = 0;
      if (sortField === "titulo") {
        comparison = (a.titulo || "").localeCompare(b.titulo || "", undefined, { numeric: true });
      } else if (sortField === "cliente") {
        comparison = (a.cliente || "").localeCompare(b.cliente || "");
      } else if (sortField === "status") {
        if (department) {
          const statusOrderList = department.statuses.map(s => s.id);
          let sa = (a as any).setor_status || "entrada";
          let sb = (b as any).setor_status || "entrada";
          comparison = statusOrderList.indexOf(sa) - statusOrderList.indexOf(sb);
        } else {
          let sa = a.status;
          let sb = b.status;
          if (sa === "aguardando_novo_arquivo") sa = "paralisado";
          if (sb === "aguardando_novo_arquivo") sb = "paralisado";
          comparison = STATUS_ORDER.indexOf(sa) - STATUS_ORDER.indexOf(sb);
        }
      } else if (sortField === "prazo") {
        const da = a.prazo ? new Date(a.prazo).getTime() : 9999999999999;
        const db = b.prazo ? new Date(b.prazo).getTime() : 9999999999999;
        comparison = da - db;
      } else if (sortField === "created_at") {
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortField === "setor") {
        comparison = (a.setor || "").localeCompare(b.setor || "");
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [orders, sortField, sortDirection]);

  // Multi-selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAllSelected = orders.length > 0 && selectedIds.size === orders.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < orders.length;

  // Batch actions
  const handleBatchMove = (status: string) => {
    if (permissions.isViewOnly) return;
    const count = selectedIds.size;
    selectedIds.forEach((id) => onMove(id, status as any));
    const label = department ? department.statuses.find(s => s.id === status)?.label : STATUS_CONFIG[status as OrderStatus]?.label;
    toast.success(`${count} O.S. movidas para ${label || status}`);
    setSelectedIds(new Set());
  };

  const availableStatuses = department
    ? department.statuses.map(s => ({ id: s.id, label: s.label, colorKey: s.colorKey }))
    : STATUS_ORDER.map(st => ({ id: st, label: STATUS_CONFIG[st].label, colorKey: STATUS_CONFIG[st].colorKey }));

  const handleBatchArchive = () => {
    if (!permissions.canArchive) return;
    const count = selectedIds.size;
    selectedIds.forEach((id) => onArchive(id));
    toast.success(`${count} O.S. arquivadas com sucesso`);
    setSelectedIds(new Set());
  };

  const handleBatchTogglePriority = async () => {
    if (permissions.isViewOnly) return;
    const targetOrders = orders.filter((o) => selectedIds.has(o.id));
    if (targetOrders.length === 0) return;

    const anyWithoutPriority = targetOrders.some((o) => !hasProductionPriority(o));
    const nextState = anyWithoutPriority;

    for (const ord of targetOrders) {
      if (hasProductionPriority(ord) !== nextState) {
        await toggleProductionPriority(ord, (id, data) => onUpdate(id, data));
      }
    }

    toast.success(
      nextState
        ? `${targetOrders.length} O.S. marcadas como prioridade na Produção! ⭐`
        : `Prioridade removida de ${targetOrders.length} O.S.`
    );
    setSelectedIds(new Set());
  };

  const handleBatchSendToInspecao = async () => {
    if (!onSendToInspecao || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await Promise.resolve(onSendToInspecao(id));
    }
    setSelectedIds(new Set());
  };

  const handleOpenSlideOver = (order: Order) => {
    setInspectOrder(order);
    setSlideOverOpen(true);
  };

  return (
    <div className="flex flex-col h-full rounded-2xl bg-card backdrop-blur-xl border border-border shadow-xl overflow-hidden relative">
      {/* Table Toolbar & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-foreground font-mono-tech flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#9BA8AB]" />
            Tabela de Produção
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#253745] border border-[#4A5C6A]/60 text-[#CCD0CF] font-mono-tech font-bold">
            {orders.length} O.S.
          </span>
        </div>

        {/* Selected Counter & Batch Toolbar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-[#11212D] border border-[#4A5C6A] px-3 py-1 rounded-xl shadow-lg animate-in fade-in">
            <span className="text-xs font-mono-tech font-bold text-[#CCD0CF]">
              {selectedIds.size} selecionada{selectedIds.size > 1 ? "s" : ""}
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-[#CCD0CF] bg-[#253745] hover:bg-[#253745]/80 rounded-lg">
                  Mover Status <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover border-border text-popover-foreground">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Alterar Status das Selecionadas</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                {availableStatuses.map((st) => (
                  <DropdownMenuItem
                    key={st.id}
                    onClick={() => handleBatchMove(st.id)}
                    className="text-xs hover:bg-accent cursor-pointer"
                  >
                    <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: `hsl(var(--status-${st.colorKey}))` }} />
                    {st.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Botão de Enviar para Inspeção em Lote */}
            {onSendToInspecao && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleBatchSendToInspecao}
                className="h-7 text-xs text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-lg font-semibold cursor-pointer"
                title="Enviar O.S. selecionadas para Inspeção"
              >
                <ShieldCheck className="h-3 w-3 mr-1" /> Inspeção
              </Button>
            )}

            {/* Botão de Prioridade em Lote */}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleBatchTogglePriority}
              className="h-7 text-xs text-amber-400 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg font-semibold"
              title="Alternar Prioridade na Produção para as O.S. selecionadas"
            >
              <Star className="h-3 w-3 mr-1 fill-amber-400 text-amber-400" /> Prioridade
            </Button>

            {permissions.canArchive && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleBatchArchive}
                className="h-7 text-xs text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 rounded-lg"
              >
                <Archive className="h-3 w-3 mr-1" /> Arquivar
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="h-7 text-xs text-muted-foreground hover:text-foreground rounded-lg"
            >
              Limpar
            </Button>
          </div>
        )}
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        <Table className="w-full max-lg:min-w-[800px] text-left text-xs border-collapse">
          <TableHeader className="sticky top-0 bg-card/95 backdrop-blur-md z-10 border-b border-border">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10 px-3 text-center">
                <Checkbox
                  checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                  onCheckedChange={(c) => handleSelectAll(!!c)}
                  className="rounded border-border data-[state=checked]:bg-[#CCD0CF] data-[state=checked]:text-[#06141B] data-[state=checked]:border-[#CCD0CF]"
                />
              </TableHead>
              <TableHead className="w-10 px-1 text-center" title="Prioridade na Produção">
                <Star className="h-3.5 w-3.5 mx-auto text-amber-500 fill-amber-500/20" />
              </TableHead>
              <TableHead className="w-24 font-mono-tech cursor-pointer select-none" onClick={() => handleSort("titulo")}>
                <div className="flex items-center gap-1 text-foreground font-bold">
                  <span>O.S. #</span>
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="min-w-[200px] cursor-pointer select-none" onClick={() => handleSort("cliente")}>
                <div className="flex items-center gap-1 text-foreground font-bold">
                  <span>Cliente</span>
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="min-w-[240px] text-foreground font-bold">Descrição</TableHead>
              {showSectorColumn && (
                <TableHead className="w-28 cursor-pointer select-none" onClick={() => handleSort("setor")}>
                  <div className="flex items-center gap-1 text-foreground font-bold">
                    <span>Setor</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
              )}
              <TableHead className="w-36 cursor-pointer select-none" onClick={() => handleSort("status")}>
                <div className="flex items-center gap-1 text-foreground font-bold">
                  <span>Etapa / Status</span>
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="w-32 cursor-pointer select-none" onClick={() => handleSort("prazo")}>
                <div className="flex items-center gap-1 text-foreground font-bold">
                  <span>Prazo Limite</span>
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="w-28 text-foreground font-bold">Vendedor</TableHead>
              <TableHead className="min-w-[150px] text-foreground font-bold">MATERIAIS</TableHead>
              <TableHead className="min-w-[210px] text-right pr-4 text-foreground font-bold">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showSectorColumn ? 11 : 10} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Filter className="h-8 w-8 opacity-40 text-muted-foreground" />
                    <span>Nenhuma ordem de serviço encontrada com os filtros atuais.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sortedOrders.map((order) => {
                const config = getStatusConfig(order);
                const isSelected = selectedIds.has(order.id);
                const isPriority = hasProductionPriority(order);
                const isSlowAlert = slowAlertIds?.has(order.id);
                const isNearDeadline = order.prazo && new Date(order.prazo).getTime() <= Date.now();

                return (
                  <TableRow
                    key={order.id}
                    className={`border-b border-border/60 transition-colors cursor-pointer ${
                      isPriority
                        ? "bg-amber-500/[0.05] hover:bg-amber-500/[0.09] border-l-2 border-l-amber-500"
                        : isSelected
                        ? "bg-[#253745]/40 hover:bg-[#253745]/60"
                        : "hover:bg-accent/50"
                    }`}
                    onClick={() => handleOpenSlideOver(order)}
                  >
                    {/* Checkbox */}
                    <TableCell className="px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelectOne(order.id)}
                        className="rounded border-border data-[state=checked]:bg-[#CCD0CF] data-[state=checked]:text-[#06141B] data-[state=checked]:border-[#CCD0CF]"
                      />
                    </TableCell>

                    {/* Estrela de Prioridade (1-Click) */}
                    <TableCell className="w-10 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                      {!permissions.isViewOnly ? (
                        <button
                          type="button"
                          onClick={() => void toggleProductionPriority(order, (id, data) => onUpdate(id, data))}
                          className={`h-7 w-7 rounded-lg mx-auto flex items-center justify-center transition-all cursor-pointer ${
                            isPriority
                              ? "bg-amber-500/20 text-amber-500 border border-amber-500/40 hover:bg-amber-500/30 shadow-xs"
                              : "text-muted-foreground/30 hover:text-amber-500 hover:bg-amber-500/10"
                          }`}
                          title={isPriority ? "Remover prioridade da Produção" : "Marcar como prioridade na Produção"}
                        >
                          <Star className={`h-4 w-4 ${isPriority ? "fill-amber-500 text-amber-500" : ""}`} />
                        </button>
                      ) : (
                        <div className="h-7 w-7 mx-auto flex items-center justify-center">
                          {isPriority && <Star className="h-4 w-4 fill-amber-500 text-amber-500" />}
                        </div>
                      )}
                    </TableCell>

                    {/* O.S. # */}
                    <TableCell className="font-mono-tech font-bold">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-[#253745] text-[#CCD0CF] border border-[#4A5C6A]/60 text-[11px]">
                          {cleanOsNumber(order.titulo) || order.titulo?.replace(/^#+/, "")}
                        </span>
                        {hasProductionPriority(order) && (
                          <span
                            className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1 shadow-xs"
                            title="O.S. com Prioridade na Produção"
                          >
                            <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500 shrink-0" />
                            <span>PRIORIDADE</span>
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Cliente */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground truncate max-w-[220px] uppercase">
                          {order.cliente}
                        </span>
                        {order.parent_order_id && (
                          <span className="text-[10px] text-violet-500 dark:text-violet-400 font-mono-tech">
                            ↳ Sub-ordem
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Descrição */}
                    <TableCell>
                      <span className="text-muted-foreground line-clamp-1 max-w-[280px]">
                        {order.descricao || "—"}
                      </span>
                    </TableCell>

                    {/* Setor */}
                    {showSectorColumn && (
                      <TableCell>
                        {order.setor ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold font-mono-tech uppercase bg-[#253745] text-sky-300 border border-[#4A5C6A]/60">
                            {order.setor}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/60 font-mono-tech">—</span>
                        )}
                      </TableCell>
                    )}

                    {/* Status */}
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono-tech border"
                        style={{
                          backgroundColor: `hsl(var(--status-${config.colorKey}-bg))`,
                          borderColor: `hsl(var(--status-${config.colorKey}) / 0.3)`,
                          color: `hsl(var(--status-${config.colorKey}))`,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: `hsl(var(--status-${config.colorKey}))` }}
                        />
                        <span className="truncate max-w-[110px]">{config.label}</span>
                      </span>
                    </TableCell>

                    {/* Prazo */}
                    <TableCell>
                      {order.prazo ? (
                        <div
                          className={`flex items-center gap-1 font-mono-tech text-[11px] ${
                            isNearDeadline ? "text-rose-500 font-bold" : "text-muted-foreground"
                          }`}
                        >
                          <Clock className="h-3 w-3" />
                          <span>{format(new Date(order.prazo), "dd/MM HH:mm", { locale: ptBR })}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>

                    {/* Vendedor */}
                    <TableCell>
                      <span className="text-foreground truncate max-w-[100px] block">
                        {formatVendedorNome(order.vendedor) || "—"}
                      </span>
                    </TableCell>

                    {/* Materiais e Processos */}
                    <TableCell>
                      {(() => {
                        const cleanProcs = sortAndFilterProcessos(order.processos);
                        const activeSupplies = SPECIAL_SUPPLIES.filter((s) =>
                          isSpecialSupplyActive(order.processos, s.id)
                        );
                        const hasItems = cleanProcs.length > 0 || activeSupplies.length > 0;

                        if (!hasItems) {
                          return <span className="text-muted-foreground/40 text-xs">—</span>;
                        }

                        return (
                          <div className="flex flex-wrap gap-1 max-w-[240px] items-center">
                            {/* Suprimentos Especiais / Materiais (Clichê, Faca, Filme, Pantone, Outros) */}
                            {activeSupplies.map((s) => {
                              const details = getSpecialSupplyDetails(order.processos, s.id);
                              const isOperational = s.id === "CLICHE" || s.id === "FACA" || s.id === "FILME";
                              const isReceived = details.operationalState === "recebido";
                              const isSent = details.operationalState === "enviado";
                              const isPending = !isReceived && !isSent;

                              const formattedTime = formatSafeDate(details.sentAt, "dd/MM HH:mm", { locale: ptBR });
                              const opName = details.operator || order.operador || currentUserName || "";

                              let decodedInfo = "";
                              if (details.customText) {
                                try {
                                  decodedInfo = decodeURIComponent(details.customText);
                                } catch (_) {
                                  decodedInfo = details.customText;
                                }
                              }

                              let tooltip = "";
                              let badgeClasses = "";
                              let dotClasses = "";

                              if (isOperational) {
                                if (isReceived) {
                                  tooltip = `${s.label}: CHEGOU NA PRODUÇÃO ${formattedTime ? `em ${formattedTime}` : ""}${opName ? ` por ${opName}` : ""} (Clique para alternar)`;
                                  badgeClasses = "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30";
                                  dotClasses = "bg-emerald-400";
                                } else if (isSent) {
                                  tooltip = `${s.label}: ENVIADO PELA PRÉ-IMPRESSÃO ${formattedTime ? `em ${formattedTime}` : ""}${opName ? ` por ${opName}` : ""} (Clique para confirmar que CHEGOU)`;
                                  badgeClasses = "bg-amber-500/25 text-amber-200 border-amber-400/60 hover:bg-amber-500/35 ring-1 ring-amber-400/30 animate-pulse";
                                  dotClasses = "bg-amber-400";
                                } else {
                                  tooltip = `${s.label}: PENDENTE DE ENVIO (Clique para marcar como Enviado ou Chegou)`;
                                  badgeClasses = "bg-pink-500/20 text-pink-300 border-pink-500/50 hover:bg-pink-500/30";
                                  dotClasses = "bg-pink-400";
                                }
                              } else {
                                const isDone = details.sent || details.comprasStatus === "lancamento_ge" || details.comprasStatus === "saida";
                                const isPedido = !isDone && details.comprasStatus === "pedido";

                                if (isDone) {
                                  tooltip = `${s.label}: Concluído / Disponível (Clique para alternar)`;
                                  badgeClasses = "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30";
                                  dotClasses = "bg-emerald-400";
                                } else if (isPedido) {
                                  tooltip = `${s.label}: Em Pedido no setor de Compras`;
                                  badgeClasses = "bg-amber-500/25 text-amber-200 border-amber-400/60 hover:bg-amber-500/35";
                                  dotClasses = "bg-amber-400";
                                } else {
                                  tooltip = `${s.label}: Entrada / Cotação no setor de Compras`;
                                  badgeClasses = "bg-pink-500/20 text-pink-300 border-pink-500/50 hover:bg-pink-500/30";
                                  dotClasses = "bg-pink-400";
                                }
                              }

                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  disabled={permissions.isViewOnly}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (permissions.isViewOnly) return;

                                    const operatorToSave = currentUserName || order.operador || "Operador Produção";
                                    const updated = toggleSpecialSupplySent(order.processos, s.id, operatorToSave);
                                    void Promise.resolve(onUpdate(order.id, { processos: updated }));

                                    if (isOperational) {
                                      if (isPending) {
                                        toast.success(`${s.label} marcado como ENVIADO (Amarelo)!`);
                                      } else if (isSent) {
                                        toast.success(`${s.label} marcado como CHEGOU NA PRODUÇÃO (Verde)! ✅`);
                                      } else {
                                        toast.info(`${s.label} retornado para PENDENTE (Magenta).`);
                                      }
                                    } else {
                                      if (details.sent) {
                                        toast.info(`${s.label} retornado para Pendente.`);
                                      } else {
                                        toast.success(`${s.label} marcado como Concluído! ✅`);
                                      }
                                    }
                                  }}
                                  className={`text-[9.5px] font-bold px-2 py-0.5 rounded border inline-flex items-center gap-1 shadow-2xs transition-all cursor-pointer active:scale-95 ${badgeClasses}`}
                                  title={tooltip}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClasses}`} />
                                  <span>{s.label}</span>
                                  {isReceived && (
                                    <Check className="h-2.5 w-2.5 text-emerald-300 shrink-0 stroke-[3]" />
                                  )}
                                  {isSent && (
                                    <span className="text-[8.5px] font-mono-tech opacity-90 tracking-tight bg-black/20 px-1 rounded">
                                      Enviado
                                    </span>
                                  )}
                                  {decodedInfo && (
                                    <span className="text-[8.5px] opacity-80 max-w-[80px] truncate hidden xl:inline">
                                      ({decodedInfo})
                                    </span>
                                  )}
                                </button>
                              );
                            })}

                            {/* Processos Tradicionais Limpos (Offset, Verniz, Refilo, etc.) */}
                            {cleanProcs.slice(0, 2).map((p) => (
                              <span
                                key={p}
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getProcessoCor(p)}`}
                              >
                                {p}
                              </span>
                            ))}

                            {cleanProcs.length > 2 && (
                              <span
                                className="text-[9px] text-muted-foreground font-mono-tech px-1"
                                title={cleanProcs.slice(2).join(", ")}
                              >
                                +{cleanProcs.length - 2}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>

                    {/* Ações */}
                    <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {departmentContext === "producao" && onSendToInspecao ? (
                          <button
                            type="button"
                            onClick={() => onSendToInspecao(order.id)}
                            className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm font-mono-tech whitespace-nowrap cursor-pointer hover:scale-[1.02] active:scale-95"
                            title="Enviar esta O.S. para Inspeção"
                          >
                            <ShieldCheck className="h-3.5 w-3.5 stroke-[2.5]" />
                            <span>ENVIAR PARA INSPEÇÃO</span>
                          </button>
                        ) : permissions.canSendToProduction && onSendToProduction && (
                          <button
                            type="button"
                            onClick={() => {
                              if (departmentContext === "pre_impressao" && !order.setor && !isCtpChecklistComplete(order.ctp_checklist)) {
                                toast.error("Bloqueio de Saída: É OBRIGATÓRIO marcar como verificado todos os 13 itens do checklist antes de enviar a O.S para o próximo setor.", {
                                  duration: 6000,
                                });
                                return;
                              }
                              setSendOrder(order);
                              setSendDialogOpen(true);
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#CCD0CF] dark:hover:bg-white dark:text-[#06141B] shadow-sm font-mono-tech whitespace-nowrap cursor-pointer hover:scale-[1.02] active:scale-95"
                            title="Enviar esta O.S. para Produção"
                          >
                            <Send className="h-3 w-3 stroke-[2.5]" />
                            <span>ENVIAR PARA PRODUÇÃO</span>
                          </button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg shrink-0"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover border-border text-popover-foreground">
                            {onSendToInspecao && (
                              <DropdownMenuItem
                                onClick={() => onSendToInspecao(order.id)}
                                className="text-xs hover:bg-accent cursor-pointer font-semibold text-emerald-500 dark:text-emerald-400"
                              >
                                <ShieldCheck className="h-3.5 w-3.5 mr-2 text-emerald-500 dark:text-emerald-400" /> Enviar para Inspeção
                              </DropdownMenuItem>
                            )}
                            {permissions.canSendToProduction && onSendToProduction && (
                              <DropdownMenuItem
                                onClick={() => {
                                  if (departmentContext === "pre_impressao" && !order.setor && !isCtpChecklistComplete(order.ctp_checklist)) {
                                    toast.error("Bloqueio de Saída: É OBRIGATÓRIO marcar como verificado todos os 13 itens do checklist antes de enviar a O.S para o próximo setor.", {
                                      duration: 6000,
                                    });
                                    return;
                                  }
                                  setSendOrder(order);
                                  setSendDialogOpen(true);
                                }}
                                className="text-xs hover:bg-accent cursor-pointer font-semibold"
                              >
                                <Send className="h-3.5 w-3.5 mr-2 text-sky-400" /> {departmentContext === "producao" ? "Mover de Setor..." : "Enviar para Produção"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleOpenSlideOver(order)}
                              className="text-xs hover:bg-accent cursor-pointer"
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-2 text-[#9BA8AB]" /> Inspecionar O.S.
                            </DropdownMenuItem>
                            {!permissions.isViewOnly && (
                              <DropdownMenuItem
                                onClick={() => void toggleProductionPriority(order, (id, data) => onUpdate(id, data))}
                                className="text-xs hover:bg-accent cursor-pointer text-amber-500"
                              >
                                <Star className={`h-3.5 w-3.5 mr-2 ${hasProductionPriority(order) ? "fill-amber-500 text-amber-500" : ""}`} />
                                {hasProductionPriority(order) ? "Remover prioridade" : "Marcar como prioridade"}
                              </DropdownMenuItem>
                            )}
                            {permissions.canArchive && (
                              <DropdownMenuItem
                                onClick={() => onArchive(order.id)}
                                className="text-xs hover:bg-accent cursor-pointer text-amber-500"
                              >
                                <Archive className="h-3.5 w-3.5 mr-2" /> Arquivar
                              </DropdownMenuItem>
                            )}
                            {permissions.canDelete && (
                              <DropdownMenuItem
                                onClick={() => onDelete(order.id)}
                                className="text-xs hover:bg-accent cursor-pointer text-rose-500"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal Centralizado de Detalhes da O.S. (idêntico ao de abrir na coluna) */}
      <OrderDetailDialog
        order={inspectOrder}
        open={slideOverOpen}
        onOpenChange={setSlideOverOpen}
        onUpdate={onUpdate}
        onArchive={onArchive}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onSendToProduction={onSendToProduction}
        onSendToInspecao={onSendToInspecao}
        onSendToExpedicao={onSendToExpedicao}
        permissions={permissions}
        departmentContext={departmentContext || department?.id}
        getProfileName={getProfileName}
      />

      {/* Modal de Envio para Produção / Mover de Setor */}
      <Dialog
        open={sendDialogOpen}
        onOpenChange={(open) => {
          setSendDialogOpen(open);
          if (!open) {
            setSendOrder(null);
            setSelectedDepts([]);
            setCurrentDept("");
            setCurrentMachine("");
          }
        }}
      >
        <DialogContent className="max-sm:w-[94vw] max-sm:max-w-full max-sm:p-4 max-sm:rounded-xl sm:max-w-md bg-card border-border text-card-foreground shadow-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Send className="h-5 w-5 text-sky-400" />
              <span>Enviar para qual(is) setor(es)?</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {sendOrder && (
              <p className="text-xs text-muted-foreground">
                O.S. <strong>#{cleanOsNumber(sendOrder.titulo) || sendOrder.titulo}</strong> — {sendOrder.cliente}
              </p>
            )}

            {selectedDepts.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground font-mono-tech">Setores selecionados</Label>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDepts.map((sd, idx) => (
                    <Badge key={idx} variant="default" className="gap-1 pr-1 text-xs">
                      {DEPARTMENTS.find((d) => d.id === sd.department)?.label}
                      {sd.machine &&
                        ` (${DEPARTMENTS.find((d) => d.id === sd.department)?.statuses.find((s) => s.id === sd.machine)?.label || sd.machine})`}
                      <button
                        type="button"
                        className="ml-1 rounded-full hover:bg-white/20 p-0.5 cursor-pointer"
                        onClick={() => setSelectedDepts((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold">Adicionar setor</Label>
              <Select
                value={currentDept}
                onValueChange={(v) => {
                  setCurrentDept(v as Department);
                  setCurrentMachine("");
                }}
              >
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Selecione o setor" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.filter((d) => !selectedDepts.some((sd) => sd.department === d.id)).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {currentDept && DEPARTMENTS.find((d) => d.id === currentDept)?.machines && (
              <div>
                <Label className="text-xs font-semibold">Máquina</Label>
                <Select value={currentMachine} onValueChange={setCurrentMachine}>
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue placeholder="Selecione a máquina" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.find((d) => d.id === currentDept)!.machines!.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {currentDept && (
              <Button
                type="button"
                variant="outline"
                className="w-full text-xs font-semibold"
                disabled={!!DEPARTMENTS.find((d) => d.id === currentDept)?.machines && !currentMachine}
                onClick={() => {
                  setSelectedDepts((prev) => [
                    ...prev,
                    { department: currentDept as Department, machine: currentMachine || undefined },
                  ]);
                  setCurrentDept("");
                  setCurrentMachine("");
                }}
              >
                + Adicionar Setor
              </Button>
            )}

            <Button
              type="button"
              className="w-full font-bold gap-2"
              disabled={selectedDepts.length === 0 && !currentDept}
              onClick={() => {
                if (!sendOrder) return;
                if (departmentContext === "pre_impressao" && !sendOrder.setor && !isCtpChecklistComplete(sendOrder.ctp_checklist)) {
                  toast.error("Bloqueio de Saída: É OBRIGATÓRIO marcar como verificado todos os 13 itens do checklist antes de enviar a O.S para o próximo setor.", {
                    duration: 6000,
                  });
                  return;
                }
                const deptsToSend =
                  selectedDepts.length > 0
                    ? selectedDepts
                    : currentDept
                    ? [{ department: currentDept as Department, machine: currentMachine || undefined }]
                    : [];

                if (deptsToSend.length === 0) return;

                if (onSendToMultipleProduction) {
                  onSendToMultipleProduction(sendOrder.id, deptsToSend);
                } else if (onSendToProduction && deptsToSend.length > 0) {
                  onSendToProduction(sendOrder.id, deptsToSend[0].department, deptsToSend[0].machine);
                }

                setSendDialogOpen(false);
                setSendOrder(null);
                setSelectedDepts([]);
                setCurrentDept("");
                setCurrentMachine("");
              }}
            >
              <Send className="h-4 w-4" /> Confirmar Envio{" "}
              {selectedDepts.length > 1 && `(${selectedDepts.length} setores)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
