import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { getEntregadoresList } from "@/lib/deliveryService";
import type { Entregador, EntregadorPosicao, DeliveryStatus } from "@/types/delivery";
import { DELIVERY_STATUS_CONFIG } from "@/types/delivery";
import type { Order } from "@/types/order";
import {
  Bike,
  MapPin,
  ExternalLink,
  BatteryCharging,
  BatteryMedium,
  BatteryLow,
  Clock,
  RefreshCw,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Radio,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface DeliveryMonitoringModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: Order[];
}

export function DeliveryMonitoringModal({
  open,
  onOpenChange,
  orders,
}: DeliveryMonitoringModalProps) {
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [posicoes, setPosicoes] = useState<EntregadorPosicao[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"frota" | "rotas" | "telemetria">("frota");

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Carrega motoboys cadastrados
      const driversRes = await getEntregadoresList();
      if (driversRes.data) {
        setEntregadores(driversRes.data);
      }

      // 2. Carrega as últimas 50 posições de telemetria
      const { data: posData, error: posError } = await supabase
        .from("entregador_posicoes" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!posError && posData) {
        setPosicoes(posData as unknown as EntregadorPosicao[]);
      }
    } catch (err) {
      console.warn("[DeliveryMonitoring] Falha ao carregar telemetria:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    void loadData();

    // Inscrição Realtime para novas posições de GPS
    const channel = supabase
      .channel("delivery-monitoring-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "entregador_posicoes" },
        (payload) => {
          if (payload.new) {
            setPosicoes((prev) => [payload.new as EntregadorPosicao, ...prev.slice(0, 49)]);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open]);

  // Mapeia último checkpoint por motoboy
  const lastPositionByDriver = useMemo(() => {
    const map = new Map<string, EntregadorPosicao>();
    posicoes.forEach((pos) => {
      if (!map.has(pos.entregador_id)) {
        map.set(pos.entregador_id, pos);
      }
    });
    return map;
  }, [posicoes]);

  // Agrupamento de entregas por motoboy
  const driverStats = useMemo(() => {
    const stats = new Map<
      string,
      { total: number; pendente: number; emRota: number; entregue: number; insucesso: number }
    >();

    orders.forEach((o) => {
      if (!o.entregador_id) return;
      const current = stats.get(o.entregador_id) || {
        total: 0,
        pendente: 0,
        emRota: 0,
        entregue: 0,
        insucesso: 0,
      };
      current.total++;
      const st = o.status_entrega || "pendente";
      if (st === "atribuido" || st === "pendente") current.pendente++;
      else if (st === "em_rota" || st === "no_local") current.emRota++;
      else if (st === "entregue") current.entregue++;
      else if (st === "insucesso") current.insucesso++;
      stats.set(o.entregador_id, current);
    });

    return stats;
  }, [orders]);

  // Filtra ordens ativas para a aba de rotas
  const activeDeliveries = useMemo(() => {
    return orders
      .filter((o) => o.entregador_id && o.status_entrega !== "entregue")
      .sort((a, b) => {
        // Ordena por ordem de parada se existir
        if (a.ordem_parada && b.ordem_parada) return a.ordem_parada - b.ordem_parada;
        if (a.ordem_parada && !b.ordem_parada) return -1;
        if (!a.ordem_parada && b.ordem_parada) return 1;
        return (a.status_entrega || "").localeCompare(b.status_entrega || "");
      });
  }, [orders]);

  // Dicionário id -> nome
  const driverMap = useMemo(() => {
    const map = new Map<string, Entregador>();
    entregadores.forEach((d) => map.set(d.user_id, d));
    return map;
  }, [entregadores]);

  const renderBatteryIcon = (pct: number | null) => {
    if (pct === null || pct === undefined) return null;
    if (pct >= 60) return <BatteryCharging className="h-4 w-4 text-emerald-400 inline mr-1" />;
    if (pct >= 25) return <BatteryMedium className="h-4 w-4 text-amber-400 inline mr-1" />;
    return <BatteryLow className="h-4 w-4 text-red-400 inline mr-1" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col bg-card border-border overflow-hidden p-0 gap-0">
        <DialogHeader className="p-4 pb-3 border-b border-border bg-muted/20 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary animate-pulse" />
            <DialogTitle className="text-lg font-bold text-foreground">
              Monitoramento & Telemetria de Entregas
            </DialogTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-1.5 h-8 text-xs mr-6"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Atualizar
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col p-4 gap-4">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as any)}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="grid grid-cols-3 max-w-md bg-muted">
              <TabsTrigger value="frota" className="text-xs">
                Frota & Status ({entregadores.length})
              </TabsTrigger>
              <TabsTrigger value="rotas" className="text-xs">
                Em Andamento ({activeDeliveries.length})
              </TabsTrigger>
              <TabsTrigger value="telemetria" className="text-xs">
                Checkpoints GPS ({posicoes.length})
              </TabsTrigger>
            </TabsList>

            {/* ABA 1: Frota & Motoboys */}
            <TabsContent value="frota" className="flex-1 overflow-auto mt-3">
              {entregadores.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum entregador cadastrado no sistema.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {entregadores.map((d) => {
                    const st = driverStats.get(d.user_id) || {
                      total: 0,
                      pendente: 0,
                      emRota: 0,
                      entregue: 0,
                      insucesso: 0,
                    };
                    const lastPos = lastPositionByDriver.get(d.user_id);

                    return (
                      <div
                        key={d.id}
                        className={cn(
                          "p-3 rounded-lg border bg-background/50 flex flex-col gap-2 transition-colors",
                          !d.ativo && "opacity-60 bg-muted/10 border-dashed"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-full bg-primary/10 text-primary">
                              <Bike className="h-4 w-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-foreground leading-tight">
                                {d.nome_completo}
                              </h4>
                              <p className="text-[11px] text-muted-foreground">
                                {d.placa_veiculo ? `${d.placa_veiculo} • ` : ""}
                                {d.modelo_veiculo || "Veículo não especificado"}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0",
                              d.ativo
                                ? "bg-emerald-950/40 text-emerald-300 border-emerald-800"
                                : "bg-zinc-800 text-zinc-400 border-zinc-700"
                            )}
                          >
                            {d.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>

                        {/* Metricas de entregas de hoje */}
                        <div className="grid grid-cols-4 gap-1 py-1.5 px-2 rounded bg-muted/30 text-center text-xs">
                          <div>
                            <span className="block text-[10px] text-muted-foreground">Fila</span>
                            <span className="font-semibold text-foreground">{st.pendente}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-amber-400">Em Rota</span>
                            <span className="font-semibold text-amber-300">{st.emRota}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-emerald-400">Entregues</span>
                            <span className="font-semibold text-emerald-300">{st.entregue}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-red-400">Falhas</span>
                            <span className="font-semibold text-red-300">{st.insucesso}</span>
                          </div>
                        </div>

                        {/* Ultima posição GPS conhecida */}
                        {lastPos ? (
                          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/50 text-muted-foreground">
                            <div className="flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 text-primary shrink-0" />
                              <span className="truncate">
                                {format(parseISO(lastPos.created_at), "HH:mm:ss", { locale: ptBR })}
                              </span>
                              {lastPos.bateria_percentual !== null && (
                                <span className="ml-1 flex items-center">
                                  {renderBatteryIcon(lastPos.bateria_percentual)}
                                  {lastPos.bateria_percentual}%
                                </span>
                              )}
                              {lastPos.velocidade_kmh !== null && lastPos.velocidade_kmh > 0 && (
                                <span className="ml-1 text-[10px] font-mono">
                                  {Math.round(lastPos.velocidade_kmh)} km/h
                                </span>
                              )}
                            </div>
                            <a
                              href={`https://www.google.com/maps?q=${lastPos.latitude},${lastPos.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline flex items-center gap-0.5 text-[11px] shrink-0 font-medium ml-2"
                            >
                              Ver Mapa <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </div>
                        ) : (
                          <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50 italic">
                            Nenhum sinal GPS registrado hoje
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ABA 2: Entregas em Andamento */}
            <TabsContent value="rotas" className="flex-1 overflow-auto mt-3">
              {activeDeliveries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nenhuma entrega ativa em trânsito no momento.
                </div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-[50px]">Parada</TableHead>
                        <TableHead className="w-[80px]">OS</TableHead>
                        <TableHead className="w-[140px]">Cliente</TableHead>
                        <TableHead className="w-[120px]">Entregador</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                        <TableHead className="min-w-[180px]">Endereço</TableHead>
                        <TableHead className="w-[70px] text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeDeliveries.map((order) => {
                        const driver = order.entregador_id ? driverMap.get(order.entregador_id) : null;
                        const statusConfig =
                          DELIVERY_STATUS_CONFIG[
                            (order.status_entrega || "pendente") as DeliveryStatus
                          ] || DELIVERY_STATUS_CONFIG.pendente;

                        return (
                          <TableRow key={order.id} className="hover:bg-muted/30">
                            <TableCell className="font-semibold text-center text-primary">
                              {order.ordem_parada ? `#${order.ordem_parada}` : "—"}
                            </TableCell>
                            <TableCell className="font-medium">{order.titulo}</TableCell>
                            <TableCell className="truncate max-w-[140px]" title={order.cliente}>
                              {order.cliente}
                            </TableCell>
                            <TableCell className="truncate max-w-[120px]">
                              {driver?.nome_completo || "Não atribuído"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] px-1.5 py-0 font-normal", statusConfig.badgeClass)}
                              >
                                {statusConfig.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="truncate max-w-[200px]" title={order.entrega_endereco || ""}>
                              {order.entrega_endereco || "Sem endereço cadastrado"}
                            </TableCell>
                            <TableCell className="text-right">
                              {order.entrega_endereco ? (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                    order.entrega_endereco
                                  )}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-[11px]"
                                >
                                  <Navigation className="h-3.5 w-3.5" />
                                </a>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ABA 3: Telemetria e Checkpoints */}
            <TabsContent value="telemetria" className="flex-1 overflow-auto mt-3">
              {posicoes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum checkpoint de GPS recebido. Os checkpoints são gerados automaticamente quando o entregador atualiza o status pelo aplicativo mobile.
                </div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-[120px]">Horário</TableHead>
                        <TableHead className="w-[140px]">Entregador</TableHead>
                        <TableHead className="w-[130px]">Coordenadas</TableHead>
                        <TableHead className="w-[80px]">Precisão</TableHead>
                        <TableHead className="w-[80px]">Bateria</TableHead>
                        <TableHead className="w-[80px] text-right">Mapa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {posicoes.map((pos) => {
                        const driver = driverMap.get(pos.entregador_id);
                        return (
                          <TableRow key={pos.id} className="hover:bg-muted/30">
                            <TableCell className="font-mono text-[11px]">
                              {format(parseISO(pos.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                            </TableCell>
                            <TableCell className="font-medium">
                              {driver?.nome_completo || pos.entregador_id.slice(0, 8)}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-foreground">
                              {pos.latitude.toFixed(5)}, {pos.longitude.toFixed(5)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {pos.precisao_metros ? `±${Math.round(pos.precisao_metros)}m` : "—"}
                            </TableCell>
                            <TableCell>
                              {pos.bateria_percentual !== null ? (
                                <span className="flex items-center text-[11px]">
                                  {renderBatteryIcon(pos.bateria_percentual)}
                                  {pos.bateria_percentual}%
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <a
                                href={`https://www.google.com/maps?q=${pos.latitude},${pos.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1 text-[11px] font-medium"
                              >
                                Abrir <ExternalLink className="h-3 w-3" />
                              </a>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
