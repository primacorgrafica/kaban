import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrders } from "@/hooks/useOrders";
import { supabase } from "@/integrations/supabase/client";
import { DeliveryRoutesBoard } from "@/components/delivery/routes/DeliveryRoutesBoard";
import { getEntregadoresList } from "@/lib/deliveryService";
import type { Entregador } from "@/types/delivery";
import type { Order } from "@/types/order";
import { Layers } from "lucide-react";

export default function RotasPage() {
  const { user, authReady } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();
  const { activeOrders, archivedOrders, loading: ordersLoading } = useOrders();

  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const reloadEntregadores = useCallback(() => {
    void getEntregadoresList().then((res) => {
      if (res.data) setEntregadores(res.data);
    });
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("arquivado", false)
      .order("updated_at", { ascending: false });

    if (data) {
      const filtered = (data as unknown as Order[]).filter((order) => {
        const o = order as any;
        if (o.om_numero || o.oc_numero || o.nc_numero) return false;
        if (order.setor === "faturamento") return false;
        if (order.setor === "qualidade" || order.setor === "ctp" || order.setor === "digital") return false;
        const isProof =
          order.titulo?.toUpperCase().startsWith("P") ||
          order.tipo_entrega?.includes("prova_digital") ||
          Boolean(o.is_prova_entrega);
        if (order.parent_order_id && order.setor === "expedicao" && !isProof) return false;
        return true;
      });
      setAllOrders(filtered);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    reloadEntregadores();
    void fetchOrders();

    const channel = supabase
      .channel("expedicao-rotas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void fetchOrders();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "entregadores" }, () => {
        reloadEntregadores();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authReady, user, fetchOrders, reloadEntregadores]);

  const driverMap = useMemo(() => {
    const map = new Map<string, string>();
    entregadores.forEach((e) => {
      const fullName = `${e.nome_completo}${e.sobrenome ? ` ${e.sobrenome}` : ""}`.trim();
      if (e.user_id) map.set(e.user_id, fullName);
      map.set(e.id, fullName);
    });
    return map;
  }, [entregadores]);

  const displayedOrders = useMemo(() => {
    if (!searchQuery.trim()) return allOrders;
    const q = searchQuery.toLowerCase();
    return allOrders.filter(
      (o) =>
        o.titulo.toLowerCase().includes(q) ||
        o.cliente.toLowerCase().includes(q) ||
        o.descricao.toLowerCase().includes(q) ||
        (o.entrega_endereco || "").toLowerCase().includes(q)
    );
  }, [allOrders, searchQuery]);

  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={() => {}}
      activeCount={activeOrders.length}
      archivedCount={archivedOrders.length}
      sectorName="Expedição · Rotas"
      countsLoading={ordersLoading}
      permissions={permissions}
    >
      <div className="flex flex-col h-full gap-3 p-2 sm:p-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/15 text-primary border border-primary/30">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">
              Rotas de Entrega
            </h1>
            <p className="text-xs text-muted-foreground">
              Distribuição nas Rotas 1 a 6 e Retira, sequência de paradas e vinculação de entregadores.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Carregando rotas...
          </div>
        ) : (
          <div className="flex-1 min-h-[500px] h-[calc(100vh-175px)]">
            <DeliveryRoutesBoard
              orders={displayedOrders}
              entregadores={entregadores}
              driverMap={driverMap}
              onRefresh={fetchOrders}
              onOpenDriverManagement={() => navigate("/expedicao/entregadores")}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}
