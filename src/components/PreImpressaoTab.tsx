import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ClipboardList, Clock, Timer, ArrowRight } from "lucide-react";
import { businessHoursMs } from "@/lib/businessHours";
import { formatDuration } from "@/hooks/useOrderAnalytics";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

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
      if (status === "aguardando_aprovacao" || status === "aguardando_novo_arquivo") {
        const exitTime = entries[i + 1] ? new Date(entries[i + 1].created_at) : new Date(saidaEntry.created_at);
        subtractMs += businessHoursMs(new Date(entries[i].created_at), exitTime);
      }
    }

    temposTotal.push(Math.max(totalMs - subtractMs, 0));
  });

  // Operador 1/2/3: count of orders that left each stage to aguardando_prova or aguardando_aprovacao
  const operadorCounts = { op1: 0, op2: 0, op3: 0 };
  const targetStatuses = ["aguardando_prova", "aguardando_aprovacao"];

  // We look at ALL history entries in this period (not just orders created in period)
  // but filtered by date range
  history.forEach((h) => {
    const d = new Date(h.created_at);
    if (d < start || d > end) return;
    if (!targetStatuses.includes(h.status_novo)) return;
    if (h.status_anterior === "preparando_arquivo") operadorCounts.op1++;
    else if (h.status_anterior === "operador_2") operadorCounts.op2++;
    else if (h.status_anterior === "operador_3") operadorCounts.op3++;
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
    operadorCounts,
  };
}

function MetricCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function TimeDisplay({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value !== null ? formatDuration(value) : "—"}</span>
    </div>
  );
}

function PeriodSection({
  label,
  metrics,
}: {
  label: string;
  metrics: ReturnType<typeof computeMetrics>;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold border-b pb-1">{label}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Número de OS" icon={<ClipboardList className="h-4 w-4" />}>
          <p className="text-3xl font-bold">{metrics.numOS}</p>
          <p className="text-xs text-muted-foreground">criadas no período</p>
        </MetricCard>

        <MetricCard title="Tempo até Aprovação" icon={<Clock className="h-4 w-4" />}>
          <div className="space-y-1">
            <TimeDisplay label="Médio" value={metrics.tempoMedio} />
            <TimeDisplay label="Mínimo" value={metrics.tempoMin} />
            <TimeDisplay label="Máximo" value={metrics.tempoMax} />
          </div>
        </MetricCard>

        <MetricCard title="Tempo Total (produtivo)" icon={<Timer className="h-4 w-4" />}>
          <div className="space-y-1">
            <TimeDisplay label="Médio" value={metrics.tempoTotalMedio} />
            <TimeDisplay label="Mínimo" value={metrics.tempoTotalMin} />
            <TimeDisplay label="Máximo" value={metrics.tempoTotalMax} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Exclui tempo em Ag. Aprovação e Ag. Novo Arquivo</p>
        </MetricCard>

        <MetricCard title="Saídas por Operador" icon={<ArrowRight className="h-4 w-4" />}>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Operador 1</span>
              <Badge variant="secondary" className="text-base font-bold px-3">{metrics.operadorCounts.op1}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Operador 2</span>
              <Badge variant="secondary" className="text-base font-bold px-3">{metrics.operadorCounts.op2}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Operador 3</span>
              <Badge variant="secondary" className="text-base font-bold px-3">{metrics.operadorCounts.op3}</Badge>
            </div>
          </div>
        </MetricCard>
      </div>
    </div>
  );
}

export function PreImpressaoTab() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<StatusHistoryRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);

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

  const chartData = useMemo(() => [
    {
      name: getPeriodRange("dia").label,
      "Nº OS": metricsDia.numOS,
      "Op. 1": metricsDia.operadorCounts.op1,
      "Op. 2": metricsDia.operadorCounts.op2,
      "Op. 3": metricsDia.operadorCounts.op3,
    },
    {
      name: getPeriodRange("semana").label,
      "Nº OS": metricsSemana.numOS,
      "Op. 1": metricsSemana.operadorCounts.op1,
      "Op. 2": metricsSemana.operadorCounts.op2,
      "Op. 3": metricsSemana.operadorCounts.op3,
    },
    {
      name: getPeriodRange("mes").label,
      "Nº OS": metricsMes.numOS,
      "Op. 1": metricsMes.operadorCounts.op1,
      "Op. 2": metricsMes.operadorCounts.op2,
      "Op. 3": metricsMes.operadorCounts.op3,
    },
  ], [metricsDia, metricsSemana, metricsMes]);

  const timeChartData = useMemo(() => {
    const toMin = (v: number | null) => (v !== null ? Math.round(v / 60000) : 0);
    return [
      {
        name: getPeriodRange("dia").label,
        "Tempo Aprovação (min)": toMin(metricsDia.tempoMedio),
        "Tempo Total (min)": toMin(metricsDia.tempoTotalMedio),
      },
      {
        name: getPeriodRange("semana").label,
        "Tempo Aprovação (min)": toMin(metricsSemana.tempoMedio),
        "Tempo Total (min)": toMin(metricsSemana.tempoTotalMedio),
      },
      {
        name: getPeriodRange("mes").label,
        "Tempo Aprovação (min)": toMin(metricsMes.tempoMedio),
        "Tempo Total (min)": toMin(metricsMes.tempoTotalMedio),
      },
    ];
  }, [metricsDia, metricsSemana, metricsMes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PeriodSection label={getPeriodRange("dia").label} metrics={metricsDia} />
      <PeriodSection label={getPeriodRange("semana").label} metrics={metricsSemana} />
      <PeriodSection label={getPeriodRange("mes").label} metrics={metricsMes} />

      {/* Comparison charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Volume — Comparativo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Bar dataKey="Nº OS" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Op. 1" fill="hsl(var(--status-novo))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Op. 2" fill="hsl(var(--status-andamento))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Op. 3" fill="hsl(var(--status-aguardando))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Tempos Médios (min) — Comparativo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={timeChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Bar dataKey="Tempo Aprovação (min)" fill="hsl(var(--status-andamento))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Tempo Total (min)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
