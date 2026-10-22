import { useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/components/Dashboard";
import { useOrders } from "@/hooks/useOrders";
import { usePermissions } from "@/hooks/usePermissions";

export default function DashboardPage() {
  const { orders, archivedOrders, loading } = useOrders();
  const permissions = usePermissions();

  return (
    <Layout
      sectorName="Dashboard"
      permissions={permissions}
      searchQuery=""
      onSearchChange={() => {}}
      onAddOrder={() => {}}
      activeCount={orders.filter((o) => !o.arquivado).length}
      archivedCount={archivedOrders.length}
      countsLoading={loading}
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-slate-400 font-mono-tech">
          <span className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Carregando painel administrador...</span>
        </div>
      ) : permissions.canAccessDashboard ? (
        <Dashboard orders={orders} archivedCount={archivedOrders.length} />
      ) : (
        <div className="flex items-center justify-center min-h-[50vh] text-slate-400 text-sm">
          Sem permissão para acessar o Painel Administrador.
        </div>
      )}
    </Layout>
  );
}
