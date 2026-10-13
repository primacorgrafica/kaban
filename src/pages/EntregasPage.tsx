import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrders } from "@/hooks/useOrders";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X, CalendarIcon, FileDown } from "lucide-react";
import { format, parseISO, startOfDay, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DEPARTMENT_MAP } from "@/types/production";
import { KanbanFiltersBar, KanbanFilters } from "@/components/KanbanFiltersBar";
import { toast } from "sonner";
import { exportEntregasPDF } from "@/lib/pdfExport";
import type { Order } from "@/types/order";

export default function EntregasPage() {
  const { user, authReady } = useAuth();
  const permissions = usePermissions();
  const { activeOrders, archivedOrders, loading: ordersLoading } = useOrders();

  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [kanbanFilters, setKanbanFilters] = useState<KanbanFilters>({ statuses: [], vendedores: [], setores: [], dateFrom: undefined, dateTo: undefined });

  // Fetch all non-archived orders with entrega data
  useEffect(() => {
    if (!authReady || !user) return;

    const fetchOrders = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("arquivado", false)
        .order("updated_at", { ascending: false });

      if (data) {
        // Filter out orders with stamps P, C, F, Q, NC, M
        const filtered = (data as unknown as Order[]).filter(order => {
          const o = order as any;
          // M = Manutenção
          if (o.om_numero) return false;
          // C = Compras
          if (o.oc_numero) return false;
          // NC = Não Conformidade
          if (o.nc_numero) return false;
          // F = Faturamento (sub-order copy)
          if (order.setor === "faturamento") return false;
          // Q = Qualidade
          if (order.setor === "qualidade") return false;
          // P = Prova (sub-order copy in expedição from pré-impressão)
          if (order.parent_order_id && order.setor === "expedicao") return false;
          return true;
        });
        setAllOrders(filtered);
      }
      setLoading(false);
    };

    void fetchOrders();

    const channel = supabase
      .channel("entregas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void fetchOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [authReady, user]);

  // Get unique dates for the dropdown
  const availableDates = useMemo(() => {
    const dateSet = new Set<string>();
    allOrders.forEach(o => {
      if (o.entrega_data_limite) {
        const dayStr = format(parseISO(o.entrega_data_limite), "yyyy-MM-dd");
        dateSet.add(dayStr);
      }
    });
    return Array.from(dateSet).sort();
  }, [allOrders]);

  const filteredAndSorted = useMemo(() => {
    let list = [...allOrders];

    // Filter by selected dates (multi-select)
    if (selectedDates.size > 0) {
      list = list.filter(o => {
        if (!o.entrega_data_limite) return false;
        const dayStr = format(parseISO(o.entrega_data_limite), "yyyy-MM-dd");
        return selectedDates.has(dayStr);
      });
    }

    // Filter by vendedor
    if (kanbanFilters.vendedores.length > 0) {
      list = list.filter(o => o.vendedor && kanbanFilters.vendedores.includes(o.vendedor));
    }

    // Filter by setor
    if (kanbanFilters.setores.length > 0) {
      list = list.filter(o => {
        if (!o.setor) return false;
        // KanbanFiltersBar uses "__pre_impressao__" for setor=null orders
        return kanbanFilters.setores.includes(o.setor);
      });
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(o =>
        o.titulo.toLowerCase().includes(q) ||
        o.cliente.toLowerCase().includes(q) ||
        o.descricao.toLowerCase().includes(q) ||
        (o.vendedor || "").toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const aDate = a.entrega_data_limite;
      const bDate = b.entrega_data_limite;
      const aHasDate = !!aDate;
      const bHasDate = !!bDate;

      if (aHasDate && !bHasDate) return -1;
      if (!aHasDate && bHasDate) return 1;

      if (aHasDate && bHasDate) {
        const dateCmp = aDate!.localeCompare(bDate!);
        if (dateCmp !== 0) return dateCmp;
      }

      const clientCmp = a.cliente.localeCompare(b.cliente);
      if (clientCmp !== 0) return clientCmp;

      return a.titulo.localeCompare(b.titulo, undefined, { numeric: true });
    });

    return list;
  }, [allOrders, selectedDates, kanbanFilters, searchQuery]);

  // Build rows with separator rows between date groups
  const rowsWithSeparators = useMemo(() => {
    const rows: Array<{ type: "order"; order: Order } | { type: "separator"; dateLabel: string }> = [];
    const showSeparators = selectedDates.size >= 2;
    let lastDateKey = "";

    filteredAndSorted.forEach((order) => {
      if (showSeparators) {
        const dateKey = order.entrega_data_limite
          ? format(parseISO(order.entrega_data_limite), "yyyy-MM-dd")
          : "__no_date__";

        if (dateKey !== lastDateKey && rows.length > 0) {
          const label = order.entrega_data_limite
            ? format(parseISO(order.entrega_data_limite), "dd/MM/yyyy (EEEE)", { locale: ptBR })
            : "Sem data de entrega";
          rows.push({ type: "separator", dateLabel: label });
        }
        lastDateKey = dateKey;
      }
      rows.push({ type: "order", order });
    });

    return rows;
  }, [filteredAndSorted, selectedDates]);

  const getDateColorClass = (dateStr: string | null) => {
    if (!dateStr) return "";
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const entregaDay = startOfDay(parseISO(dateStr));

    if (entregaDay < today) return "text-red-600 font-semibold";
    if (entregaDay.getTime() === today.getTime()) return "text-yellow-600 font-semibold";
    if (entregaDay.getTime() === tomorrow.getTime()) return "text-blue-600 font-semibold";
    return "";
  };

  const handleDateChange = async (orderId: string, newDate: Date | undefined) => {
    const value = newDate ? newDate.toISOString() : null;
    const { error } = await supabase
      .from("orders")
      .update({ entrega_data_limite: value })
      .eq("id", orderId);
    if (error) {
      toast.error("Erro ao atualizar data de entrega");
    } else {
      toast.success("Data de entrega atualizada");
    }
  };

  const getSectorLabel = (setor: string | null) => {
    if (!setor) return "—";
    const dept = DEPARTMENT_MAP[setor as keyof typeof DEPARTMENT_MAP];
    return dept?.label || setor;
  };

  const getStatusLabel = (setor: string | null, setorStatus: string) => {
    if (!setor) return "—";
    const dept = DEPARTMENT_MAP[setor as keyof typeof DEPARTMENT_MAP];
    if (!dept) return setorStatus;
    const status = dept.statuses.find(s => s.id === setorStatus);
    return status?.label || setorStatus;
  };

  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={() => {}}
      activeCount={activeOrders.length}
      archivedCount={archivedOrders.length}
      sectorName="Entregas"
      countsLoading={ordersLoading}
      permissions={permissions}
    >
      <div className="flex flex-col h-full gap-4 p-4">
        {/* Header */}
         <div className="flex items-center flex-wrap gap-3">
          <h1 className="text-xl font-bold text-foreground">Programação de Entregas</h1>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[260px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDates.size === 0
                    ? "Todas as datas"
                    : `${selectedDates.size} data${selectedDates.size > 1 ? "s" : ""} selecionada${selectedDates.size > 1 ? "s" : ""}`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-2" align="start">
                <div className="flex flex-col gap-1 max-h-[300px] overflow-auto">
                  {availableDates.map(dateStr => (
                    <label key={dateStr} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-sm">
                      <Checkbox
                        checked={selectedDates.has(dateStr)}
                        onCheckedChange={(checked) => {
                          setSelectedDates(prev => {
                            const next = new Set(prev);
                            if (checked) next.add(dateStr);
                            else next.delete(dateStr);
                            return next;
                          });
                        }}
                      />
                      {format(parseISO(dateStr), "dd/MM/yyyy (EEE)", { locale: ptBR })}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            {selectedDates.size > 0 && (
              <Button variant="ghost" size="icon" onClick={() => setSelectedDates(new Set())} title="Limpar filtro de data">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <KanbanFiltersBar filters={kanbanFilters} onChange={setKanbanFilters} showOnly={["vendedores", "setores"]} />

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8"
            onClick={() => exportEntregasPDF(filteredAndSorted, getSectorLabel, getStatusLabel)}
          >
            <FileDown className="h-3.5 w-3.5" />
            PDF
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">Carregando dados...</div>
        ) : (
          <div className="border rounded-lg overflow-x-auto overflow-y-auto flex-1 scrollbar-light">
            <Table className="table-fixed min-w-[1100px]">
              <TableHeader>
                 <TableRow className="bg-muted/50 [&>th]:px-2 [&>th]:py-2 [&>th]:h-9">
                  <TableHead className="whitespace-nowrap w-[50px]">Flags</TableHead>
                  <TableHead className="whitespace-nowrap w-[70px]">OS</TableHead>
                  <TableHead className="whitespace-nowrap w-[120px]">Cliente</TableHead>
                  <TableHead className="whitespace-nowrap w-[160px]">Descrição</TableHead>
                  <TableHead className="whitespace-nowrap w-[90px] bg-blue-100 dark:bg-blue-900/40">Setor</TableHead>
                  <TableHead className="whitespace-nowrap w-[90px] bg-blue-100 dark:bg-blue-900/40">Etapa</TableHead>
                  <TableHead className="whitespace-nowrap w-[100px] bg-blue-100 dark:bg-blue-900/40">Atualização</TableHead>
                  <TableHead className="whitespace-nowrap w-[160px]">Data de Entrega</TableHead>
                  <TableHead className="whitespace-nowrap w-[90px]">Vendedor</TableHead>
                  <TableHead className="whitespace-nowrap w-[160px]">Endereço de Entrega</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsWithSeparators.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      Nenhuma OS encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  rowsWithSeparators.map((row, idx) => {
                    if (row.type === "separator") {
                      return (
                        <TableRow key={`sep-${idx}`} className="hover:bg-transparent">
                          <TableCell colSpan={10} className="h-6 bg-muted/30 border-t border-b text-xs text-muted-foreground font-medium px-3">
                            {row.dateLabel}
                          </TableCell>
                        </TableRow>
                      );
                    }
                    const order = row.order;
                    return (
                      <TableRow key={order.id} className="[&>td]:px-2 [&>td]:py-1.5">
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {/* Flags: lógica futura */}
                          </div>
                        </TableCell>
                        <TableCell className={cn(
                          "font-medium whitespace-nowrap text-xs",
                          !order.entrega_data_limite && ["digital", "ctp", "offset"].includes(order.setor || "") && "text-yellow-600",
                          !order.entrega_data_limite && ["acabamento", "terceiros", "expedicao"].includes(order.setor || "") && "text-red-600"
                        )}>{order.titulo}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs truncate">{order.cliente}</TableCell>
                        <TableCell className="truncate text-xs" title={order.descricao}>{order.descricao}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs bg-blue-50 dark:bg-blue-900/20">{getSectorLabel(order.setor)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs bg-blue-50 dark:bg-blue-900/20">{getStatusLabel(order.setor, order.setor_status)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs bg-blue-50 dark:bg-blue-900/20">
                          {format(parseISO(order.updated_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Input
                            type="datetime-local"
                            className={cn(
                              "h-7 px-1 text-[21.8px] w-[185px] border-none bg-transparent shadow-none",
                              getDateColorClass(order.entrega_data_limite),
                              !order.entrega_data_limite && "text-muted-foreground"
                            )}
                            defaultValue={order.entrega_data_limite ? format(parseISO(order.entrega_data_limite), "yyyy-MM-dd'T'HH:mm") : ""}
                            onBlur={(e) => {
                              if (e.target.value) {
                                handleDateChange(order.id, new Date(e.target.value));
                              } else {
                                handleDateChange(order.id, undefined);
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs truncate">{order.vendedor || "—"}</TableCell>
                        <TableCell className="truncate text-xs" title={order.entrega_endereco || ""}>
                          {order.entrega_endereco || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
}
