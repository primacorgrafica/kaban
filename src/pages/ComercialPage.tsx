import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrders } from "@/hooks/useOrders";
import { Order } from "@/types/order";
import { DEPARTMENT_MAP, DepartmentConfig } from "@/types/production";
import { STATUS_CONFIG, STATUS_ORDER } from "@/types/order";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, CalendarDays, CalendarRange, CalendarClock, AlertTriangle, List } from "lucide-react";
import { startOfDay, startOfWeek, startOfMonth, format } from "date-fns";
import { KanbanFiltersBar, KanbanFilters } from "@/components/KanbanFiltersBar";

const PRE_IMPRESSAO_DEPT: DepartmentConfig = {
  id: "pre_impressao" as any,
  label: "Pré-Impressão",
  statuses: STATUS_ORDER.map(s => ({
    id: s,
    label: STATUS_CONFIG[s].label,
    colorKey: STATUS_CONFIG[s].colorKey,
  })),
};

export default function ComercialPage() {
  const permissions = usePermissions();
  const { activeOrders, archivedOrders, addOrder } = useOrders();

  const [prodOrders, setProdOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<KanbanFilters>({
    statuses: [],
    vendedores: [],
    setores: [],
    dateFrom: undefined,
    dateTo: undefined,
  });

  useEffect(() => {
    const fetchProd = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .not("setor", "is", null)
        .eq("arquivado", false);
      if (data) setProdOrders(data as Order[]);
    };
    fetchProd();
    const ch = supabase
      .channel("comercial-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => fetchProd())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    const fetchAll = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("arquivado", false);
      if (data) setAllOrders(data as Order[]);
    };
    fetchAll();
    const ch = supabase
      .channel("comercial-all-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const applyFiltersOnly = (list: Order[]) => {
    return list.filter(o => {
      if (filters.vendedores.length > 0 && (!o.vendedor || !filters.vendedores.includes(o.vendedor))) return false;
      if (filters.statuses.length > 0) {
        const orderStatus = o.setor ? (o.setor_status || "entrada") : o.status;
        if (!(filters.statuses as string[]).includes(orderStatus)) return false;
      }
      return true;
    });
  };

  const applySearch = (list: Order[]) => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(o =>
      o.titulo.toLowerCase().includes(q) ||
      o.cliente.toLowerCase().includes(q) ||
      (o.descricao && o.descricao.toLowerCase().includes(q))
    );
  };

  // Filter-only (for KPIs and Pendências)
  const filteredProd = useMemo(() => applyFiltersOnly(prodOrders), [prodOrders, filters]);
  const filteredAll = useMemo(() => applyFiltersOnly(allOrders), [allOrders, filters]);

  // Filter + search (for OS por Setor and Lista Geral)
  const searchedProd = useMemo(() => applySearch(filteredProd), [filteredProd, searchQuery]);
  const searchedAll = useMemo(() => applySearch(filteredAll), [filteredAll, searchQuery]);

  const preImpressaoOrders = useMemo(() => {
    return applySearch(applyFiltersOnly(allOrders.filter(o => !o.setor)));
  }, [allOrders, filters, searchQuery]);

  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  const PRODUCTION_SECTORS = ["desenvolvimento", "ctp", "offset", "digital", "acabamento", "terceiros", "expedicao"];
  // Exclude sub-orders ("OS com carimbo" — cópias para outros setores)
  const filteredAllParents = useMemo(() => filteredAll.filter(o => !o.parent_order_id), [filteredAll]);
  const filteredProdParents = useMemo(() => filteredProd.filter(o => !o.parent_order_id), [filteredProd]);

  const osEmProducao = useMemo(() => {
    const preImpressao = filteredAllParents.filter(o => !o.setor);
    const inSectors = filteredProdParents.filter(o => o.setor && PRODUCTION_SECTORS.includes(o.setor));
    const allProduction = [...preImpressao, ...inSectors];
    const uniqueTitulos = new Set(allProduction.map(o => o.titulo));
    return uniqueTitulos.size;
  }, [filteredAllParents, filteredProdParents]);
  const osHoje = filteredAllParents.filter(o => new Date(o.created_at) >= todayStart).length;
  const osSemana = filteredAllParents.filter(o => new Date(o.created_at) >= weekStart).length;
  const osMes = filteredAllParents.filter(o => new Date(o.created_at) >= monthStart).length;

  const ordersBySector = useMemo(() => {
    const map: Record<string, Order[]> = {};
    searchedProd.forEach(o => {
      if (o.setor) {
        if (!map[o.setor]) map[o.setor] = [];
        map[o.setor].push(o);
      }
    });
    return map;
  }, [searchedProd]);

  const pendencias = useMemo(() => {
    return filteredProd.filter(o => o.setor === "faturamento" && o.setor_status === "pendencia");
  }, [filteredProd]);

  const kpis = [
    { label: "OS em Produção", value: osEmProducao, icon: ClipboardList, color: "text-blue-500" },
    { label: "OS Emitidas Hoje", value: osHoje, icon: CalendarDays, color: "text-green-500" },
    { label: "OS Emitidas na Semana", value: osSemana, icon: CalendarRange, color: "text-amber-500" },
    { label: "OS Emitidas no Mês", value: osMes, icon: CalendarClock, color: "text-purple-500" },
  ];

  const SECTOR_ORDER = ["desenvolvimento", "ctp", "offset", "digital", "acabamento", "terceiros", "expedicao"];
  const EXCLUDED_SECTORS = ["faturamento", "compras", "manutencao", "qualidade"];

  const displayDepts: { dept: DepartmentConfig; orders: Order[]; statusField: "setor_status" | "status" }[] = useMemo(() => {
    const result: { dept: DepartmentConfig; orders: Order[]; statusField: "setor_status" | "status" }[] = [];
    result.push({ dept: PRE_IMPRESSAO_DEPT, orders: preImpressaoOrders, statusField: "status" });
    SECTOR_ORDER.forEach(sectorId => {
      const dept = DEPARTMENT_MAP[sectorId as keyof typeof DEPARTMENT_MAP];
      if (!dept) return;
      const deptOrders = ordersBySector[dept.id] || [];
      result.push({ dept, orders: deptOrders, statusField: "setor_status" });
    });
    return result;
  }, [preImpressaoOrders, ordersBySector]);

  // General OS list sorted by titulo ascending
  const GENERAL_EXCLUDED_SECTORS = ["faturamento", "compras", "manutencao", "qualidade"];
  const generalOsList = useMemo(() => {
    return [...searchedAll].filter(o => !o.setor || !GENERAL_EXCLUDED_SECTORS.includes(o.setor)).sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR", { numeric: true }));
  }, [searchedAll]);

  const getSetorLabel = (order: Order) => {
    if (!order.setor) return "Pré-Impressão";
    const dept = DEPARTMENT_MAP[order.setor];
    return dept ? dept.label : order.setor;
  };

  const getEtapaLabel = (order: Order) => {
    if (!order.setor) {
      const cfg = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG];
      return cfg ? cfg.label : order.status;
    }
    const dept = DEPARTMENT_MAP[order.setor];
    if (dept) {
      const st = dept.statuses.find(s => s.id === order.setor_status);
      return st ? st.label : order.setor_status || "Entrada";
    }
    return order.setor_status || "Entrada";
  };

  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={addOrder}
      activeCount={activeOrders.length}
      archivedCount={archivedOrders.length}
      sectorName="Comercial"
      permissions={permissions}
    >
      <div className="p-4 space-y-6 overflow-auto h-full">
        {/* Filtros */}
        <div className="flex items-center gap-4">
          <KanbanFiltersBar filters={filters} onChange={setFilters} showOnly={["vendedores", "statuses"]} />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map(kpi => (
            <Card key={kpi.label} className="border-border/50">
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`p-3 rounded-xl bg-muted ${kpi.color}`}>
                  <kpi.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pendências Faturamento */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Pendências — Faturamento
              <Badge variant="destructive" className="ml-1">{pendencias.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendencias.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma OS com pendência no momento.</p>
            ) : (
              <div className="max-h-[300px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b border-border text-left">
                      <th className="py-2 px-2 font-medium text-muted-foreground">OS</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground">Cliente</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground">Descrição</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground">Entrega</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground text-right">Pendências</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendencias.map(o => {
                      const items: string[] = [];
                      if (o.fat_cnpj_pendente) items.push("CNPJ");
                      if (o.fat_retencao_iss_pendente) items.push("ISS");
                      if (o.fat_retencoes_federais_pendente) items.push("Federais");
                      if (o.fat_limite_emissao_pendente) items.push("Limite");
                      if (o.fat_envio_nf_pendente) items.push("Envio NF");
                      if (o.fat_ocpp_pendente) items.push("OC/PP");
                      if (o.fat_restricao_credito_pendente) items.push("Crédito");

                      return (
                        <tr key={o.id} className="border-b border-border/50 hover:bg-muted/50">
                          <td className="py-1.5 px-2 font-medium text-foreground whitespace-nowrap">{o.titulo}</td>
                          <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{o.cliente}</td>
                          <td className="py-1.5 px-2 text-muted-foreground truncate max-w-[200px]">{o.descricao}</td>
                          <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">
                            {o.entrega_data_limite ? format(new Date(o.entrega_data_limite), "dd/MM/yyyy") : "—"}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            <div className="flex gap-1 flex-wrap justify-end">
                              {items.map(it => (
                                <Badge key={it} variant="destructive" className="text-[10px] px-1.5 py-0">{it}</Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* OS por Setor — em colunas */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">OS por Setor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {displayDepts.map(({ dept, orders: deptOrders, statusField }) => {
                const statusCounts: Record<string, number> = {};
                deptOrders.forEach(o => {
                  const st = (statusField === "status" ? o.status : o.setor_status) || "entrada";
                  statusCounts[st] = (statusCounts[st] || 0) + 1;
                });

                return (
                  <div key={dept.id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground">{dept.label}</span>
                      <Badge variant="secondary" className="text-xs">{deptOrders.length}</Badge>
                    </div>
                    <div className="space-y-1">
                      {dept.statuses.map(st => {
                        const count = statusCounts[st.id] || 0;
                        if (count === 0) return null;
                        return (
                          <div key={st.id} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{st.label}</span>
                            <span className="font-medium text-foreground">{count}</span>
                          </div>
                        );
                      })}
                      {deptOrders.length === 0 && (
                        <p className="text-xs text-muted-foreground">Nenhuma OS</p>
                      )}
                    </div>
                  </div>
                );
              })}

            </div>
          </CardContent>
        </Card>

        {/* Lista Geral de OS */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <List className="h-4 w-4" />
              Lista Geral de OS
              <Badge variant="secondary" className="ml-1">{generalOsList.length}</Badge>
              <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground ml-2">
                <span className="inline-block w-3 h-3 rounded-sm bg-yellow-400" />
                + de 1 dia aguardando aprovação
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border text-left">
                    <th className="py-2 px-2 font-medium text-muted-foreground">OS</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground">Cliente</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground">Descrição</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground">Setor</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground">Etapa</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground">Atualização</th>
                  </tr>
                </thead>
                <tbody>
                  {generalOsList.map(o => (
                    <tr key={o.id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="py-1.5 px-2 font-medium text-foreground">{o.titulo}</td>
                      <td className="py-1.5 px-2 text-muted-foreground">{o.cliente}</td>
                      <td className="py-1.5 px-2 text-muted-foreground truncate max-w-[200px]">{o.descricao}</td>
                      <td className="py-1.5 px-2">
                        <Badge variant="outline" className="text-xs">{getSetorLabel(o)}</Badge>
                      </td>
                      <td className="py-1.5 px-2">
                        {(() => {
                          const isAguardandoAprovacao = (!o.setor && o.status === "aguardando_aprovacao");
                          const over1Day = isAguardandoAprovacao && (Date.now() - new Date(o.updated_at).getTime() > 24 * 60 * 60 * 1000);
                          return (
                            <Badge
                              variant="secondary"
                              className={`text-xs ${over1Day ? "bg-yellow-400 text-yellow-900 hover:bg-yellow-400" : ""}`}
                            >
                              {getEtapaLabel(o)}
                            </Badge>
                          );
                        })()}
                      </td>
                      <td className="py-1.5 px-2 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(o.updated_at), "dd/MM/yyyy HH:mm")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
