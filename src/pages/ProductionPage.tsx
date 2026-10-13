import { useState, useEffect } from "react";
import { useParams, useLocation, Navigate } from "react-router-dom";
import { useProductionOrders } from "@/hooks/useProductionOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useAddOrder } from "@/hooks/useAddOrder";
import { DEPARTMENTS, FATURAMENTO_DEPARTMENT, COMPRAS_DEPARTMENT, MANUTENCAO_DEPARTMENT, Department, DEPARTMENT_MAP } from "@/types/production";
import { ProductionKanbanBoard } from "@/components/ProductionKanbanBoard";
import { ArchivedOrders } from "@/components/ArchivedOrders";
import { Layout } from "@/components/Layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KanbanFiltersBar, KanbanFilters } from "@/components/KanbanFiltersBar";
import { Order } from "@/types/order";
import { startOfDay, endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const VALID_DEPARTMENTS: Department[] = ["desenvolvimento", "ctp", "digital", "offset", "acabamento", "terceiros", "faturamento", "compras", "manutencao", "qualidade"];

export default function ProductionPage() {
  const { departamento } = useParams<{ departamento: string }>();
  const location = useLocation();
  const { isAdmin } = useAuth();
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
    sendBackToPrePress,
    archiveOrder,
    unarchiveOrder,
    deleteOrder,
    getProfileName,
    getOrdersByDepartment,
    getArchivedByDepartment,
  } = useProductionOrders();

  const { addOrder } = useAddOrder();

  const [activeMachine, setActiveMachine] = useState<string | undefined>(undefined);
  const [fatFilters, setFatFilters] = useState<KanbanFilters>({
    statuses: [],
    vendedores: [],
    setores: [],
    dateFrom: undefined,
    dateTo: undefined,
  });

  const PATH_TO_DEPT: Record<string, Department> = {
    "/faturamento": "faturamento",
    "/compras": "compras",
    "/manutencao": "manutencao",
  };
  const activeDepartment: Department = PATH_TO_DEPT[location.pathname] || (departamento as Department) || "desenvolvimento";

  const currentDept = DEPARTMENT_MAP[activeDepartment];
  const isFaturamento = activeDepartment === "faturamento";
  const isManutencao = activeDepartment === "manutencao";
  const filteredOrders = VALID_DEPARTMENTS.includes(activeDepartment) ? getOrdersByDepartment(activeDepartment, activeMachine) : [];
  const isLoading = productionLoading;
  const faturamentoArchived = isFaturamento ? getArchivedByDepartment("faturamento") : [];

  // Fetch parent order sectors for faturamento alerts
  const [parentSectorMap, setParentSectorMap] = useState<Record<string, string | null>>({});
  const parentIdKey = filteredOrders.filter(o => o.parent_order_id).map(o => o.parent_order_id!).filter((v, i, a) => a.indexOf(v) === i).join(",");

  useEffect(() => {
    if (!isFaturamento) return;
    const parentIds = parentIdKey ? parentIdKey.split(",") : [];
    if (parentIds.length === 0) { setParentSectorMap({}); return; }

    const fetchParentSectors = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, setor")
        .in("id", parentIds);
      if (data) {
        const map: Record<string, string | null> = {};
        data.forEach((o: any) => { map[o.id] = o.setor; });
        setParentSectorMap(map);
      }
    };
    fetchParentSectors();

    const channel = supabase
      .channel("fat-parent-sector-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload: any) => {
        if (parentIds.includes(payload.new?.id)) {
          setParentSectorMap(prev => ({ ...prev, [payload.new.id]: payload.new.setor }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isFaturamento, parentIdKey]);

  if (!VALID_DEPARTMENTS.includes(activeDepartment)) {
    return <Navigate to="/producao/desenvolvimento" replace />;
  }

  const applyFatFilters = (list: Order[]) => {
    return list.filter((o) => {
      if (fatFilters.vendedores.length > 0 && (!o.vendedor || !fatFilters.vendedores.includes(o.vendedor))) return false;
      if (fatFilters.dateFrom && new Date(o.created_at) < startOfDay(fatFilters.dateFrom)) return false;
      if (fatFilters.dateTo && new Date(o.created_at) > endOfDay(fatFilters.dateTo)) return false;
      return true;
    });
  };

  const fatFilteredOrders = isFaturamento ? applyFatFilters(filteredOrders) : filteredOrders;
  const fatFilteredArchived = isFaturamento ? applyFatFilters(faturamentoArchived) : faturamentoArchived;

  const applyManutFilters = (list: Order[]) => {
    return list.filter((o) => {
      if (fatFilters.setoresManut && fatFilters.setoresManut.length > 0) {
        if (!(o as any).setor_manut || !fatFilters.setoresManut.includes((o as any).setor_manut)) return false;
      }
      if (fatFilters.categoriasManut && fatFilters.categoriasManut.length > 0) {
        if (!(o as any).categoria_manut || !fatFilters.categoriasManut.includes((o as any).categoria_manut)) return false;
      }
      return true;
    });
  };

  const manutFilteredOrders = isManutencao ? applyManutFilters(filteredOrders) : filteredOrders;

  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={addOrder}
      activeCount={0}
      archivedCount={0}
      sectorName={currentDept.label}
      countsLoading={isLoading}
      permissions={permissions}
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">Carregando dados...</div>
      ) : isFaturamento ? (
        <div className="flex flex-col min-h-full">
          <div className="px-4 pt-2 flex items-center gap-4">
            <KanbanFiltersBar filters={fatFilters} onChange={setFatFilters} showOnly={["vendedores"]} />
          </div>
          <div className="flex-1 min-h-0">
            <ProductionKanbanBoard
              department={currentDept}
              orders={fatFilteredOrders}
              onUpdate={updateOrder}
              onMove={moveInDepartment}
              onSendToDepartment={sendToDepartment}
              onSendBackToPrePress={canSendBack ? sendBackToPrePress : undefined}
              onArchive={archiveOrder}
              onDelete={deleteOrder}
              getProfileName={getProfileName}
              readOnly={readOnly}
              parentSectorMap={parentSectorMap}
            />
          </div>
        </div>
      ) : isManutencao ? (
        <div className="flex flex-col min-h-full">
          <div className="px-4 pt-2 flex items-center gap-4">
            <KanbanFiltersBar filters={fatFilters} onChange={setFatFilters} showOnly={["setoresManut", "categoriasManut"]} />
          </div>
          <div className="flex-1 min-h-0">
            <ProductionKanbanBoard
              department={currentDept}
              orders={manutFilteredOrders}
              onUpdate={updateOrder}
              onMove={moveInDepartment}
              onSendToDepartment={sendToDepartment}
              onSendBackToPrePress={canSendBack ? sendBackToPrePress : undefined}
              onArchive={archiveOrder}
              onDelete={deleteOrder}
              getProfileName={getProfileName}
              readOnly={readOnly}
            />
          </div>
        </div>
      ) : (
        <ProductionKanbanBoard
          department={currentDept}
          orders={filteredOrders}
          onUpdate={updateOrder}
          onMove={moveInDepartment}
          onSendToDepartment={sendToDepartment}
          onSendBackToPrePress={canSendBack ? sendBackToPrePress : undefined}
          onArchive={archiveOrder}
          onDelete={deleteOrder}
          getProfileName={getProfileName}
          readOnly={readOnly}
        />
      )}
    </Layout>
  );
}
