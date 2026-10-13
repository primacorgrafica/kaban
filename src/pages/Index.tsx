import { useState } from "react";
import { useOrders } from "@/hooks/useOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { Layout } from "@/components/Layout";
import { KanbanBoard } from "@/components/KanbanBoard";
import { useLocation } from "react-router-dom";
import { ArchivedOrders } from "@/components/ArchivedOrders";
import { Dashboard } from "@/components/Dashboard";
import { KanbanFiltersBar, KanbanFilters } from "@/components/KanbanFiltersBar";
import { Order } from "@/types/order";
import { startOfDay, endOfDay } from "date-fns";
import { useSlowOrderAlerts } from "@/hooks/useSlowOrderAlerts";

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
    getProfileName,
  } = useOrders();

  const location = useLocation();
  const isDashboard = location.pathname === "/dashboard";
  const isArchived = location.pathname === "/arquivados";

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
        <div className="flex items-center justify-center h-full text-muted-foreground">Carregando dados...</div>
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
        <div className="flex flex-col h-full gap-3">
          <KanbanFiltersBar filters={filters} onChange={setFilters} />
          <div className="flex-1 overflow-hidden">
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
              getProfileName={getProfileName}
               permissions={perms}
               departmentContext="pre_impressao"
               slowAlertIds={slowAlertIds}
            />
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Index;
