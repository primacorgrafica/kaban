import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bike,
  Navigation,
  BatteryMedium,
  Gauge,
  Clock,
  Search,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Radio,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Entregador, OsrmRouteResult } from "@/types/delivery";
import type { Order } from "@/types/order";

interface DeliveryDriverSidebarProps {
  drivers: Entregador[];
  activeOrders: Order[];
  selectedDriverId: string | null;
  activeRoute: OsrmRouteResult | null;
  onSelectDriver: (driverId: string) => void;
  onFocusDriver: (driver: Entregador, order?: Order) => void;
}

export function DeliveryDriverSidebar({
  drivers,
  activeOrders,
  selectedDriverId,
  activeRoute,
  onSelectDriver,
  onFocusDriver,
}: DeliveryDriverSidebarProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const activeDrivers = drivers.filter((d) => d.ativo !== false);

  const filteredDrivers = activeDrivers.filter((d) => {
    const term = searchTerm.toLowerCase();
    const matchName = d.nome_completo.toLowerCase().includes(term);
    const matchPlate = (d.placa_veiculo || "").toLowerCase().includes(term);
    return matchName || matchPlate;
  });

  const countEmEntrega = activeDrivers.filter((d) => d.status === "em_entrega").length;
  const countDisponivel = activeDrivers.filter((d) => d.status === "disponivel").length;
  const countOffline = activeDrivers.filter((d) => !d.status || d.status === "offline").length;

  return (
    <aside className="w-full lg:w-96 flex flex-col h-full bg-slate-900/90 border border-border rounded-2xl overflow-hidden backdrop-blur-md shadow-xl shrink-0">
      {/* ─── CABEÇALHO DA FROTA ─── */}
      <div className="p-4 border-b border-border/80 space-y-3 bg-slate-950/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
            <h3 className="text-sm font-bold tracking-wide uppercase text-slate-100">
              Frota em Tempo Real
            </h3>
          </div>
          <Badge variant="outline" className="text-xs font-mono-tech border-slate-700 text-slate-300">
            {drivers.length} motoboys
          </Badge>
        </div>

        {/* Resumo de Status */}
        <div className="grid grid-cols-3 gap-2">
          <div className="px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center">
            <span className="text-[10px] uppercase font-bold text-emerald-400 block">Em Rota</span>
            <span className="text-sm font-extrabold text-emerald-300">{countEmEntrega}</span>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-center">
            <span className="text-[10px] uppercase font-bold text-blue-400 block">Disponível</span>
            <span className="text-sm font-extrabold text-blue-300">{countDisponivel}</span>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/60 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Offline</span>
            <span className="text-sm font-extrabold text-slate-400">{countOffline}</span>
          </div>
        </div>

        {/* Campo de Busca */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por entregador ou placa..."
            className="h-8 pl-8 text-xs bg-slate-950/60 border-slate-800"
          />
        </div>
      </div>

      {/* ─── LISTA DE CARDS DE ENTREGADORES ─── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 divide-y-0">
        {filteredDrivers.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            Nenhum entregador encontrado.
          </div>
        ) : (
          filteredDrivers.map((driver) => {
            const isSelected = selectedDriverId === driver.id;
            const assignedOrder = activeOrders.find(
              (o) => o.entregador_id === driver.user_id && o.status_entrega !== "entregue"
            );

            const lastSignal = driver.ultima_atividade
              ? formatDistanceToNow(new Date(driver.ultima_atividade), {
                  locale: ptBR,
                  addSuffix: true,
                })
              : "Sem sinal recente";

            const isOnline = driver.status !== "offline";

            return (
              <div
                key={driver.id}
                onClick={() => onSelectDriver(driver.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-slate-800/90 border-primary/60 shadow-md ring-1 ring-primary/40"
                    : "bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700"
                }`}
              >
                {/* Linha Superior: Nome, Veículo e Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        driver.status === "em_entrega"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : driver.status === "disponivel"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                          : "bg-slate-800 text-slate-500 border border-slate-700"
                      }`}
                    >
                      <Bike className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-100 truncate">
                        {driver.nome_completo}
                      </h4>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {driver.modelo_veiculo || "Motocicleta"} • {driver.placa_veiculo || "Sem placa"}
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase font-bold shrink-0 ${
                      driver.status === "em_entrega"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : driver.status === "disponivel"
                        ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                  >
                    {driver.status === "em_entrega"
                      ? "Em Rota"
                      : driver.status === "disponivel"
                      ? "Disponível"
                      : "Offline"}
                  </Badge>
                </div>

                {/* Telemetria Básica (Bateria, Velocidade, Última Atualização) */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400 font-mono-tech">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-slate-500" />
                    <span>{lastSignal}</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {driver.velocidade_kmh !== null && driver.velocidade_kmh !== undefined && (
                      <div className="flex items-center gap-1 text-slate-300">
                        <Gauge className="h-3 w-3 text-sky-400" />
                        <span>{Math.round(driver.velocidade_kmh)} km/h</span>
                      </div>
                    )}

                    {driver.bateria_percentual !== null && driver.bateria_percentual !== undefined && (
                      <div className="flex items-center gap-1 text-slate-300">
                        <BatteryMedium className="h-3 w-3 text-amber-400" />
                        <span>{driver.bateria_percentual}%</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bloco de Entrega Ativa */}
                {assignedOrder && (
                  <div className="mt-2.5 p-2 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-rose-400">O.S. {assignedOrder.numero_os}</span>
                      <span className="text-[11px] text-slate-300 truncate max-w-[140px]">
                        {assignedOrder.cliente_nome}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                      <MapPin className="h-3 w-3 text-slate-500 shrink-0" />
                      <span className="truncate">{assignedOrder.entrega_endereco || "Endereço não informado"}</span>
                    </div>

                    {/* Estimativas OSRM (Distância e ETA) */}
                    {isSelected && activeRoute && (
                      <div className="pt-1.5 flex items-center justify-between border-t border-slate-800 text-xs font-semibold text-sky-300">
                        <span>Restam {activeRoute.distanceKm} km</span>
                        <span>Chegada em ~{activeRoute.durationMinutes} min</span>
                      </div>
                    )}

                    {/* Botão de Foco no Mapa */}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFocusDriver(driver, assignedOrder);
                      }}
                      className="w-full h-6 text-[11px] font-semibold gap-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 rounded-md mt-1"
                    >
                      <Navigation className="h-3 w-3 text-sky-400" />
                      Focar Entrega no Mapa
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
