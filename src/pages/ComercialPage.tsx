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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  AlertTriangle,
  List,
  TrendingUp,
  BarChart3,
  Layers,
  Sparkles,
} from "lucide-react";
import { startOfDay, startOfWeek, startOfMonth, format } from "date-fns";
import { KanbanFiltersBar, KanbanFilters } from "@/components/KanbanFiltersBar";
import { cn } from "@/lib/utils";
import { useCrm } from "@/hooks/useCrm";
import { CrmKanbanBoard } from "@/components/crm/CrmKanbanBoard";
import { CreateOpportunityDialog } from "@/components/crm/CreateOpportunityDialog";
import { OpportunitySlideOver } from "@/components/crm/OpportunitySlideOver";
import { CrmMetricsView } from "@/components/crm/CrmMetricsView";
import { CrmAlertsBanner } from "@/components/crm/CrmAlertsBanner";
import { ConvertToOrderDialog } from "@/components/crm/ConvertToOrderDialog";
import { CrmOpportunity, CrmProposal, isFollowUpLate, isFollowUpToday, isProposalExpiringSoon } from "@/types/crm";
import { differenceInDays } from "date-fns";
import { toast } from "sonner";

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
  const { orders, activeOrders, archivedOrders, addOrder } = useOrders();

  // Módulo de Funil de Vendas CRM
  const {
    stages,
    opportunities,
    loading: crmLoading,
    createOpportunity,
    updateOpportunity,
    moveOpportunityStage,
    markAsWon,
    markAsLost,
    deleteOpportunity,
    archiveOpportunity,
    searchKnownClients,
  } = useCrm();

  const [activeTab, setActiveTab] = useState<"funil" | "acompanhamento" | "indicadores">("funil");
  const [selectedOpportunity, setSelectedOpportunity] = useState<CrmOpportunity | null>(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [createOppDialogOpen, setCreateOppDialogOpen] = useState(false);
  const [defaultStageForCreate, setDefaultStageForCreate] = useState<string | undefined>(undefined);

  // Pedidos para o acompanhamento operacional de OS
  const allOrders = useMemo(() => {
    return orders.filter(o => !o.arquivado);
  }, [orders]);

  const prodOrders = useMemo(() => {
    return orders.filter(o => !o.arquivado && Boolean(o.setor));
  }, [orders]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<KanbanFilters>({
    statuses: [],
    vendedores: [],
    setores: [],
    dateFrom: undefined,
    dateTo: undefined,
  });

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

  const filteredProd = useMemo(() => applyFiltersOnly(prodOrders), [prodOrders, filters]);
  const filteredAll = useMemo(() => applyFiltersOnly(allOrders), [allOrders, filters]);

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

  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [oppToConvert, setOppToConvert] = useState<{
    opportunity: CrmOpportunity;
    proposal?: CrmProposal | null;
  } | null>(null);

  const [alertFilter, setAlertFilter] = useState<
    "todos" | "atrasados" | "hoje" | "vencendo" | "estagnadas"
  >("todos");

  // Manipulação de Oportunidades do CRM
  const handleSelectOpportunity = (opp: CrmOpportunity) => {
    setSelectedOpportunity(opp);
    setSlideOverOpen(true);
  };

  const handleNewOpportunity = (defaultStageId?: string) => {
    setDefaultStageForCreate(defaultStageId);
    setCreateOppDialogOpen(true);
  };

  // Abre modal de conversão segura em OS
  const handleOpenConvertToOrder = (
    opp: CrmOpportunity,
    proposal?: CrmProposal | null
  ) => {
    setOppToConvert({ opportunity: opp, proposal });
    setConvertModalOpen(true);
  };

  // Filtro de oportunidades baseado nos alertas rápidos
  const displayedOpportunities = useMemo(() => {
    if (alertFilter === "todos") return opportunities;

    const now = new Date();
    return opportunities.filter((o) => {
      if (o.status !== "aberta") return false;
      if (alertFilter === "atrasados") {
        return isFollowUpLate(o.proxima_acao_data);
      }
      if (alertFilter === "hoje") {
        return isFollowUpToday(o.proxima_acao_data);
      }
      if (alertFilter === "estagnadas") {
        const lastDate = o.data_ultimo_contato || o.updated_at || o.created_at;
        return differenceInDays(now, new Date(lastDate)) >= 5;
      }
      return true;
    });
  }, [opportunities, alertFilter]);

  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={addOrder}
      activeCount={(activeOrders || []).length}
      archivedCount={(archivedOrders || []).length}
      sectorName="Comercial"
      permissions={permissions}
    >
      <div className="flex flex-col h-full overflow-hidden p-4 space-y-4">
        {/* Navegação por Abas do Módulo Comercial */}
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5 shrink-0 flex-wrap gap-2">
          <Tabs
            value={activeTab}
            onValueChange={(val: any) => setActiveTab(val)}
            className="w-auto"
          >
            <TabsList className="bg-muted/50 p-1 rounded-xl border border-border/60">
              <TabsTrigger
                value="funil"
                className="gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Funil de Vendas (CRM)</span>
                <Badge
                  variant="secondary"
                  className="ml-1 text-[10px] font-mono-tech px-1.5 py-0"
                >
                  {opportunities.length}
                </Badge>
              </TabsTrigger>

              <TabsTrigger
                value="acompanhamento"
                className="gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <List className="h-3.5 w-3.5" />
                <span>Acompanhamento de OS</span>
                <Badge
                  variant="secondary"
                  className="ml-1 text-[10px] font-mono-tech px-1.5 py-0"
                >
                  {osEmProducao}
                </Badge>
              </TabsTrigger>

              <TabsTrigger
                value="indicadores"
                className="gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Indicadores & BI</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <span className="text-xs text-muted-foreground font-mono-tech hidden sm:block">
            Módulo Comercial Integrado • Primacor Gráfica
          </span>
        </div>

        {/* CONTEÚDO DA ABA 1: FUNIL DE VENDAS CRM */}
        {activeTab === "funil" && (
          <div className="flex-1 min-h-0 flex flex-col space-y-3">
            {/* Banner de Lembretes e Alertas Convencionais (Sem IA) */}
            <CrmAlertsBanner
              opportunities={opportunities}
              activeFilter={alertFilter}
              onFilterChange={setAlertFilter}
            />

            <div className="flex-1 min-h-0">
              <CrmKanbanBoard
                stages={stages}
                opportunities={displayedOpportunities}
                onMoveStage={moveOpportunityStage}
                onSelectOpportunity={handleSelectOpportunity}
                onNewOpportunity={handleNewOpportunity}
                onMarkWon={markAsWon}
                onMarkLost={(opp) => markAsLost(opp.id, "Perda rápida")}
                onArchiveOpportunity={archiveOpportunity}
                onDeleteOpportunity={(opp) => deleteOpportunity(opp.id)}
              />
            </div>
          </div>
        )}

        {/* CONTEÚDO DA ABA 2: ACOMPANHAMENTO OPERACIONAL DE OS (PRESERVADO INTEGRALMENTE) */}
        {activeTab === "acompanhamento" && (
          <div className="flex-1 overflow-auto space-y-6">
            {/* Filtros */}
            <div className="flex items-center gap-4">
              <KanbanFiltersBar filters={filters} onChange={setFilters} showOnly={["vendedores", "statuses"]} />
            </div>

            {/* KPIs Operacionais */}
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
        )}

        {/* CONTEÚDO DA ABA 3: INDICADORES & BI COMERCIAL */}
        {activeTab === "indicadores" && (
          <div className="flex-1 overflow-auto">
            <CrmMetricsView opportunities={opportunities} stages={stages} />
          </div>
        )}
      </div>

      {/* Gaveta Lateral de Detalhes da Oportunidade */}
      <OpportunitySlideOver
        opportunity={selectedOpportunity}
        open={slideOverOpen}
        onOpenChange={setSlideOverOpen}
        stages={stages}
        onUpdate={updateOpportunity}
        onConvertToOrder={handleOpenConvertToOrder}
        onMarkWon={markAsWon}
        onMarkLost={markAsLost}
        onArchive={archiveOpportunity}
        onDelete={deleteOpportunity}
      />

      {/* Modal de Nova Oportunidade */}
      <CreateOpportunityDialog
        open={createOppDialogOpen}
        onOpenChange={setCreateOppDialogOpen}
        stages={stages}
        defaultStageId={defaultStageForCreate}
        onSave={createOpportunity}
        onSearchClients={searchKnownClients}
      />

      {/* Modal de Conversão Segura em Ordem de Produção */}
      <ConvertToOrderDialog
        open={convertModalOpen}
        onOpenChange={setConvertModalOpen}
        opportunity={oppToConvert?.opportunity || null}
        proposal={oppToConvert?.proposal || null}
        onSuccess={() => {
          setSlideOverOpen(false);
        }}
      />
    </Layout>
  );
}
