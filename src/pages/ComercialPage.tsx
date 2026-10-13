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
import { cn } from "@/lib/utils";

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
    {
      label: "OS em Produção",
      value: osEmProducao,
      icon: ClipboardList,
      color: "text-blue-600 dark:text-blue-400",
      bgBadge: "bg-blue-50 dark:bg-blue-500/10 border-blue-200/60 dark:border-blue-500/20",
      accentBar: "bg-blue-500",
    },
    {
      label: "OS Emitidas Hoje",
      value: osHoje,
      icon: CalendarDays,
      color: "text-emerald-600 dark:text-emerald-400",
      bgBadge: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20",
      accentBar: "bg-emerald-500",
    },
    {
      label: "OS Emitidas na Semana",
      value: osSemana,
      icon: CalendarRange,
      color: "text-amber-600 dark:text-amber-400",
      bgBadge: "bg-amber-50 dark:bg-amber-500/10 border-amber-200/60 dark:border-amber-500/20",
      accentBar: "bg-amber-500",
    },
    {
      label: "OS Emitidas no Mês",
      value: osMes,
      icon: CalendarClock,
      color: "text-purple-600 dark:text-purple-400",
      bgBadge: "bg-purple-50 dark:bg-purple-500/10 border-purple-200/60 dark:border-purple-500/20",
      accentBar: "bg-purple-500",
    },
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
            <Card key={kpi.label} className="border-border bg-card shadow-xs relative overflow-hidden group hover:border-primary/40 transition-all">
              <CardContent className="flex items-center gap-4 p-4.5">
                <div className={cn("p-3 rounded-2xl border flex items-center justify-center shrink-0", kpi.bgBadge, kpi.color)}>
                  <kpi.icon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">{kpi.label}</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono-tech mt-0.5">{kpi.value}</p>
                </div>
              </CardContent>
              <div className={cn("absolute bottom-0 left-0 right-0 h-1 opacity-70", kpi.accentBar)} />
            </Card>
          ))}
        </div>

        {/* Pendências Faturamento */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2 text-foreground">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <span>Pendências — Faturamento</span>
              <Badge variant="destructive" className="ml-1 text-[11px] font-mono-tech font-bold">{pendencias.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {pendencias.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nenhuma OS com pendência no momento.</p>
            ) : (
              <div className="max-h-[300px] overflow-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur-md z-10">
                    <tr className="border-b border-border text-left">
                      <th className="py-2.5 px-3 font-semibold text-xs text-foreground uppercase tracking-wider">OS</th>
                      <th className="py-2.5 px-3 font-semibold text-xs text-foreground uppercase tracking-wider">Cliente</th>
                      <th className="py-2.5 px-3 font-semibold text-xs text-foreground uppercase tracking-wider">Descrição</th>
                      <th className="py-2.5 px-3 font-semibold text-xs text-foreground uppercase tracking-wider">Entrega</th>
                      <th className="py-2.5 px-3 font-semibold text-xs text-foreground uppercase tracking-wider text-right">Pendências</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 bg-card">
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
                        <tr key={o.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-2 px-3 font-bold text-foreground whitespace-nowrap font-mono-tech text-xs">{o.titulo}</td>
                          <td className="py-2 px-3 text-foreground font-medium whitespace-nowrap">{o.cliente}</td>
                          <td className="py-2 px-3 text-muted-foreground truncate max-w-[200px]">{o.descricao}</td>
                          <td className="py-2 px-3 text-muted-foreground whitespace-nowrap font-mono-tech text-xs">
                            {o.entrega_data_limite ? format(new Date(o.entrega_data_limite), "dd/MM/yyyy") : "—"}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex gap-1 flex-wrap justify-end">
                              {items.map(it => (
                                <Badge key={it} variant="destructive" className="text-[10px] px-1.5 py-0 font-bold">{it}</Badge>
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
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base font-semibold text-foreground">OS por Setor</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
              {displayDepts.map(({ dept, orders: deptOrders, statusField }) => {
                const statusCounts: Record<string, number> = {};
                deptOrders.forEach(o => {
                  const st = (statusField === "status" ? o.status : o.setor_status) || "entrada";
                  statusCounts[st] = (statusCounts[st] || 0) + 1;
                });

                return (
                  <div
                    key={dept.id}
                    className="border border-border/80 bg-slate-50/80 dark:bg-slate-900/50 rounded-xl p-3.5 space-y-2.5 shadow-2xs hover:border-primary/40 transition-all"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-border/60">
                      <span className="font-bold text-sm text-foreground">{dept.label}</span>
                      <Badge variant="secondary" className="text-xs font-mono-tech font-bold">{deptOrders.length}</Badge>
                    </div>
                    <div className="space-y-1.5">
                      {dept.statuses.map(st => {
                        const count = statusCounts[st.id] || 0;
                        if (count === 0) return null;
                        return (
                          <div key={st.id} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-muted-foreground font-medium">{st.label}</span>
                            <span className="font-bold text-foreground font-mono-tech">{count}</span>
                          </div>
                        );
                      })}
                      {deptOrders.length === 0 && (
                        <p className="text-xs text-muted-foreground/75 italic py-1">Nenhuma OS</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Lista Geral de OS */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground flex-wrap">
              <div className="flex items-center gap-2">
                <List className="h-4 w-4 text-primary" />
                <span>Lista Geral de OS</span>
                <Badge variant="secondary" className="ml-1 font-mono-tech font-bold">{generalOsList.length}</Badge>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground ml-auto bg-muted/60 px-2.5 py-1 rounded-lg border border-border/60">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 shadow-2xs" />
                + de 1 dia aguardando aprovação
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur-md z-10">
                  <tr className="border-b border-border text-left">
                    <th className="py-2.5 px-3 font-semibold text-xs text-foreground uppercase tracking-wider">OS</th>
                    <th className="py-2.5 px-3 font-semibold text-xs text-foreground uppercase tracking-wider">Cliente</th>
                    <th className="py-2.5 px-3 font-semibold text-xs text-foreground uppercase tracking-wider">Descrição</th>
                    <th className="py-2.5 px-3 font-semibold text-xs text-foreground uppercase tracking-wider">Setor</th>
                    <th className="py-2.5 px-3 font-semibold text-xs text-foreground uppercase tracking-wider">Etapa</th>
                    <th className="py-2.5 px-3 font-semibold text-xs text-foreground uppercase tracking-wider">Atualização</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 bg-card">
                  {generalOsList.map(o => (
                    <tr key={o.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-2 px-3 font-bold text-foreground font-mono-tech text-xs">{o.titulo}</td>
                      <td className="py-2 px-3 text-foreground font-medium">{o.cliente}</td>
                      <td className="py-2 px-3 text-muted-foreground truncate max-w-[240px]">{o.descricao || "—"}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-xs font-medium border-border/80 bg-muted/40 text-foreground">{getSetorLabel(o)}</Badge>
                      </td>
                      <td className="py-2 px-3">
                        {(() => {
                          const isAguardandoAprovacao = (!o.setor && o.status === "aguardando_aprovacao");
                          const over1Day = isAguardandoAprovacao && (Date.now() - new Date(o.updated_at).getTime() > 24 * 60 * 60 * 1000);
                          return (
                            <Badge
                              variant="secondary"
                              className={`text-xs font-medium ${over1Day ? "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-yellow-400 dark:text-yellow-900" : ""}`}
                            >
                              {getEtapaLabel(o)}
                            </Badge>
                          );
                        })()}
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground font-mono-tech whitespace-nowrap">
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
