import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ClipboardList, Clock, Timer, ArrowRight, Calendar, BarChart3, TrendingUp, Send, CheckCircle2 } from "lucide-react";
import { businessHoursMs } from "@/lib/businessHours";
import { formatDuration } from "@/hooks/useOrderAnalytics";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface StatusHistoryRow {
  id: string;
  order_id: string;
  status_anterior: string | null;
  status_novo: string;
  created_at: string;
}

interface OrderRow {
  id: string;
  titulo: string;
  created_at: string;
  setor: string | null;
}

type Period = "dia" | "semana" | "mes";

function getPeriodRange(period: Period): { start: Date; end: Date; label: string } {
  const now = new Date();
  if (period === "dia") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const end = new Date(yesterday);
    end.setHours(23, 59, 59, 999);
    return { start: yesterday, end, label: "Dia Anterior" };
  }
  if (period === "semana") {
    const endOfLastWeek = new Date(now);
    // Go to last Sunday
    endOfLastWeek.setDate(endOfLastWeek.getDate() - endOfLastWeek.getDay());
    endOfLastWeek.setHours(23, 59, 59, 999);
    const startOfLastWeek = new Date(endOfLastWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 6);
    startOfLastWeek.setHours(0, 0, 0, 0);
    return { start: startOfLastWeek, end: endOfLastWeek, label: "Semana Anterior" };
  }
  // mes
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfLastMonth = new Date(firstOfThisMonth.getTime() - 1);
  const startOfLastMonth = new Date(endOfLastMonth.getFullYear(), endOfLastMonth.getMonth(), 1);
  return { start: startOfLastMonth, end: endOfLastMonth, label: "Mês Anterior" };
}

// Compute metrics for a given period from history + orders
function computeMetrics(
  orders: OrderRow[],
  history: StatusHistoryRow[],
  period: Period
) {
  const { start, end } = getPeriodRange(period);

  // Orders created in this period (only pre-impressão, i.e. setor IS NULL)
  const ordersInPeriod = orders.filter((o) => {
    const d = new Date(o.created_at);
    return d >= start && d <= end && !o.setor;
  });

  const orderIds = new Set(ordersInPeriod.map((o) => o.id));

  // Build history map for these orders
  const historyByOrder: Record<string, StatusHistoryRow[]> = {};
  history.forEach((h) => {
    if (!orderIds.has(h.order_id)) return;
    if (!historyByOrder[h.order_id]) historyByOrder[h.order_id] = [];
    historyByOrder[h.order_id].push(h);
  });
  // Sort each order's history
  Object.values(historyByOrder).forEach((arr) =>
    arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  );

  // Tempo médio: creation -> aguardando_aprovacao
  const temposAprovacao: number[] = [];
  ordersInPeriod.forEach((o) => {
    const entries = historyByOrder[o.id] || [];
    const aprovEntry = entries.find((e) => e.status_novo === "aguardando_aprovacao");
    if (aprovEntry) {
      temposAprovacao.push(businessHoursMs(new Date(o.created_at), new Date(aprovEntry.created_at)));
    }
  });

  // Tempo Total: creation -> arquivo_liberado, minus time in aguardando_aprovacao + aguardando_novo_arquivo
  const temposTotal: number[] = [];
  ordersInPeriod.forEach((o) => {
    const entries = historyByOrder[o.id] || [];
    const saidaEntry = entries.find((e) => e.status_novo === "arquivo_liberado");
    if (!saidaEntry) return;

    const totalMs = businessHoursMs(new Date(o.created_at), new Date(saidaEntry.created_at));

    // Subtract time in aguardando_aprovacao and aguardando_novo_arquivo
    let subtractMs = 0;
    for (let i = 0; i < entries.length; i++) {
      const status = entries[i].status_novo;
      if (status === "aguardando_aprovacao" || status === "aguardando_novo_arquivo" || status === "paralisado") {
        const exitTime = entries[i + 1] ? new Date(entries[i + 1].created_at) : new Date(saidaEntry.created_at);
        subtractMs += businessHoursMs(new Date(entries[i].created_at), exitTime);
      }
    }

    temposTotal.push(Math.max(totalMs - subtractMs, 0));
  });

  // Métricas de movimentação e finalização por etapa do fluxo no período
  const stageCounts = {
    preparadas: 0,
    provas: 0,
    liberadas: 0,
    paralisadas: 0,
  };

  history.forEach((h) => {
    const d = new Date(h.created_at);
    if (d < start || d > end) return;

    // Conclusão de preparação (saiu de preparando_arquivo avançando)
    if (
      h.status_anterior === "preparando_arquivo" &&
      (h.status_novo === "aguardando_prova" || h.status_novo === "aguardando_aprovacao" || h.status_novo === "arquivo_liberado")
    ) {
      stageCounts.preparadas++;
    }

    // Conclusão de prova técnica (saiu de aguardando_prova para aprovação ou saída)
    if (
      h.status_anterior === "aguardando_prova" &&
      (h.status_novo === "aguardando_aprovacao" || h.status_novo === "arquivo_liberado")
    ) {
      stageCounts.provas++;
    }

    // Saída liberada / concluída
    if (h.status_novo === "arquivo_liberado") {
      stageCounts.liberadas++;
    }

    // Paralisadas no período
    if (h.status_novo === "aguardando_novo_arquivo" || h.status_novo === "paralisado") {
      stageCounts.paralisadas++;
    }
  });

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const min = (arr: number[]) => (arr.length > 0 ? Math.min(...arr) : null);
  const max = (arr: number[]) => (arr.length > 0 ? Math.max(...arr) : null);

  return {
    numOS: ordersInPeriod.length,
    tempoMedio: avg(temposAprovacao),
    tempoMin: min(temposAprovacao),
    tempoMax: max(temposAprovacao),
    tempoTotalMedio: avg(temposTotal),
    tempoTotalMin: min(temposTotal),
    tempoTotalMax: max(temposTotal),
    stageCounts,
  };
}

