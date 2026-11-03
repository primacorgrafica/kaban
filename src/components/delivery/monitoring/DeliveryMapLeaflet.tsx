import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createDriverLeafletIcon, createCustomerLeafletIcon } from "./DeliveryMapMarkers";
import type { Entregador, OsrmRouteResult } from "@/types/delivery";
import type { Order } from "@/types/order";

interface DeliveryMapLeafletProps {
  drivers: Entregador[];
  activeOrders: Order[];
  selectedDriverId: string | null;
  activeRoute: OsrmRouteResult | null;
  onSelectDriver: (driverId: string) => void;
}

export function DeliveryMapLeaflet({
  drivers,
  activeOrders,
  selectedDriverId,
  activeRoute,
  onSelectDriver,
}: DeliveryMapLeafletProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const driverMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const customerMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const routePolylineRef = useRef<L.Polyline | null>(null);

  // 1. Inicialização do Mapa Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Centro inicial: Região Metropolitana de Belo Horizonte / Primacor
    const map = L.map(mapContainerRef.current, {
      center: [-19.9167, -43.9345],
      zoom: 12,
      zoomControl: true,
    });

    // Tiles oficiais gratuitos do OpenStreetMap
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Atualização reativa de marcadores dos entregadores (sem recriar o mapa)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentMarkers = driverMarkersRef.current;
    const activeDriverIds = new Set<string>();

    drivers.forEach((driver) => {
      if (driver.latitude && driver.longitude) {
        activeDriverIds.add(driver.id);
        const latLng: L.LatLngExpression = [driver.latitude, driver.longitude];
        const icon = createDriverLeafletIcon(driver.nome_completo, driver.status || "disponivel");

        if (currentMarkers.has(driver.id)) {
          // Atualiza suavemente a posição existente
          const marker = currentMarkers.get(driver.id)!;
          marker.setLatLng(latLng);
          marker.setIcon(icon);
        } else {
          // Cria novo marcador com popup
          const marker = L.marker(latLng, { icon }).addTo(map);
          marker.on("click", () => onSelectDriver(driver.id));
          marker.bindPopup(`
            <div class="text-xs p-1">
              <strong class="font-bold text-slate-900">${driver.nome_completo}</strong><br/>
              <span class="text-slate-600">Veículo: ${driver.modelo_veiculo || "Moto"} (${driver.placa_veiculo || "S/ Placa"})</span><br/>
              <span class="text-emerald-700 font-semibold">Status: ${driver.status === "em_entrega" ? "Em Entrega" : "Disponível"}</span>
            </div>
          `);
          currentMarkers.set(driver.id, marker);
        }
      }
    });

    // Remove marcadores de entregadores desconectados
    currentMarkers.forEach((marker, id) => {
      if (!activeDriverIds.has(id)) {
        marker.remove();
        currentMarkers.delete(id);
      }
    });
  }, [drivers, onSelectDriver]);

  // 3. Atualização de marcadores dos clientes das O.S. ativas
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentCustMarkers = customerMarkersRef.current;
    const activeOrderIds = new Set<string>();

    activeOrders.forEach((order) => {
      if (order.destino_latitude && order.destino_longitude) {
        activeOrderIds.add(order.id);
        const latLng: L.LatLngExpression = [order.destino_latitude, order.destino_longitude];
        const icon = createCustomerLeafletIcon(order.numero_os || "O.S.");

        if (currentCustMarkers.has(order.id)) {
          const marker = currentCustMarkers.get(order.id)!;
          marker.setLatLng(latLng);
        } else {
          const marker = L.marker(latLng, { icon }).addTo(map);
          marker.bindPopup(`
            <div class="text-xs p-1">
              <strong class="font-bold text-rose-700">O.S. ${order.numero_os}</strong><br/>
              <span class="font-semibold text-slate-800">${order.cliente_nome || "Cliente"}</span><br/>
              <span class="text-slate-600 text-[11px]">${order.entrega_endereco || "Endereço cadastrado"}</span>
            </div>
          `);
          currentCustMarkers.set(order.id, marker);
        }
      }
    });

    currentCustMarkers.forEach((marker, id) => {
      if (!activeOrderIds.has(id)) {
        marker.remove();
        currentCustMarkers.delete(id);
      }
    });
  }, [activeOrders]);

  // 4. Renderização do traçado de rota OSRM
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }

    if (activeRoute && activeRoute.geometry.length > 0) {
      const polyline = L.polyline(activeRoute.geometry, {
        color: "#0284c7",
        weight: 5,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
        dashArray: undefined,
      }).addTo(map);

      routePolylineRef.current = polyline;

      // Enquadra a rota inteira na visão com padding
      try {
        map.fitBounds(polyline.getBounds(), {
          padding: [60, 60],
          maxZoom: 16,
          animate: true,
        });
      } catch {
        // Silencioso caso bounds sejam nulos
      }
    }
  }, [activeRoute]);

  // 5. Efeito de centralização ao selecionar um entregador
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedDriverId) return;

    const driver = drivers.find((d) => d.id === selectedDriverId);
    if (driver?.latitude && driver?.longitude) {
      map.flyTo([driver.latitude, driver.longitude], 15, {
        duration: 1.2,
      });
    }
  }, [selectedDriverId, drivers]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-border shadow-inner bg-slate-950">
      <div ref={mapContainerRef} className="w-full h-full z-0" />
    </div>
  );
}
