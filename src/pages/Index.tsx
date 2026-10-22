import { useState, useEffect } from "react";
import { useOrders } from "@/hooks/useOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ProductionTable } from "@/components/ProductionTable";
import { useLocation, Navigate } from "react-router-dom";
import { ArchivedOrders } from "@/components/ArchivedOrders";
import { Dashboard } from "@/components/Dashboard";
import { KanbanFiltersBar, KanbanFilters } from "@/components/KanbanFiltersBar";
import { Order } from "@/types/order";
import { startOfDay, endOfDay } from "date-fns";
import { useSlowOrderAlerts } from "@/hooks/useSlowOrderAlerts";
import { LayoutGrid, TableProperties } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const perms = usePermissions();
  const {
    orders,
    activeOrders,
    archivedOrders,
    loading,
    searchQuery,
    setSearchQuery,
    addOrder,
    duplicateOrder,
    updateOrder,
    moveOrder,
    archiveOrder,
    unarchiveOrder,
    deleteOrder,
    sendToProduction,
    sendToMultipleProduction,
    sendToExpedicao,
    sendToCompras,
    getProfileName,
  } = useOrders();

  const { canAccessSector, setorVinculado } = useAuth();
  const location = useLocation();
  const isDashboard = location.pathname === "/dashboard";
  const isArchived = location.pathname === "/arquivados";

  // Se o usuário tem um setor vinculado que não é pré-impressão e tenta acessar a raiz "/",
  // redireciona para a página do seu respectivo setor
  if (location.pathname === "/" && !canAccessSector("pre_impressao") && setorVinculado) {
    return <Navigate to={`/producao/${setorVinculado}`} replace />;
  }

  const [viewMode, setViewMode] = useState<"kanban" | "table">(() => {
    return (localStorage.getItem("primacor_view_mode") as "kanban" | "table") || "kanban";
  });

  const handleSetViewMode = (mode: "kanban" | "table") => {
    setViewMode(mode);
    localStorage.setItem("primacor_view_mode", mode);
  };

  const [filters, setFilters] = useState<KanbanFilters>({
    statuses: [],
    vendedores: [],
    setores: [],
    dateFrom: undefined,
    dateTo: undefined,
  });

  const applyFilters = (list: Order[]) => {
    return list.filter((o) => {
      if (filters.statuses.length > 0 && !filters.statuses.includes(o.status)) return false;
      if (filters.vendedores.length > 0 && (!o.vendedor || !filters.vendedores.includes(o.vendedor))) return false;
      if (filters.setores.length > 0) {
        const orderSetor = o.setor || "__pre_impressao__";
        if (!filters.setores.includes(orderSetor)) return false;
      }
      if (filters.dateFrom && new Date(o.created_at) < startOfDay(filters.dateFrom)) return false;
      if (filters.dateTo && new Date(o.created_at) > endOfDay(filters.dateTo)) return false;
      return true;
    });
  };

  const filteredActive = applyFilters(activeOrders);
  const slowAlertIds = useSlowOrderAlerts(activeOrders);

  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={addOrder}
      activeCount={activeOrders.length}
      archivedCount={archivedOrders.length}
      sectorName={isDashboard ? "Dashboard" : isArchived ? "Trabalhos Concluídos" : "Pré-Impressão"}
      countsLoading={loading}
      permissions={perms}
    >
      {loading ? (
        <div className="flex items-center justify-center h-full text-muted-foreground font-mono-tech">
          <div className="flex flex-col items-center gap-2">
            <span className="w-6 h-6 border-2 border-[#9BA8AB] border-t-transparent rounded-full animate-spin" />
            <span>Carregando O.S. Primacor...</span>
          </div>
        </div>
      ) : isDashboard && perms.canAccessDashboard ? (
        <Dashboard orders={orders} archivedCount={archivedOrders.length} />
      ) : isDashboard ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">Sem permissão para acessar o Dashboard.</div>
      ) : isArchived && perms.canArchive ? (
        <ArchivedOrders
          orders={archivedOrders}
          onUnarchive={unarchiveOrder}
          onDelete={deleteOrder}
        />
      ) : isArchived ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">Sem permissão para acessar os Trabalhos Concluídos.</div>
      ) : (
        <div className="flex flex-col min-h-full gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <KanbanFiltersBar filters={filters} onChange={setFilters} />
            <div className="flex items-center bg-card/85 dark:bg-[#11212D]/85 backdrop-blur-xl p-1 rounded-xl border border-border/80 dark:border-[#4A5C6A]/35 shrink-0 shadow-xs">
              <Button
                variant={viewMode === "kanban" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleSetViewMode("kanban")}
                className={`h-7 px-2.5 text-xs rounded-lg transition-all ${
                  viewMode === "kanban"
                    ? "bg-[#253745] text-[#CCD0CF] font-bold border border-[#4A5C6A]/60 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Visualização em Quadro Kanban"
              >
                <LayoutGrid className="h-3.5 w-3.5 mr-1.5" /> Quadro
              </Button>
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleSetViewMode("table")}
                className={`h-7 px-2.5 text-xs rounded-lg transition-all ${
                  viewMode === "table"
                    ? "bg-[#253745] text-[#CCD0CF] font-bold border border-[#4A5C6A]/60 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Visualização em Tabela / Lista de Produção"
              >
                <TableProperties className="h-3.5 w-3.5 mr-1.5" /> Tabela
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {viewMode === "kanban" ? (
              <KanbanBoard
                orders={filteredActive}
                onUpdate={updateOrder}
                onMove={moveOrder}
                onArchive={archiveOrder}
                onDelete={deleteOrder}
                onDuplicate={duplicateOrder}
                onSendToProduction={sendToProduction}
                onSendToMultipleProduction={sendToMultipleProduction}
                onSendToExpedicao={sendToExpedicao}
                onSendToCompras={sendToCompras}
                getProfileName={getProfileName}
                permissions={perms}
                departmentContext="pre_impressao"
                slowAlertIds={slowAlertIds}
              />
            ) : (
              <ProductionTable
                orders={filteredActive}
                onUpdate={updateOrder}
                onMove={moveOrder}
                onArchive={archiveOrder}
                onDelete={deleteOrder}
                onDuplicate={duplicateOrder}
                onSendToProduction={sendToProduction}
                onSendToExpedicao={sendToExpedicao}
                getProfileName={getProfileName}
                permissions={perms}
                departmentContext="pre_impressao"
                slowAlertIds={slowAlertIds}
              />
            )}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Index;