function MetricCard({ title, icon, color = "slate", children }: { title: string; icon: React.ReactNode; color?: "slate" | "blue" | "emerald" | "violet"; children: React.ReactNode }) {
  const colorMap = {
    slate: "border-[#4A5C6A]/40 bg-card/85 dark:bg-[#11212D]/85 shadow-xs dark:shadow-[0_8px_24px_rgba(6,20,27,0.5)]",
    blue: "border-[#4A5C6A]/40 bg-card/85 dark:bg-[#11212D]/85 shadow-xs dark:shadow-[0_8px_24px_rgba(6,20,27,0.5)]",
    emerald: "border-emerald-500/25 bg-card/85 dark:bg-[#11212D]/85 shadow-xs dark:shadow-[0_8px_24px_rgba(6,20,27,0.5)]",
    violet: "border-violet-500/25 bg-card/85 dark:bg-[#11212D]/85 shadow-xs dark:shadow-[0_8px_24px_rgba(6,20,27,0.5)]",
  };

  return (
    <Card className={`border rounded-2xl backdrop-blur-md transition-all hover:border-primary/40 ${colorMap[color]}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function TimeDisplay({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono-tech font-semibold text-foreground">
        {value !== null ? formatDuration(value) : "—"}
      </span>
    </div>
  );
}

function PeriodView({
  metrics,
}: {
  metrics: ReturnType<typeof computeMetrics>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard title="Ordens Criadas" icon={<ClipboardList className="h-4 w-4 text-[#CCD0CF]" />} color="slate">
        <div className="space-y-1">
          <p className="text-3xl font-bold font-mono-tech text-foreground">{metrics.numOS}</p>
          <p className="text-[11px] text-muted-foreground">O.S. de pré-impressão no período</p>
        </div>
      </MetricCard>

      <MetricCard title="Tempo até Aprovação" icon={<Clock className="h-4 w-4 text-[#9BA8AB]" />} color="blue">
        <div className="space-y-1 mt-1">
          <TimeDisplay label="Tempo Médio" value={metrics.tempoMedio} />
          <TimeDisplay label="Mínimo Registrado" value={metrics.tempoMin} />
          <TimeDisplay label="Máximo Registrado" value={metrics.tempoMax} />
        </div>
      </MetricCard>

      <MetricCard title="Tempo Total Produtivo" icon={<Timer className="h-4 w-4 text-emerald-400" />} color="emerald">
        <div className="space-y-1 mt-1">
          <TimeDisplay label="Tempo Médio" value={metrics.tempoTotalMedio} />
          <TimeDisplay label="Mínimo Registrado" value={metrics.tempoTotalMin} />
          <TimeDisplay label="Máximo Registrado" value={metrics.tempoTotalMax} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 truncate">Desconta tempo aguardando cliente</p>
      </MetricCard>

      <MetricCard title="Entregas & Finalizações" icon={<Send className="h-4 w-4 text-violet-400" />} color="violet">
        <div className="space-y-1.5 mt-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground/80">Preparadas</span>
            <Badge variant="outline" className="font-mono-tech font-bold text-[#CCD0CF] border-[#4A5C6A] bg-[#253745] px-2 py-0.5">
              {metrics.stageCounts.preparadas} O.S.
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground/80">Provas Concluídas</span>
            <Badge variant="outline" className="font-mono-tech font-bold text-violet-400 border-violet-500/30 bg-violet-500/10 px-2 py-0.5">
              {metrics.stageCounts.provas} O.S.
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground/80">Saídas Liberadas</span>
            <Badge variant="outline" className="font-mono-tech font-bold text-emerald-400 border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5">
              {metrics.stageCounts.liberadas} O.S.
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground/80">Paralisadas</span>
            <Badge variant="outline" className="font-mono-tech font-bold text-amber-400 border-amber-500/30 bg-amber-500/10 px-2 py-0.5">
              {metrics.stageCounts.paralisadas} O.S.
            </Badge>
          </div>
        </div>
      </MetricCard>
    </div>
  );
}

export function PreImpressaoTab() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<StatusHistoryRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [activePeriod, setActivePeriod] = useState<Period>("dia");

  useEffect(() => {
    async function load() {
      const [histRes, ordRes] = await Promise.all([
        supabase.from("order_status_history").select("id, order_id, status_anterior, status_novo, created_at").order("created_at", { ascending: true }),
        supabase.from("orders").select("id, titulo, created_at, setor"),
      ]);
      if (histRes.data) setHistory(histRes.data as StatusHistoryRow[]);
      if (ordRes.data) setOrders(ordRes.data as OrderRow[]);
      setLoading(false);
    }
    load();
  }, []);

  const metricsDia = useMemo(() => computeMetrics(orders, history, "dia"), [orders, history]);
  const metricsSemana = useMemo(() => computeMetrics(orders, history, "semana"), [orders, history]);
  const metricsMes = useMemo(() => computeMetrics(orders, history, "mes"), [orders, history]);

  const activeMetrics = useMemo(() => {
    if (activePeriod === "dia") return metricsDia;
    if (activePeriod === "semana") return metricsSemana;
    return metricsMes;
  }, [activePeriod, metricsDia, metricsSemana, metricsMes]);

  const chartData = useMemo(() => [
    {
      name: "Dia Anterior",
      "O.S. Criadas": metricsDia.numOS,
      "Preparadas": metricsDia.stageCounts.preparadas,
      "Provas": metricsDia.stageCounts.provas,
      "Liberadas": metricsDia.stageCounts.liberadas,
    },
    {
      name: "Semana Anterior",
      "O.S. Criadas": metricsSemana.numOS,
      "Preparadas": metricsSemana.stageCounts.preparadas,
      "Provas": metricsSemana.stageCounts.provas,
      "Liberadas": metricsSemana.stageCounts.liberadas,
    },
    {
      name: "Mês Anterior",
      "O.S. Criadas": metricsMes.numOS,
      "Preparadas": metricsMes.stageCounts.preparadas,
      "Provas": metricsMes.stageCounts.provas,
      "Liberadas": metricsMes.stageCounts.liberadas,
    },
  ], [metricsDia, metricsSemana, metricsMes]);

  const timeChartData = useMemo(() => {
    const toMin = (v: number | null) => (v !== null ? Math.round(v / 60000) : 0);
    return [
      {
        name: "Dia Anterior",
        "Tempo Aprovação (min)": toMin(metricsDia.tempoMedio),
        "Tempo Total (min)": toMin(metricsDia.tempoTotalMedio),
      },
      {
        name: "Semana Anterior",
        "Tempo Aprovação (min)": toMin(metricsSemana.tempoMedio),
        "Tempo Total (min)": toMin(metricsSemana.tempoTotalMedio),
      },
      {
        name: "Mês Anterior",
        "Tempo Aprovação (min)": toMin(metricsMes.tempoMedio),
        "Tempo Total (min)": toMin(metricsMes.tempoTotalMedio),
      },
    ];
  }, [metricsDia, metricsSemana, metricsMes]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-[#CCD0CF]" />
        <span className="text-xs text-muted-foreground font-mono-tech">Calculando métricas de pré-impressão...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selector Tabs */}
      <div className="glass-bento p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#253745]/60 border border-[#4A5C6A]/50 text-[#CCD0CF]">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Análise Temporal de Produção</h3>
            <p className="text-xs text-muted-foreground">Selecione a janela temporal para visualizar métricas de fluxo, prazos e entregas</p>
          </div>
        </div>

        <Tabs value={activePeriod} onValueChange={(v) => setActivePeriod(v as Period)}>
          <TabsList className="bg-[#11212D]/80 border border-[#4A5C6A]/50 p-1 rounded-xl shadow-xs backdrop-blur-md">
            <TabsTrigger value="dia" className="text-xs data-[state=active]:bg-[#253745] data-[state=active]:text-[#CCD0CF]">
              Dia Anterior
            </TabsTrigger>
            <TabsTrigger value="semana" className="text-xs data-[state=active]:bg-[#253745] data-[state=active]:text-[#CCD0CF]">
              Semana Anterior
            </TabsTrigger>
            <TabsTrigger value="mes" className="text-xs data-[state=active]:bg-[#253745] data-[state=active]:text-[#CCD0CF]">
              Mês Anterior
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Active Period Metrics */}
      <PeriodView metrics={activeMetrics} />

      {/* Comparison Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-bento">
          <CardHeader className="pb-3 border-b border-[#4A5C6A]/40">
            <CardTitle className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#CCD0CF]" /> Comparativo de Volume e Entregas
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#253745" />
                <XAxis dataKey="name" stroke="#9BA8AB" fontSize={11} />
                <YAxis stroke="#9BA8AB" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#11212D",
                    borderColor: "#4A5C6A",
                    borderRadius: "0.75rem",
                    color: "#CCD0CF",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                <Bar dataKey="O.S. Criadas" fill="#CCD0CF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Preparadas" fill="#4A5C6A" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Provas" fill="#253745" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Liberadas" fill="#9BA8AB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-bento">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500 dark:text-emerald-400" /> Comparativo de Tempos Médios (minutos)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={timeChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "0.75rem",
                    color: "#f8fafc",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                <Bar dataKey="Tempo Aprovação (min)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Tempo Total (min)" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
