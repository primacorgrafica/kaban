import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
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
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  CalendarIcon,
  FileDown,
  Bike,
  Radio,
  UserPlus,
  CloudUpload,
  Activity,
  Plus,
  PackagePlus,
  Truck,
  AlertTriangle,
  Trash2,
  Users,
  Layers,
  Star,
  Filter,
  Unlink,
} from "lucide-react";
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
import { format, parseISO, startOfDay, addDays, isAfter, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DEPARTMENT_MAP } from "@/types/production";
import { toast } from "sonner";
import { exportEntregasPDF } from "@/lib/pdfExport";
import type { Order } from "@/types/order";
import { DeliveryAddressCell } from "@/components/DeliveryAddressCell";
import { DeliveryRegionCell } from "@/components/delivery/DeliveryRegionCell";
import { DeliveryVehicleTypeCell } from "@/components/delivery/DeliveryVehicleTypeCell";
import { AssignDriverModal } from "@/components/delivery/AssignDriverModal";
import { DeliveryMonitoringModal } from "@/components/delivery/DeliveryMonitoringModal";
import { DeliveryMonitoringTab } from "@/components/delivery/monitoring/DeliveryMonitoringTab";
import { DeliveryCompletedDetailsModal } from "@/components/delivery/DeliveryCompletedDetailsModal";
import { SharePointDiagnosticsModal } from "@/components/sharepoint/SharePointDiagnosticsModal";
import { CreateDeliveryDemandModal } from "@/components/delivery/CreateDeliveryDemandModal";
import { DeliveryRoutesBoard } from "@/components/delivery/routes/DeliveryRoutesBoard";
import { DriverManagementModal } from "@/components/delivery/routes/DriverManagementModal";
import { MergeOrdersModal } from "@/components/delivery/MergeOrdersModal";
import {
  getEntregadoresList,
  assignOrderToRoute,
  toggleDeliveryPriority,
  updateDeliveryRegion,
  updateDeliveryVehicleType,
  unmergeOrdersFromDelivery,
} from "@/lib/deliveryService";
import { syncPendingProtocolsToSharePoint } from "@/lib/sharepointService";
import { syncExpedicaoCsvFromSharePoint } from "@/lib/expedicaoCsvSync";
import type { Entregador, DeliveryStatus, LocalidadeComRegional } from "@/types/delivery";
import {
  DELIVERY_STATUS_CONFIG,
  DELIVERY_STATUS_ORDER,
  ROTAS_DISPONIVEIS,
  SEM_REGIAO_LABEL,
  validateSameClientForMerge,
} from "@/types/delivery";
import {
  fetchAllActiveLocalidadesForMatching,
  fetchRegionais,
  matchRegionAndLocalityFromAddress,
  type RegionalWithCount,
} from "@/lib/regionaisService";
import { cleanOsNumber } from "@/components/ProductionCard";

