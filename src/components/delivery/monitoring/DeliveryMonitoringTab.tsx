import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEntregadoresList } from "@/lib/deliveryService";
import { DeliveryMapLeaflet } from "./DeliveryMapLeaflet";
import { DeliveryDriverSidebar } from "./DeliveryDriverSidebar";
import { geocodeAddressWithNominatim } from "@/services/nominatimService";
import { fetchOsrmRoute } from "@/services/osrmService";
import type { Entregador, OsrmRouteResult } from "@/types/delivery";
import type { Order } from "@/types/order";
import { Button } from "@/components/ui/button";
import { Radio, RefreshCw, AlertTriangle, ShieldCheck, MapPin } from "lucide-react";
import { toast } from "sonner";

interface DeliveryMonitoringTabProps {
  initialOrders?: Order[];
  className?: string;
}

export function DeliveryMonitoringTab({
  initialOrders,
  className = "",
}: DeliveryMonitoringTabProps) {
  const [drivers, setDrivers] = useState<Entregador[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [activeRoute, setActiveRoute] = useState<OsrmRouteResult | null>(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<"conectado" | "reconectando" | "offline">("conectado");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // 1. Carrega lista inicial de motoristas/entregadores
  const loadDrivers = useCallback(async () => {
    setLoadingDrivers(true);
    try {
      const res = await getEntregadoresList();
      if (res.data) {
        setDrivers(res.data);
      }
    } catch (err) {
      console.error("[DeliveryMonitoringTab] Erro ao carregar motoristas:", err);
    } finally {
      setLoadingDrivers(false);
      setLastRefreshedAt(new Date());
    }
  }, []);

  // 2. Carrega ordens ativas em rota ou prontas para entrega
  const loadActiveOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      if (initialOrders && initialOrders.length > 0) {
        // Filtra ordens ativas logísticas que não estejam arquivadas ou entregues
        const filtered = initialOrders.filter(
          (o) => !o.arquivado && o.status_entrega !== "entregue"
        );
        setActiveOrders(filtered);
      } else {
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .eq("arquivado", false)
          .neq("status_entrega", "entregue")
          .order("updated_at", { ascending: false });

        if (!error && data) {
          setActiveOrders(data as unknown as Order[]);
        }
      }
    } catch (err) {
      console.warn("[DeliveryMonitoringTab] Falha ao carregar ordens de entrega:", err);
    } finally {
      setLoadingOrders(false);
    }
  }, [initialOrders]);

  // Carregamento inicial
  useEffect(() => {
    void loadDrivers();
    void loadActiveOrders();
  }, [loadDrivers, loadActiveOrders]);

  // 3. Geocodificação automática das ordens ativas sem latitude/longitude via Nominatim
  useEffect(() => {
    if (activeOrders.length === 0) return;

    let isMounted = true;
    const ordersNeedingGeocode = activeOrders.filter(
      (o) =>
        (!o.destino_latitude || !o.destino_longitude) &&
        o.entrega_endereco &&
        o.entrega_endereco.trim().length > 5
    );

    if (ordersNeedingGeocode.length === 0) return;

    const processGeocoding = async () => {
      for (const order of ordersNeedingGeocode) {
        if (!isMounted) break;
        try {
          const coords = await geocodeAddressWithNominatim(order.entrega_endereco!);
          if (coords && isMounted) {
            setActiveOrders((prev) =>
              prev.map((o) =>
                o.id === order.id
                  ? {
                      ...o,
                      destino_latitude: coords.latitude,
                      destino_longitude: coords.longitude,
                      geocoding_status: "geocodificado",
                    }
                  : o
              )
            );

            // Tenta persistir no Supabase para economizar chamadas futuras (silencioso em caso de RLS)
            void supabase
              .from("orders")
              .update({
                destino_latitude: coords.latitude,
                destino_longitude: coords.longitude,
                geocoding_status: "geocodificado",
                geocoding_address_cached: order.entrega_endereco,
              } as any)
              .eq("id", order.id)
              .catch(() => {});
          }
        } catch {
          // Continua para a próxima ordem
        }
      }
    };

    void processGeocoding();

    return () => {
      isMounted = false;
    };
  }, [activeOrders]);

  // 4. Supabase Realtime Subscription para telemetria de entregadores
  useEffect(() => {
    const channel = supabase
      .channel("realtime-entregadores-telemetria")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entregadores",
        },
        (payload) => {
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            const updated = payload.new as Entregador;
            setDrivers((prev) => {
              const idx = prev.findIndex((d) => d.id === updated.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], ...updated };
                return next;
              }
              return [...prev, updated];
            });
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as any).id;
            setDrivers((prev) => prev.filter((d) => d.id !== deletedId));
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("conectado");
        } else if (status === "CLOSED" || status === "TIMED_OUT") {
          setRealtimeStatus("offline");
        } else {
          setRealtimeStatus("reconectando");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // 5. Motorista selecionado e ordem correspondente
  const selectedDriver = useMemo(() => {
    return drivers.find((d) => d.id === selectedDriverId) || null;
  }, [drivers, selectedDriverId]);

  const selectedDriverOrder = useMemo(() => {
    if (!selectedDriver) return null;
    return (
      activeOrders.find(
        (o) =>
          o.entregador_id === selectedDriver.user_id ||
          o.entregador_id === selectedDriver.id
      ) || null
    );
  }, [activeOrders, selectedDriver]);

  // 6. Cálculo da Rota OSRM entre motorista selecionado e o cliente de destino
  useEffect(() => {
    if (
      !selectedDriver?.latitude ||
      !selectedDriver?.longitude ||
      !selectedDriverOrder?.destino_latitude ||
      !selectedDriverOrder?.destino_longitude
    ) {
      setActiveRoute(null);
      return;
    }

    let isMounted = true;
    setCalculatingRoute(true);

    const origin: [number, number] = [selectedDriver.longitude, selectedDriver.latitude];
    const destination: [number, number] = [
      selectedDriverOrder.destino_longitude,
      selectedDriverOrder.destino_latitude,
    ];

    fetchOsrmRoute(origin, destination)
      .then((routeResult) => {
        if (isMounted) {
          setActiveRoute(routeResult);
        }
      })
      .catch((err) => {
        console.warn("[DeliveryMonitoringTab] Falha no traçado OSRM:", err);
      })
      .finally(() => {
        if (isMounted) {
          setCalculatingRoute(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    selectedDriver?.latitude,
    selectedDriver?.longitude,
    selectedDriverOrder?.destino_latitude,
    selectedDriverOrder?.destino_longitude,
  ]);

  const handleSelectDriver = (driverId: string) => {
    setSelectedDriverId(driverId);
  };

  const handleFocusDriver = (driver: Entregador, order?: Order) => {
    setSelectedDriverId(driver.id);
    if (!driver.latitude || !driver.longitude) {
      toast.info(`${driver.nome_completo} não transmitiu coordenadas GPS ainda.`);
    }
  };

  return (
    <div className={`flex flex-col h-full w-full gap-3 ${className}`}>
      {/* ─── TOPO DE TELEMETRIA E CONTROLES ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-900/80 border border-border/80 rounded-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <Radio className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 uppercase tracking-wide">
              MONITORAMENTO
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {calculatingRoute && (
            <span className="text-xs text-sky-400 flex items-center gap-1.5 animate-pulse font-medium">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Calculando trajeto OSRM...
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void loadDrivers();
              void loadActiveOrders();
            }}
            disabled={loadingDrivers || loadingOrders}
            className="gap-2 h-8 text-xs border-slate-700 hover:bg-slate-800 text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingDrivers ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* ─── ÁREA PRINCIPAL SPLIT: SIDEBAR DA FROTA + MAPA LEAFLET ─── */}
      <div className="flex flex-col lg:flex-row flex-1 gap-3 min-h-[550px] h-[calc(100vh-210px)]">
        {/* Painel Lateral com lista dos entregadores */}
        <DeliveryDriverSidebar
          drivers={drivers}
          activeOrders={activeOrders}
          selectedDriverId={selectedDriverId}
          activeRoute={activeRoute}
          onSelectDriver={handleSelectDriver}
          onFocusDriver={handleFocusDriver}
        />

        {/* Mapa Leaflet interativo */}
        <div className="flex-1 h-full min-h-[400px]">
          <DeliveryMapLeaflet
            drivers={drivers}
            activeOrders={activeOrders}
            selectedDriverId={selectedDriverId}
            activeRoute={activeRoute}
            onSelectDriver={handleSelectDriver}
          />
        </div>
      </div>
    </div>
  );
}
