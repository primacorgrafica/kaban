import { useCallback, useState, useEffect, useMemo } from "react";
import { useProductionOrders } from "@/hooks/useProductionOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useOrders } from "@/hooks/useOrders";
import { EXPEDICAO_DEPARTMENT } from "@/types/production";
import { ProductionKanbanBoard } from "@/components/ProductionKanbanBoard";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ExpedicaoPage() {
  const { user, authReady } = useAuth();
  const permissions = usePermissions();
  const canSendBack = permissions.role === "admin" || permissions.role === "coordenador";
  const readOnly = permissions.isViewOnly;

  const {
    searchQuery,
    setSearchQuery,
    loading: productionLoading,
    updateOrder,
    moveInDepartment,
    sendToDepartment,
    archiveOrder,
    deleteOrder,
    getProfileName,
    getOrdersByDepartment,
  } = useProductionOrders();

  const {
    activeOrders,
    archivedOrders,
    loading: ordersLoading,
    addOrder,
  } = useOrders();

  const orders = getOrdersByDepartment("expedicao");
  const isLoading = productionLoading || ordersLoading;

  // Fetch faturamento orders in "pendencia" status to flag in Expedição
  const [fatPendenciaParentIds, setFatPendenciaParentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      setFatPendenciaParentIds(new Set());
      return;
    }

    const fetchFatPendencia = async () => {
      const { data } = await supabase
        .from("orders")
        .select("parent_order_id")
        .eq("setor", "faturamento")
        .eq("setor_status", "pendencia")
        .not("parent_order_id", "is", null);
      if (data) {
        setFatPendenciaParentIds(new Set(data.map(d => d.parent_order_id!)));
      }
    };
    void fetchFatPendencia();

    const channel = supabase
      .channel("fat-pendencia-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: "setor=eq.faturamento" }, () => {
        void fetchFatPendencia();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [authReady, user]);

  const handleSendBackToPrePress = useCallback(async (id: string) => {
    const order = orders.find(o => o.id === id);
    if (order?.parent_order_id) {
      const { data: deletedRows, error } = await supabase.from("orders").delete().eq("id", id).select("id");
      if (error || !deletedRows || deletedRows.length === 0) {
        toast.error("Erro ao remover cópia da Expedição (permissão RLS no Supabase)");
      } else {
        setOrders(prev => prev.filter(o => o.id !== id));
        toast.success("Cópia removida — OS. original permanece em Produzindo Prova");
      }
    } else {
      const { error } = await supabase.from("orders").update({
        setor: null,
        setor_status: "entrada",
        maquina: null,
        status: "aguardando_prova",
        posicao: 9999,
        atualizado_por: user?.id || null,
      }).eq("id", id);
      if (error) {
        toast.error("Erro ao devolver para Pré-Impressão");
      } else {
        toast.success("OS. devolvida para Produzindo Prova");
      }
    }
  }, [orders, user]);

  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={addOrder}
      activeCount={activeOrders.length}
      archivedCount={archivedOrders.length}
      sectorName="Expedição"
      countsLoading={isLoading}
      permissions={permissions}
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">Carregando dados...</div>
      ) : (
        <ProductionKanbanBoard
          department={EXPEDICAO_DEPARTMENT}
          orders={orders}
          onUpdate={updateOrder}
          onMove={moveInDepartment}
          onSendToDepartment={sendToDepartment}
          onSendBackToPrePress={canSendBack ? handleSendBackToPrePress : undefined}
          onArchive={archiveOrder}
          onDelete={deleteOrder}
          getProfileName={getProfileName}
          readOnly={readOnly}
          faturamentoPendenciaIds={fatPendenciaParentIds}
        />
      )}
    </Layout>
  );
}