export default function EntregasPage() {
  const { user, authReady } = useAuth();
  const permissions = usePermissions();
  const { activeOrders, archivedOrders, loading: ordersLoading, deleteOrder } = useOrders();

  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

  // Filtros Fase 2: Vendedor, Data (de/até) e Status Entrega + Prioridades primeiro
  const [filterVendedor, setFilterVendedor] = useState<string>("ALL");
  const [filterStatusEntrega, setFilterStatusEntrega] = useState<string>("ALL");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [prioridadesPrimeiro, setPrioridadesPrimeiro] = useState(false);

  const [selectedOrderForDriver, setSelectedOrderForDriver] = useState<Order | null>(null);
  const [selectedDeliveredOrder, setSelectedDeliveredOrder] = useState<Order | null>(null);
  const [showMonitoring, setShowMonitoring] = useState(false);
  // Área 1: Gestão de Entregas abre por padrão na visão de Tabela
  const [viewMode, setViewMode] = useState<"tabela" | "rotas" | "monitoramento">("tabela");
  const [createDemandOpen, setCreateDemandOpen] = useState(false);
  const [driverManagementOpen, setDriverManagementOpen] = useState(false);

  // Estados da Fase 3: Seleção e Fusão de Ordens de Serviço
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeBaseOrder, setMergeBaseOrder] = useState<Order | null>(null);
  const [mergePreselectedIds, setMergePreselectedIds] = useState<string[]>([]);

  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [regionaisCache, setRegionaisCache] = useState<RegionalWithCount[]>([]);
  const [activeLocalidades, setActiveLocalidades] = useState<LocalidadeComRegional[]>([]);

  const reloadEntregadores = () => {
    void getEntregadoresList().then((res) => {
      if (res.data) setEntregadores(res.data);
    });
  };

  useEffect(() => {
    reloadEntregadores();
    void fetchRegionais(false).then((res) => {
      if (res.data) setRegionaisCache(res.data);
    });
    void fetchAllActiveLocalidadesForMatching().then((locs) => {
      setActiveLocalidades(locs);
    });
  }, []);

  const driverMap = useMemo(() => {
    const map = new Map<string, string>();
    entregadores.forEach((e) => {
      if (e.user_id) map.set(e.user_id, e.nome_completo);
      map.set(e.id, e.nome_completo);
    });
    return map;
  }, [entregadores]);

  const [isSyncingSharepoint, setIsSyncingSharepoint] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("arquivado", false)
      .order("updated_at", { ascending: false });

    if (data) {
      // Filtra ordens de outros tipos/sub-ordens (M, C, NC, faturamento, sub-ordens)
      const filtered = (data as unknown as Order[]).filter((order) => {
        const o = order as any;
        if (o.om_numero) return false;
        if (o.oc_numero) return false;
        if (o.nc_numero) return false;
        if (order.setor === "faturamento") return false;
        if (order.setor === "qualidade" || order.setor === "ctp" || order.setor === "digital") return false;

        // Provas Digitais ("P") são entregas legítimas vinculadas à O.S. de pré-impressão
        const isProof =
          order.titulo?.toUpperCase().startsWith("P") ||
          order.tipo_entrega?.includes("prova_digital") ||
          Boolean(o.is_prova_entrega);

        // Se for cópia interna de expedição que não seja prova, não exibe duplicada
        if (order.parent_order_id && order.setor === "expedicao" && !isProof) return false;
        return true;
      });

      // Auto-detecção de região caso a ordem ainda não possua
      if (activeLocalidades.length > 0) {
        for (const ord of filtered) {
          if (!ord.regiao) {
            const rawAddr = ord.entrega_endereco || ord.endereco_entrega;
            if (rawAddr) {
              const matched = matchRegionAndLocalityFromAddress(rawAddr, activeLocalidades);
              if (matched.regionalNome) {
                ord.regiao = matched.regionalNome;
                ord.regional_id = matched.regionalId;
                ord.localidade_id = matched.localidadeId;
                // Atualiza em segundo plano no Supabase
                void updateDeliveryRegion(ord.id, {
                  regional_id: matched.regionalId,
                  localidade_id: matched.localidadeId,
                  regiao: matched.regionalNome,
                });
              }
            }
          }
        }
      }

      setAllOrders(filtered);
    }
    setLoading(false);
  }, [activeLocalidades]);

  useEffect(() => {
    if (!authReady || !user) return;
    void fetchOrders();

    // Leitura automática silenciosa do CSV da pasta EXPEDICAO no SharePoint
    void syncExpedicaoCsvFromSharePoint(false).then((csvRes) => {
      if (csvRes.success && csvRes.updatedCount > 0) {
        toast.success(
          `CSV "${csvRes.fileName}" sincronizado: ${csvRes.updatedCount} O.S. atualizada(s).`
        );
        void fetchOrders();
      }
    });

    const channel = supabase
      .channel("entregas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authReady, user, fetchOrders]);

  // Contagem de comprovantes aguardando sincronização com SharePoint
  const pendingSharepointCount = useMemo(() => {
    return allOrders.filter(
      (o) =>
        o.status_entrega === "entregue" &&
        (o.status_comprovante_sync === "pendente_sharepoint" || o.status_comprovante_sync === "pendente")
    ).length;
  }, [allOrders]);

  const handleSyncSharepoint = async (interactive = true) => {
    if (isSyncingSharepoint) return;
    setIsSyncingSharepoint(true);
    try {
      const [res, csvRes] = await Promise.all([
        syncPendingProtocolsToSharePoint(interactive),
        syncExpedicaoCsvFromSharePoint(interactive),
      ]);

      if (csvRes.success && csvRes.updatedCount > 0) {
        toast.success(
          `CSV "${csvRes.fileName}" importado: ${csvRes.updatedCount} O.S. atualizada(s)!`
        );
        void fetchOrders();
      } else if (csvRes.error && interactive && !csvRes.skippedNoSession) {
        toast.warning(`Aviso CSV Expedição: ${csvRes.error}`);
      }

      if (res.synced > 0) {
        toast.success(`${res.synced} protocolo(s) de entrega sincronizado(s) com sucesso no SharePoint!`);
        void fetchOrders();
      } else if (res.total === 0 && (!csvRes.success || csvRes.updatedCount === 0)) {
        if (interactive) toast.info("Todos os protocolos e dados do CSV já estão sincronizados com o SharePoint.");
      }

      if (res.errors.length > 0 && interactive) {
        toast.error(`Falha ao sincronizar: ${res.errors.join("; ")}`);
      }
    } catch (err: any) {
      if (interactive) {
        toast.error(`Erro ao sincronizar com SharePoint: ${err?.message || err}`);
      }
    } finally {
      setIsSyncingSharepoint(false);
    }
  };

  // Lista única de vendedores existentes nas ordens
  const availableVendedores = useMemo(() => {
    const set = new Set<string>();
    allOrders.forEach((o) => {
      if (o.vendedor?.trim()) set.add(o.vendedor.trim());
    });
    return Array.from(set).sort();
  }, [allOrders]);

  // Datas únicas para seleção rápida
  const availableDates = useMemo(() => {
    const dateSet = new Set<string>();
    allOrders.forEach((o) => {
      if (o.entrega_data_limite) {
        const dayStr = format(parseISO(o.entrega_data_limite), "yyyy-MM-dd");
        dateSet.add(dayStr);
      }
    });
    return Array.from(dateSet).sort();
  }, [allOrders]);

  // Contagem de prioridades ativas
  const totalPrioridades = useMemo(
    () => allOrders.filter((o) => Boolean(o.rota_prioridade || o.urgente)).length,
    [allOrders]
  );

  // Filtragem e Ordenação da Fase 2:
  // - Filtros: Vendedor, Data (de/até) e Status Entrega
  // - Ordenação padrão: Data Entrega (ascendente)
  // - Opção de ordenar prioridades primeiro
  const filteredAndSorted = useMemo(() => {
    let list = [...allOrders];

    // 1. Filtro rápido de datas específicas (multi-select)
    if (selectedDates.size > 0) {
      list = list.filter((o) => {
        if (!o.entrega_data_limite) return false;
        const dayStr = format(parseISO(o.entrega_data_limite), "yyyy-MM-dd");
        return selectedDates.has(dayStr);
      });
    }

    // 2. Filtro Data De / Até sobre entrega_data_limite
    if (filterDateFrom) {
      const fromDate = startOfDay(parseISO(filterDateFrom));
      list = list.filter((o) => {
        if (!o.entrega_data_limite) return false;
        const oDate = startOfDay(parseISO(o.entrega_data_limite));
        return oDate >= fromDate;
      });
    }

    if (filterDateTo) {
      const toDate = startOfDay(parseISO(filterDateTo));
      list = list.filter((o) => {
        if (!o.entrega_data_limite) return false;
        const oDate = startOfDay(parseISO(o.entrega_data_limite));
        return oDate <= toDate;
      });
    }

    // 3. Filtro por Vendedor
    if (filterVendedor !== "ALL") {
      list = list.filter((o) => (o.vendedor || "").trim() === filterVendedor);
    }

    // 4. Filtro por Status Entrega
    if (filterStatusEntrega !== "ALL") {
      list = list.filter((o) => {
        const currentStatus = o.status_entrega || "pendente";
        return currentStatus === filterStatusEntrega;
      });
    }

    // 5. Filtro por busca textual (OS, Cliente, Descrição, Vendedor, Endereço, Região)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (o) =>
          o.titulo.toLowerCase().includes(q) ||
          o.cliente.toLowerCase().includes(q) ||
          o.descricao.toLowerCase().includes(q) ||
          (o.vendedor || "").toLowerCase().includes(q) ||
          (o.entrega_endereco || "").toLowerCase().includes(q) ||
          (o.endereco_entrega || "").toLowerCase().includes(q) ||
          (o.regiao || "").toLowerCase().includes(q)
      );
    }

    // 6. Ordenação padrão: por Data Entrega (ascendente)
    // Se "prioridadesPrimeiro" estiver ativo: ordens prioritárias no topo
    list.sort((a, b) => {
      if (prioridadesPrimeiro) {
        const aPrio = Boolean(a.rota_prioridade || a.urgente);
        const bPrio = Boolean(b.rota_prioridade || b.urgente);
        if (aPrio && !bPrio) return -1;
        if (!aPrio && bPrio) return 1;
      }

      const aDate = a.entrega_data_limite;
      const bDate = b.entrega_data_limite;
      const aHasDate = Boolean(aDate);
      const bHasDate = Boolean(bDate);

      // Com data vem antes de sem data
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
  }, [
    allOrders,
    selectedDates,
    filterDateFrom,
    filterDateTo,
    filterVendedor,
    filterStatusEntrega,
    searchQuery,
    prioridadesPrimeiro,
  ]);

  // Estrutura para exibição unificada de Paradas Fundidas (Fase 3)
  const displayStops = useMemo(() => {
    const stops: Array<{
      key: string;
      isMerged: boolean;
      paradaAgrupadaId?: string | null;
      orders: Order[];
      mainOrder: Order;
      displayTitle: string;
      displayDescricao: string;
      allOrderIds: string[];
    }> = [];
    const groupedMap = new Map<string, Order[]>();
    const seenParadas = new Set<string>();

    filteredAndSorted.forEach((o) => {
      if (o.parada_agrupada_id) {
        const list = groupedMap.get(o.parada_agrupada_id) || [];
        list.push(o);
        groupedMap.set(o.parada_agrupada_id, list);
      }
    });

    filteredAndSorted.forEach((o) => {
      if (o.parada_agrupada_id) {
        if (seenParadas.has(o.parada_agrupada_id)) return;
        seenParadas.add(o.parada_agrupada_id);

        const group = groupedMap.get(o.parada_agrupada_id) || [o];
        group.sort((a, b) => a.titulo.localeCompare(b.titulo, undefined, { numeric: true }));

        const displayTitle = group.map((item) => item.titulo).join(" + ");
        const displayDescricao = group
          .map((item) => (item.descricao ? `[${item.titulo}] ${item.descricao}` : `OS #${item.titulo}`))
          .join(" • ");

        stops.push({
          key: `group_${o.parada_agrupada_id}`,
          isMerged: group.length > 1,
          paradaAgrupadaId: o.parada_agrupada_id,
          orders: group,
          mainOrder: group[0],
          displayTitle,
          displayDescricao,
          allOrderIds: group.map((item) => item.id),
        });
      } else {
        stops.push({
          key: `single_${o.id}`,
          isMerged: false,
          paradaAgrupadaId: null,
          orders: [o],
          mainOrder: o,
          displayTitle: o.titulo,
          displayDescricao: o.descricao,
          allOrderIds: [o.id],
        });
      }
    });

    return stops;
  }, [filteredAndSorted]);

  // Linhas com separadores visuais caso 2+ datas específicas estejam marcadas
  const rowsWithSeparators = useMemo(() => {
    const rows: Array<{
      type: "stop";
      stop: (typeof displayStops)[0];
    } | { type: "separator"; dateLabel: string }> = [];
    const showSeparators = selectedDates.size >= 2;
    let lastDateKey = "";

    displayStops.forEach((stop) => {
      const order = stop.mainOrder;
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
      rows.push({ type: "stop", stop });
    });

    return rows;
  }, [displayStops, selectedDates]);

  // Validação das O.S. selecionadas via checkbox para Fusão
  const { selectedSameClient, selectedClientName } = useMemo(() => {
    if (selectedRowIds.size === 0) return { selectedSameClient: false, selectedClientName: "" };
    const selectedOrders = allOrders.filter((o) => selectedRowIds.has(o.id));
    const val = validateSameClientForMerge(selectedOrders);
    return { selectedSameClient: val.valid, selectedClientName: val.clientName || "" };
  }, [selectedRowIds, allOrders]);

  const handleOpenMerge = (base?: Order, preselectedIds?: string[]) => {
    setMergeBaseOrder(base || null);
    setMergePreselectedIds(preselectedIds || (base ? [base.id] : []));
    setMergeModalOpen(true);
  };

  const handleUnmerge = async (paradaId: string) => {
    const res = await unmergeOrdersFromDelivery(paradaId);
    if (!res.success) {
      toast.error(res.error || "Erro ao desfazer fusão.");
      return;
    }
    toast.success("Fusão desfeita com sucesso! As O.S. voltaram a ser entregas individuais.");
    void fetchOrders();
  };

  const getDateColorClass = (dateStr: string | null) => {
    if (!dateStr) return "";
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const entregaDay = startOfDay(parseISO(dateStr));

    if (entregaDay < today) return "text-red-500 font-semibold";
    if (entregaDay.getTime() === today.getTime()) return "text-yellow-500 font-semibold";
    if (entregaDay.getTime() === tomorrow.getTime()) return "text-blue-500 font-semibold";
    return "";
  };

  const handleDateChange = async (orderId: string, newDate: Date | undefined, affectedIds?: string[]) => {
    const value = newDate ? newDate.toISOString() : null;
    const targetIds = affectedIds && affectedIds.length > 0 ? affectedIds : [orderId];
    const { error } = await supabase
      .from("orders")
      .update({ entrega_data_limite: value })
      .in("id", targetIds);
    if (error) {
      toast.error("Erro ao atualizar data de entrega");
    } else {
      toast.success("Data de entrega atualizada com sucesso!");
      const idSet = new Set(targetIds);
      setAllOrders((prev) =>
        prev.map((o) => (idSet.has(o.id) ? { ...o, entrega_data_limite: value } : o))
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;
    setIsDeleting(true);
    try {
      await deleteOrder(orderToDelete.id);
      setAllOrders((prev) => prev.filter((o) => o.id !== orderToDelete.id));
      setOrderToDelete(null);
    } catch (err: any) {
      console.error("[EntregasPage] Erro ao excluir demanda:", err);
      toast.error(`Erro ao excluir: ${err.message || "Falha na exclusão"}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const getSectorLabel = (setor: string | null) => {
    if (!setor) return "Pré-Impressão";
    const dept = DEPARTMENT_MAP[setor as keyof typeof DEPARTMENT_MAP];
    return dept?.label || setor;
  };

  const getStatusLabel = (setor: string | null, setorStatus: string) => {
    if (!setor) return "Preparando Arquivo";
    const dept = DEPARTMENT_MAP[setor as keyof typeof DEPARTMENT_MAP];
    if (!dept) return setorStatus;
    const status = dept.statuses.find((s) => s.id === setorStatus);
    return status?.label || setorStatus;
  };

  const hasActiveFilters =
    filterVendedor !== "ALL" ||
    filterStatusEntrega !== "ALL" ||
    Boolean(filterDateFrom) ||
    Boolean(filterDateTo) ||
    selectedDates.size > 0 ||
    prioridadesPrimeiro;

  const clearAllFilters = () => {
    setFilterVendedor("ALL");
    setFilterStatusEntrega("ALL");
    setFilterDateFrom("");
    setFilterDateTo("");
    setSelectedDates(new Set());
    setPrioridadesPrimeiro(false);
    setSearchQuery("");
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
      <div className="flex flex-col h-full gap-3 sm:gap-4 p-2 sm:p-4">
        {/* Header Superior com Modos de Visualização e Ações */}
        <div className="flex items-center flex-wrap justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">Gestão de Entregas</h1>
            <div className="flex items-center rounded-lg bg-muted/60 border border-border p-0.5">
              <Button
                variant={viewMode === "tabela" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2.5 font-medium gap-1.5 cursor-pointer"
                onClick={() => setViewMode("tabela")}
              >
                <Truck className="h-3.5 w-3.5" />
                Tabela
              </Button>
              <Button
                variant={viewMode === "rotas" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2.5 font-medium gap-1.5 cursor-pointer"
                onClick={() => setViewMode("rotas")}
              >
                <Layers className="h-3.5 w-3.5 text-primary" />
                Quadro de Rotas
              </Button>
              <Button
                variant={viewMode === "monitoramento" ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 text-xs px-2.5 font-medium gap-1.5 cursor-pointer",
                  viewMode === "monitoramento" ? "text-emerald-500 font-bold" : "text-muted-foreground"
                )}
                onClick={() => setViewMode("monitoramento")}
              >
                <Radio className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
                Monitoramento GPS
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 border-primary/30 text-primary hover:bg-primary/10 font-medium"
              onClick={() => setDriverManagementOpen(true)}
              title="Cadastrar e gerenciar motoristas da frota (Carro/Moto, CNH e status)"
            >
              <Users className="h-3.5 w-3.5" />
              Entregadores
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => setShowMonitoring(true)}
            >
              <Radio className="h-3.5 w-3.5" />
              Monitoramento
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => exportEntregasPDF(filteredAndSorted, getSectorLabel, getStatusLabel)}
            >
              <FileDown className="h-3.5 w-3.5" />
              PDF
            </Button>

            {pendingSharepointCount > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 border-sky-500/50 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20"
                onClick={() => handleSyncSharepoint(true)}
                disabled={isSyncingSharepoint}
                title={`${pendingSharepointCount} comprovante(s) pendente(s) de envio para a pasta PROTOCOLOS ENTREGAS no SharePoint`}
              >
                <CloudUpload className={cn("h-3.5 w-3.5", isSyncingSharepoint && "animate-spin")} />
                Sync SharePoint ({pendingSharepointCount})
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-xs text-sky-400/80 hover:text-sky-300"
                onClick={() => handleSyncSharepoint(true)}
                disabled={isSyncingSharepoint}
                title="Sincronizar protocolos com a pasta PROTOCOLOS ENTREGAS no SharePoint"
              >
                <CloudUpload className={cn("h-3.5 w-3.5", isSyncingSharepoint && "animate-spin")} />
                Sync SharePoint
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDiagnosticsOpen(true)}
              className="h-8 w-7 text-slate-400 hover:text-sky-300 hover:bg-sky-500/10"
              title="Abrir Logs e Diagnóstico do SharePoint"
            >
              <Activity className="h-3.5 w-3.5" />
            </Button>

            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              title="Abrir visão mobile do entregador em nova aba"
            >
              <Link to="/entregador" target="_blank" rel="noopener noreferrer">
                <Bike className="h-3.5 w-3.5" />
                App Entregador
              </Link>
            </Button>

            <Button
              size="sm"
              className="gap-1.5 h-8 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs"
              onClick={() => setCreateDemandOpen(true)}
              title="Cadastrar uma nova demanda manual para coleta (buscar algo) ou entrega"
            >
              <Plus className="h-4 w-4" />
              Nova Demanda
            </Button>
          </div>
        </div>

        {/* Barra de Filtros da Fase 2 (Vendedor, Data de Entrega de/até, Status de Entrega, Prioridades) */}
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border bg-card/60 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {/* 1. Filtro por Vendedor */}
            <Select value={filterVendedor} onValueChange={setFilterVendedor}>
              <SelectTrigger className="h-8 text-xs w-[145px]">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="ALL" className="text-xs">
                  Todos Vendedores
                </SelectItem>
                {availableVendedores.map((v) => (
                  <SelectItem key={v} value={v} className="text-xs">
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 2. Filtro por Status de Entrega */}
            <Select value={filterStatusEntrega} onValueChange={setFilterStatusEntrega}>
              <SelectTrigger className="h-8 text-xs w-[175px]">
                <SelectValue placeholder="Status Entrega" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-xs">
                  Todos os Status
                </SelectItem>
                {DELIVERY_STATUS_ORDER.map((st) => (
                  <SelectItem key={st} value={st} className="text-xs">
                    {DELIVERY_STATUS_CONFIG[st].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 3. Filtro por Data de Entrega (De / Até) */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Entrega:</span>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                placeholder="De"
                className="h-8 text-xs w-[125px] px-2"
                title="Data de Entrega inicial"
              />
              <span className="text-muted-foreground text-xs">até</span>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                placeholder="Até"
                className="h-8 text-xs w-[125px] px-2"
                title="Data de Entrega final"
              />
            </div>

            {/* 4. Multi-select de Datas Específicas */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs px-2.5">
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {selectedDates.size === 0
                    ? "Datas pontuais"
                    : `${selectedDates.size} selecionada(s)`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-2" align="start">
                <div className="flex flex-col gap-1 max-h-[280px] overflow-auto">
                  {availableDates.map((dateStr) => (
                    <label
                      key={dateStr}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-xs"
                    >
                      <Checkbox
                        checked={selectedDates.has(dateStr)}
                        onCheckedChange={(checked) => {
                          setSelectedDates((prev) => {
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

            {/* 5. Toggle de Prioridades Primeiro */}
            <Button
              type="button"
              variant={prioridadesPrimeiro ? "secondary" : "outline"}
              size="sm"
              onClick={() => setPrioridadesPrimeiro(!prioridadesPrimeiro)}
              className={cn(
                "h-8 text-xs gap-1.5 transition-colors",
                prioridadesPrimeiro && "bg-amber-500/20 text-amber-400 border-amber-500/50 font-bold"
              )}
              title="Ordenar prioridades no topo da lista"
            >
              <Star
                className={cn("h-3.5 w-3.5", prioridadesPrimeiro && "fill-amber-400 text-amber-400")}
              />
              Prioridades primeiro ({totalPrioridades})
            </Button>

            {/* Limpar Filtros */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
                title="Limpar todos os filtros"
              >
                <X className="h-3.5 w-3.5" />
                Limpar
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground font-mono">
            {filteredAndSorted.length} O.S. listada(s)
          </div>
        </div>

        {/* Content Area */}
        {viewMode === "monitoramento" ? (
          <div className="flex-1 min-h-[600px] h-[calc(100vh-175px)]">
            <DeliveryMonitoringTab initialOrders={allOrders} />
          </div>
        ) : viewMode === "rotas" ? (
          <div className="flex-1 min-h-[500px] sm:min-h-[600px] h-[calc(100vh-175px)]">
            <DeliveryRoutesBoard
              orders={allOrders}
              entregadores={entregadores}
              driverMap={driverMap}
              onRefresh={fetchOrders}
              onOpenDriverManagement={() => setDriverManagementOpen(true)}
            />
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Carregando entregas...
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden gap-2">
            {/* Barra de ações para seleção múltipla de O.S. (Fase 3 - Fusão) */}
            {selectedRowIds.size > 0 && (
              <div className="flex items-center justify-between p-2 px-3 bg-primary/10 border border-primary/30 rounded-lg text-xs animate-in fade-in shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">
                    {selectedRowIds.size} entrega(s) selecionada(s)
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">
                    {selectedSameClient
                      ? `Cliente: ${selectedClientName}`
                      : "Clientes diferentes selecionados (fusão permitida apenas para o mesmo cliente)"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setSelectedRowIds(new Set())}
                  >
                    Limpar Seleção
                  </Button>
                  <Button
                    size="sm"
                    disabled={!selectedSameClient || selectedRowIds.size < 2}
                    className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5"
                    onClick={() => {
                      const selectedList = allOrders.filter((o) => selectedRowIds.has(o.id));
                      handleOpenMerge(selectedList[0], Array.from(selectedRowIds));
                    }}
                    title={
                      !selectedSameClient
                        ? "Fusão permitida apenas para o MESMO cliente"
                        : "Fundir O.S. selecionadas em uma única parada física"
                    }
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Fundir Selecionadas ({selectedRowIds.size})
                  </Button>
                </div>
              </div>
            )}

            <div className="border rounded-lg overflow-x-auto overflow-y-auto flex-1 scrollbar-light">
              <Table className="table-fixed w-full min-w-[1260px]">
                <TableHeader>
                  <TableRow className="bg-muted/50 [&>th]:px-1.5 [&>th]:py-2 [&>th]:h-9 [&>th]:text-[11px]">
                    <TableHead className="whitespace-nowrap w-[28px] text-center">
                      <Checkbox
                        checked={
                          displayStops.length > 0 &&
                          displayStops.every((s) => s.allOrderIds.every((id) => selectedRowIds.has(id)))
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            const allIds = new Set<string>();
                            displayStops.forEach((s) => s.allOrderIds.forEach((id) => allIds.add(id)));
                            setSelectedRowIds(allIds);
                          } else {
                            setSelectedRowIds(new Set());
                          }
                        }}
                        title="Selecionar todas as entregas"
                      />
                    </TableHead>
                    <TableHead className="whitespace-nowrap w-[44px]">Flags</TableHead>
                    <TableHead className="whitespace-nowrap w-[64px]">OS</TableHead>
                    <TableHead className="whitespace-nowrap w-[110px]">Cliente</TableHead>
                    <TableHead className="whitespace-nowrap w-[125px]">Descrição</TableHead>
                    <TableHead className="whitespace-nowrap w-[120px] bg-blue-100 dark:bg-blue-900/30">
                      Status Prod.
                    </TableHead>
                    <TableHead className="whitespace-nowrap w-[88px] bg-blue-100 dark:bg-blue-900/30">
                      Atualização
                    </TableHead>
                    <TableHead className="whitespace-nowrap w-[68px]">Vendedor</TableHead>
                    <TableHead className="whitespace-nowrap w-[132px]">Data Entrega</TableHead>
                    <TableHead className="whitespace-nowrap w-[115px]">Endereço</TableHead>
                    <TableHead className="whitespace-nowrap w-[92px]">Região</TableHead>
                    <TableHead className="whitespace-nowrap w-[68px]">Tipo</TableHead>
                    <TableHead className="whitespace-nowrap w-[115px]">Status Entrega</TableHead>
                    <TableHead className="whitespace-nowrap w-[72px]">Atribuir</TableHead>
                    <TableHead className="whitespace-nowrap w-[56px] text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsWithSeparators.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center text-muted-foreground py-10">
                        Nenhuma entrega encontrada para os filtros aplicados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rowsWithSeparators.map((row, idx) => {
                      if (row.type === "separator") {
                        return (
                          <TableRow key={`sep-${idx}`} className="hover:bg-transparent">
                            <TableCell
                              colSpan={15}
                              className="h-6 bg-muted/40 border-t border-b text-xs text-muted-foreground font-semibold px-3"
                            >
                              {row.dateLabel}
                            </TableCell>
                          </TableRow>
                        );
                      }
                      const stop = row.stop;
                      const order = stop.mainOrder;
                      const statusEntregaKey = (order.status_entrega || "pendente") as DeliveryStatus;
                      const statusConfig =
                        DELIVERY_STATUS_CONFIG[statusEntregaKey] || DELIVERY_STATUS_CONFIG.pendente;
                      const isPriority = Boolean(order.rota_prioridade || order.urgente);
                      const isStopChecked = stop.allOrderIds.every((id) => selectedRowIds.has(id));

                      return (
                        <TableRow
                          key={stop.key}
                          className={cn(
                            "[&>td]:px-1.5 [&>td]:py-1.5 transition-colors",
                            isPriority && "bg-amber-500/10 dark:bg-amber-950/20 border-l-2 border-l-amber-500",
                            stop.isMerged && "bg-primary/[0.03]"
                          )}
                        >
                          {/* 0. Checkbox de seleção */}
                          <TableCell className="text-center whitespace-nowrap px-1">
                            <Checkbox
                              checked={isStopChecked}
                              onCheckedChange={(checked) => {
                                setSelectedRowIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) {
                                    stop.allOrderIds.forEach((id) => next.add(id));
                                  } else {
                                    stop.allOrderIds.forEach((id) => next.delete(id));
                                  }
                                  return next;
                                });
                              }}
                              title="Selecionar esta entrega para fusão"
                            />
                          </TableCell>

                          {/* 1. Flags (Prioridade marca/desmarca, Coleta, Urgente) */}
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 p-0 text-muted-foreground hover:text-amber-500"
                                onClick={async () => {
                                  const nextPriority = !isPriority;
                                  for (const id of stop.allOrderIds) {
                                    await toggleDeliveryPriority(id, nextPriority);
                                  }
                                  toast.info(
                                    nextPriority
                                      ? `Demanda #${stop.displayTitle} marcada como prioritária!`
                                      : "Prioridade removida."
                                  );
                                  const idSet = new Set(stop.allOrderIds);
                                  setAllOrders((prev) =>
                                    prev.map((o) =>
                                      idSet.has(o.id) ? { ...o, rota_prioridade: nextPriority } : o
                                    )
                                  );
                                }}
                                title={
                                  isPriority
                                    ? "Prioridade marcada. Clique para remover."
                                    : "Marcar como prioridade"
                                }
                              >
                                <Star
                                  className={cn(
                                    "h-3.5 w-3.5",
                                    isPriority && "fill-amber-500 text-amber-500"
                                  )}
                                />
                              </Button>

                              {order.tipo_entrega?.includes("coleta") ? (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30"
                                  title="Demanda de Coleta / Buscar"
                                >
                                  <PackagePlus className="h-3 w-3" /> Coleta
                                </span>
                              ) : order.tipo_entrega?.includes("demanda_manual") ? (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-500 dark:text-blue-400 border border-blue-500/30"
                                  title="Demanda Manual de Entrega"
                                >
                                  <Truck className="h-3 w-3" /> Entrega
                                </span>
                              ) : null}

                              {order.urgente && (
                                <span
                                  className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-500 border border-red-500/30"
                                  title="Demanda Marcada como Urgente"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                </span>
                              )}
                            </div>
                          </TableCell>

                          {/* 2. OS */}
                          <TableCell
                            className={cn(
                              "font-bold whitespace-nowrap text-xs",
                              !order.entrega_data_limite && ["digital", "ctp", "offset"].includes(order.setor || "") && "text-yellow-600",
                              !order.entrega_data_limite && ["acabamento", "terceiros", "expedicao"].includes(order.setor || "") && "text-red-600"
                            )}
                          >
                            <div className="flex flex-col">
                              <span className="font-mono">{stop.displayTitle}</span>
                              {stop.isMerged && (
                                <Badge className="bg-primary/20 text-primary border-primary/40 text-[9px] px-1 py-0 font-bold gap-1 mt-0.5 w-fit">
                                  <Layers className="h-2.5 w-2.5" />
                                  {stop.orders.length} OS Fundidas
                                </Badge>
                              )}
                              {!stop.isMerged && (order.titulo.toUpperCase().startsWith("P") || order.tipo_entrega?.includes("prova_digital")) && (
                                <Badge className="bg-purple-900/40 text-purple-300 border-purple-600/40 text-[9px] px-1 py-0 font-bold w-fit mt-0.5">
                                  Prova Digital
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          {/* 3. Cliente */}
                          <TableCell className="whitespace-nowrap text-xs truncate" title={order.cliente}>
                            {order.cliente}
                          </TableCell>

                          {/* 4. Descrição */}
                          <TableCell className="truncate text-xs" title={stop.displayDescricao}>
                            {stop.displayDescricao}
                          </TableCell>

                          {/* 5. Status Produção (Etapa atual no Kanban) */}
                          <TableCell className="whitespace-nowrap text-xs bg-blue-50/50 dark:bg-blue-950/20 max-w-[185px] overflow-hidden">
                            <div className="truncate" title={`${getSectorLabel(order.setor)} (${getStatusLabel(order.setor, order.setor_status)})`}>
                              <span className="font-semibold text-foreground">
                                {getSectorLabel(order.setor)}
                              </span>
                              <span className="text-[11px] text-muted-foreground ml-1">
                                ({getStatusLabel(order.setor, order.setor_status)})
                              </span>
                            </div>
                          </TableCell>

                          {/* 6. Atualização (data/hora da última atualização da OS) */}
                          <TableCell className="whitespace-nowrap text-xs bg-blue-50/50 dark:bg-blue-950/20 font-mono text-[11px]">
                            {format(parseISO(order.updated_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </TableCell>

                          {/* 7. Vendedor */}
                          <TableCell className="whitespace-nowrap text-xs truncate">
                            {order.vendedor || "—"}
                          </TableCell>

                          {/* 8. Data Entrega */}
                          <TableCell className="whitespace-nowrap">
                            <Input
                              type="datetime-local"
                              className={cn(
                                "h-7 px-1 text-xs w-[170px] border-none bg-transparent shadow-none",
                                getDateColorClass(order.entrega_data_limite),
                                !order.entrega_data_limite && "text-muted-foreground"
                              )}
                              defaultValue={
                                order.entrega_data_limite
                                  ? format(parseISO(order.entrega_data_limite), "yyyy-MM-dd'T'HH:mm")
                                  : ""
                              }
                              onBlur={(e) => {
                                if (e.target.value) {
                                  void handleDateChange(order.id, new Date(e.target.value), stop.allOrderIds);
                                } else {
                                  void handleDateChange(order.id, undefined, stop.allOrderIds);
                                }
                              }}
                            />
                          </TableCell>

                          {/* 9. Endereço */}
                          <TableCell className="py-1 px-2 text-xs">
                            <DeliveryAddressCell
                              address={order.entrega_endereco}
                              fallbackAddress={order.endereco_entrega}
                            />
                          </TableCell>

                          {/* 10. Região (com ajuste manual em Popover e fallback 'Sem região') */}
                          <TableCell className="whitespace-nowrap text-xs">
                            <DeliveryRegionCell
                              orderId={order.id}
                              regiao={order.regiao}
                              regionalId={order.regional_id}
                              localidadeId={order.localidade_id}
                              regionaisCache={regionaisCache}
                              onRegionUpdated={(selection) => {
                                const idSet = new Set(stop.allOrderIds);
                                setAllOrders((prev) =>
                                  prev.map((o) =>
                                    idSet.has(o.id)
                                      ? {
                                          ...o,
                                          regiao: selection.regionalNome,
                                          regional_id: selection.regionalId,
                                          localidade_id: selection.localidadeId,
                                        }
                                      : o
                                  )
                                );
                                // Atualiza todas as ordens vinculadas à mesma parada agrupada
                                for (const id of stop.allOrderIds) {
                                  void updateDeliveryRegion(id, {
                                    regional_id: selection.regionalId,
                                    localidade_id: selection.localidadeId,
                                    regiao: selection.regionalNome,
                                  });
                                }
                              }}
                            />
                          </TableCell>

                          {/* 11. Tipo (Carro ou Moto) */}
                          <TableCell className="whitespace-nowrap text-xs">
                            <DeliveryVehicleTypeCell
                              orderId={order.id}
                              tipo={order.tipo_veiculo_entrega}
                              onTypeUpdated={(newType) => {
                                const idSet = new Set(stop.allOrderIds);
                                setAllOrders((prev) =>
                                  prev.map((o) =>
                                    idSet.has(o.id) ? { ...o, tipo_veiculo_entrega: newType } : o
                                  )
                                );
                                for (const id of stop.allOrderIds) {
                                  void updateDeliveryVehicleType(id, newType);
                                }
                              }}
                            />
                          </TableCell>

                          {/* 12. Status Entrega (Aguardando atribuição como inicial, Atribuído, Em Rota...) */}
                          <TableCell className="whitespace-nowrap text-xs">
                            {order.entregador_id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (order.status_entrega === "entregue") {
                                    setSelectedDeliveredOrder(order);
                                  } else {
                                    setSelectedOrderForDriver(order);
                                  }
                                }}
                                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity text-left max-w-[155px]"
                                title={
                                  order.status_entrega === "entregue"
                                    ? "Clique para ver comprovante, recebedor e protocolo"
                                    : "Clique para gerenciar atribuição do motoboy"
                                }
                              >
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px] px-1.5 py-0 font-normal shrink-0",
                                    statusConfig.badgeClass
                                  )}
                                >
                                  {statusConfig.label}
                                </Badge>
                                <span className="truncate font-medium text-foreground">
                                  {driverMap.get(order.entregador_id) || "Atribuído"}
                                </span>
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px] px-1.5 py-0 font-normal", statusConfig.badgeClass)}
                                >
                                  {statusConfig.label}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedOrderForDriver(order)}
                                  className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-primary gap-1"
                                  title="Atribuir motoboy a esta O.S."
                                >
                                  <UserPlus className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </TableCell>

                          {/* 13. Atribuir (Rota 1 a 6 ou Retira) */}
                          <TableCell className="whitespace-nowrap text-xs">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-card hover:bg-muted text-xs font-medium cursor-pointer"
                                  title="Atribuir entrega a uma rota"
                                >
                                  {order.rota_numero ? (
                                    <>
                                      <span
                                        className={
                                          order.rota_numero === "RETIRA"
                                            ? "text-purple-400 font-bold"
                                            : "text-primary font-bold"
                                        }
                                      >
                                        {order.rota_numero === "RETIRA"
                                          ? "RETIRA"
                                          : `Rota ${order.rota_numero}`}
                                      </span>
                                      {order.rota_sequencia && (
                                        <span className="text-[10px] text-muted-foreground font-mono">
                                          #{order.rota_sequencia}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground text-[11px]">+ Rota</span>
                                  )}
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="text-xs w-36">
                                <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                                  Definir Rota:
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {ROTAS_DISPONIVEIS.map((r) => (
                                  <DropdownMenuItem
                                    key={r.id}
                                    onClick={async () => {
                                      for (const id of stop.allOrderIds) {
                                        await assignOrderToRoute(id, r.id);
                                      }
                                      toast.success(`Demanda alocada na ${r.label}`);
                                      const idSet = new Set(stop.allOrderIds);
                                      setAllOrders((prev) =>
                                        prev.map((o) =>
                                          idSet.has(o.id) ? { ...o, rota_numero: r.id } : o
                                        )
                                      );
                                    }}
                                    className="text-xs cursor-pointer"
                                  >
                                    {r.isRetira ? "🏬 " : "🚚 "}
                                    {r.label}
                                  </DropdownMenuItem>
                                ))}
                                {order.rota_numero && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={async () => {
                                        for (const id of stop.allOrderIds) {
                                          await assignOrderToRoute(id, null);
                                        }
                                        toast.info("Demanda removida da rota.");
                                        const idSet = new Set(stop.allOrderIds);
                                        setAllOrders((prev) =>
                                          prev.map((o) =>
                                            idSet.has(o.id)
                                              ? { ...o, rota_numero: null, rota_sequencia: null }
                                              : o
                                          )
                                        );
                                      }}
                                      className="text-xs text-red-500 cursor-pointer"
                                    >
                                      Remover da Rota
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>

                          {/* 14. Ações: Desfazer Fusão / Fundir / Excluir */}
                          <TableCell className="text-center whitespace-nowrap py-1">
                            <div className="flex items-center justify-center gap-1">
                              {stop.isMerged ? (
                                order.rota_numero ? (
                                  <span title="Não é possível desfazer a fusão enquanto a entrega estiver atribuída a uma rota. Remova a rota antes de desfazer.">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled
                                      className="h-7 w-7 text-muted-foreground/30 cursor-not-allowed"
                                    >
                                      <Unlink className="h-3.5 w-3.5" />
                                    </Button>
                                  </span>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleUnmerge(stop.paradaAgrupadaId!)}
                                    className="h-7 w-7 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                                    title="Desfazer fusão (separar em entregas individuais)"
                                  >
                                    <Unlink className="h-3.5 w-3.5" />
                                  </Button>
                                )
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenMerge(order)}
                                  className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Fundir com outra O.S. deste cliente"
                                >
                                  <Layers className="h-3.5 w-3.5" />
                                </Button>
                              )}

                              {(order.tipo_entrega?.includes("demanda_manual") ||
                                order.tipo_entrega?.includes("coleta")) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setOrderToDelete(order)}
                                  className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/15 transition-colors"
                                  title="Excluir demanda da lista"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <MergeOrdersModal
        open={mergeModalOpen}
        onOpenChange={setMergeModalOpen}
        baseOrder={mergeBaseOrder}
        allOrders={allOrders}
        initialSelectedOrderIds={mergePreselectedIds}
        onSuccess={() => {
          setSelectedRowIds(new Set());
          void fetchOrders();
        }}
      />

      <AssignDriverModal
        order={selectedOrderForDriver}
        open={Boolean(selectedOrderForDriver)}
        onOpenChange={(open) => !open && setSelectedOrderForDriver(null)}
        onSuccess={() => {
          setSelectedOrderForDriver(null);
          void fetchOrders();
        }}
      />

      <DeliveryMonitoringModal
        open={showMonitoring}
        onOpenChange={setShowMonitoring}
        orders={allOrders}
        onOpenDriverManagement={() => setDriverManagementOpen(true)}
      />

      <DeliveryCompletedDetailsModal
        order={selectedDeliveredOrder}
        open={Boolean(selectedDeliveredOrder)}
        onOpenChange={(open) => !open && setSelectedDeliveredOrder(null)}
        driverName={
          selectedDeliveredOrder ? driverMap.get(selectedDeliveredOrder.entregador_id || "") : undefined
        }
        onReopenDelivery={() => {
          setSelectedDeliveredOrder(null);
          void fetchOrders();
        }}
      />

      <SharePointDiagnosticsModal
        open={diagnosticsOpen}
        onOpenChange={setDiagnosticsOpen}
      />

      <CreateDeliveryDemandModal
        open={createDemandOpen}
        onOpenChange={setCreateDemandOpen}
        onSuccess={fetchOrders}
        entregadores={entregadores}
      />

      <DriverManagementModal
        open={driverManagementOpen}
        onOpenChange={setDriverManagementOpen}
        onDriversUpdated={reloadEntregadores}
      />

      {/* DIÁLOGO DE CONFIRMAÇÃO DE EXCLUSÃO */}
      <AlertDialog
        open={Boolean(orderToDelete)}
        onOpenChange={(open) => !open && setOrderToDelete(null)}
      >
        <AlertDialogContent className="bg-card border-border shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Trash2 className="h-4 w-4 text-red-500" />
              Excluir da Programação de Entregas?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Tem certeza que deseja excluir{" "}
              {orderToDelete?.tipo_entrega?.includes("coleta")
                ? "a demanda de coleta"
                : orderToDelete?.tipo_entrega?.includes("demanda_manual")
                ? "a demanda de entrega"
                : "a O.S."}{" "}
              <strong className="text-foreground">
                {cleanOsNumber(orderToDelete?.titulo) || orderToDelete?.titulo?.replace(/^#+/, "")}
              </strong>{" "}
              ({orderToDelete?.cliente})? Esta ação removerá o item da lista de entregas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs" disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
            >
              {isDeleting ? "Excluindo..." : "Sim, Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
