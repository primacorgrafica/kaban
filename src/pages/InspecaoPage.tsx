import { useCallback } from "react";
import { useProductionOrders } from "@/hooks/useProductionOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useOrders } from "@/hooks/useOrders";
import { INSPECAO_DEPARTMENT } from "@/types/production";
import { ProductionKanbanBoard } from "@/components/ProductionKanbanBoard";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function InspecaoPage() {
  const { user } = useAuth();
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

  const orders = getOrdersByDepartment("inspecao");
  const isLoading = productionLoading || ordersLoading;

  const handleSendBackToPrePress = useCallback(async (id: string) => {
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
      toast.success("O.S. devolvida para Pré-Impressão");
    }
  }, [user]);

  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={addOrder}
      activeCount={activeOrders.length}
      archivedCount={archivedOrders.length}
      sectorName="Inspeção"
      countsLoading={isLoading}
      permissions={permissions}
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">Carregando dados da Inspeção...</div>
      ) : (
        <ProductionKanbanBoard
          department={INSPECAO_DEPARTMENT}
          orders={orders}
          onUpdate={updateOrder}
          onMove={moveInDepartment}
          onSendToDepartment={sendToDepartment}
          onSendBackToPrePress={canSendBack ? handleSendBackToPrePress : undefined}
          onArchive={archiveOrder}
          onDelete={deleteOrder}
          getProfileName={getProfileName}
          readOnly={readOnly}
        />
      )}
    </Layout>
  );
}
