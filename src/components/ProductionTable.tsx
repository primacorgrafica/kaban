import { useState, useMemo } from "react";
import { Order, OrderStatus, STATUS_CONFIG, STATUS_ORDER } from "@/types/order";
import { Department, DepartmentConfig, DEPARTMENTS } from "@/types/production";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Clock,
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
} from "lucide-react";
import { toast } from "sonner";
import { getProcessoCor } from "@/lib/processos";
import { OrderSlideOver } from "./OrderSlideOver";

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
  onSendToExpedicao?: (id: string) => void;
  getProfileName: (userId: string | null) => string | null;
  permissions: Permissions;
  departmentContext?: string;
  department?: DepartmentConfig;
  slowAlertIds?: Set<string>;
}

type SortField = "titulo" | "cliente" | "status" | "prazo" | "created_at";
type SortDirection = "asc" | "desc";

export function ProductionTable({
  orders,
  onUpdate,
  onMove,
  onArchive,
  onDelete,
  onDuplicate,
  onSendToProduction,
  onSendToExpedicao,
  getProfileName,
  permissions,
  departmentContext,
  department,
  slowAlertIds,
}: ProductionTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectOrder, setInspectOrder] = useState<Order | null>(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const getStatusConfig = (order: Order) => {
    if (department) {
      let sId = (order as any).setor_status || "entrada";
      if (department.id === "desenvolvimento") {
        if (sId === "desenvolvendo") sId = "preparacao";
        if (sId === "aguardando_novo_arquivo") sId = "paralisado";
      }
      if (department.id === "ctp" && (sId === "gravacao" || sId === "imposicao" || sId === "filme_faca_cliche")) sId = "gravando";
      const found = department.statuses.find(s => s.id === sId);
      if (found) {
        return { label: found.label, colorKey: found.colorKey || "andamento" };
      }
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
          if (department.id === "desenvolvimento") {
            if (sa === "desenvolvendo") sa = "preparacao";
            if (sa === "aguardando_novo_arquivo") sa = "paralisado";
            if (sb === "desenvolvendo") sb = "preparacao";
            if (sb === "aguardando_novo_arquivo") sb = "paralisado";
          }
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
            <Layers className="h-4 w-4 text-cyan-500 dark:text-cyan-400" />
            Tabela de Produção
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 font-mono-tech font-bold">
            {orders.length} O.S.
          </span>
        </div>

        {/* Selected Counter & Batch Toolbar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-cyan-950/60 border border-cyan-500/30 px-3 py-1 rounded-xl shadow-lg animate-in fade-in">
            <span className="text-xs font-mono-tech font-bold text-cyan-300">
              {selectedIds.size} selecionada{selectedIds.size > 1 ? "s" : ""}
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-white bg-cyan-600/30 hover:bg-cyan-600/50 rounded-lg">
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
        <Table className="w-full text-left text-xs border-collapse">
          <TableHeader className="sticky top-0 bg-card/95 backdrop-blur-md z-10 border-b border-border">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10 px-3 text-center">
                <Checkbox
                  checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                  onCheckedChange={(c) => handleSelectAll(!!c)}
                  className="rounded border-border data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                />
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
              <TableHead className="min-w-[140px] text-foreground font-bold">Processos</TableHead>
              <TableHead className="w-16 text-right pr-4 text-foreground font-bold">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-48 text-center text-muted-foreground">
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
                const isUrgent = order.urgente;
                const isSlowAlert = slowAlertIds?.has(order.id);
                const isNearDeadline = order.prazo && new Date(order.prazo).getTime() <= Date.now();

                return (
                  <TableRow
                    key={order.id}
                    className={`border-b border-border/60 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-cyan-500/10 hover:bg-cyan-500/15"
                        : "hover:bg-accent/50"
                    }`}
                    onClick={() => handleOpenSlideOver(order)}
                  >
                    {/* Checkbox */}
                    <TableCell className="px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelectOne(order.id)}
                        className="rounded border-border data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                      />
                    </TableCell>

                    {/* O.S. # */}
                    <TableCell className="font-mono-tech font-bold">
                      <div className="flex items-center gap-1.5">
                        {isUrgent && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e] shrink-0" />
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 text-[11px]">
                          #{order.titulo}
                        </span>
                      </div>
                    </TableCell>

                    {/* Cliente */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground truncate max-w-[220px]">
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
                        {order.vendedor || "—"}
                      </span>
                    </TableCell>

                    {/* Processos */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {order.processos && order.processos.length > 0 ? (
                          order.processos.slice(0, 3).map((p) => (
                            <span
                              key={p}
                              className={`text-[9px] font-bold px-1 py-0.2 rounded border ${getProcessoCor(p)}`}
                            >
                              {p}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                        {order.processos && order.processos.length > 3 && (
                          <span className="text-[9px] text-muted-foreground font-mono-tech">
                            +{order.processos.length - 3}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Ações */}
                    <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover border-border text-popover-foreground">
                          <DropdownMenuItem
                            onClick={() => handleOpenSlideOver(order)}
                            className="text-xs hover:bg-accent cursor-pointer"
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-2 text-cyan-500" /> Inspecionar O.S.
                          </DropdownMenuItem>
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
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Slide-over inspector */}
      <OrderSlideOver
        order={inspectOrder}
        open={slideOverOpen}
        onOpenChange={setSlideOverOpen}
        onUpdate={onUpdate}
        onMove={onMove}
        onArchive={onArchive}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onSendToProduction={onSendToProduction}
        onSendToExpedicao={onSendToExpedicao}
        updatedByName={inspectOrder ? getProfileName(inspectOrder.atualizado_por) : null}
        createdByName={inspectOrder ? getProfileName(inspectOrder.criado_por) : null}
      />
    </div>
  );
}
