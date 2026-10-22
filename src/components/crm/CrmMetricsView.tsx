import React, { useState } from "react";
import { CrmOpportunity, CrmStage, formatCurrency } from "@/types/crm";
import { useCrmMetrics, MetricPeriod } from "@/hooks/useCrmMetrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  Award,
  AlertTriangle,
  Users,
  Target,
  DollarSign,
  PieChart,
  BarChart2,
  Calendar,
  Layers,
} from "lucide-react";

interface CrmMetricsViewProps {
  opportunities: CrmOpportunity[];
  stages: CrmStage[];
}

export function CrmMetricsView({ opportunities, stages }: CrmMetricsViewProps) {
  const [period, setPeriod] = useState<MetricPeriod>("mes");
  const metrics = useCrmMetrics(opportunities, stages, period);

  const kpis = [
    {
      label: "Pipeline em Negociação",
      value: formatCurrency(metrics.pipelineValue),
      subtext: `${metrics.ativasCount} oportunidades ativas`,
      icon: TrendingUp,
      color: "text-blue-500",
      bgBadge: "bg-blue-500/10 border-blue-500/20",
      accentBar: "bg-blue-500",
    },
    {
      label: "Vendas Fechadas",
      value: formatCurrency(metrics.wonValue),
      subtext: `${metrics.ganhasCount} pedidos convertidos`,
      icon: Award,
      color: "text-emerald-500",
      bgBadge: "bg-emerald-500/10 border-emerald-500/20",
      accentBar: "bg-emerald-500",
    },
    {
      label: "Taxa de Conversão",
      value: `${metrics.conversionRate.toFixed(1)}%`,
      subtext: "Ganha vs. Perdida no período",
      icon: Target,
      color: "text-[#CCD0CF]",
      bgBadge: "bg-[#253745] border-[#4A5C6A]/50",
      accentBar: "bg-[#CCD0CF]",
    },
    {
      label: "Ticket Médio",
      value: formatCurrency(metrics.averageTicket),
      subtext: "Por venda fechada",
      icon: DollarSign,
      color: "text-amber-500",
      bgBadge: "bg-amber-500/10 border-amber-500/20",
      accentBar: "bg-amber-500",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Filtro de Período do Relatório */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-border bg-card shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-foreground">Relatório Comercial e Indicadores</h3>
          <p className="text-xs text-muted-foreground">
            Métricas 100% calculadas a partir de dados reais cadastrados no CRM da Primacor Gráfica.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
            <SelectTrigger className="h-9 w-44 text-xs rounded-xl bg-background border-border font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="semana">Esta Semana</SelectItem>
              <SelectItem value="mes">Este Mês</SelectItem>
              <SelectItem value="ultimos_30_dias">Últimos 30 Dias</SelectItem>
              <SelectItem value="trimestre">Este Trimestre</SelectItem>
              <SelectItem value="ano">Este Ano</SelectItem>
              <SelectItem value="todos">Todo o Histórico</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards de KPIs Principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card
            key={kpi.label}
            className="border-border bg-card shadow-xs relative overflow-hidden group hover:border-primary/40 transition-all"
          >
            <CardContent className="flex items-center gap-4 p-4.5">
              <div
                className={`p-3 rounded-2xl border flex items-center justify-center shrink-0 ${kpi.bgBadge} ${kpi.color}`}
              >
                <kpi.icon className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
                  {kpi.label}
                </p>
                <p className="text-xl sm:text-2xl font-extrabold text-foreground font-mono-tech mt-0.5 truncate">
                  {kpi.value}
                </p>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate font-mono-tech">
                  {kpi.subtext}
                </p>
              </div>
            </CardContent>
            <div className={`absolute bottom-0 left-0 right-0 h-1 opacity-70 ${kpi.accentBar}`} />
          </Card>
        ))}
      </div>

      {/* Pipeline por Etapas do Funil */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2 text-foreground">
            <Layers className="h-4 w-4 text-primary" />
            <span>Distribuição de Oportunidades por Etapa</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            {metrics.byStage.map((st) => (
              <div
                key={st.stageId}
                className="p-3 rounded-xl border border-border/80 bg-muted/20 space-y-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: st.stageColor }}
                  />
                  <span className="text-xs font-semibold text-foreground truncate" title={st.stageName}>
                    {st.stageName}
                  </span>
                </div>
                <div className="pt-1 flex items-baseline justify-between font-mono-tech">
                  <span className="text-lg font-bold text-foreground">{st.count}</span>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {formatCurrency(st.totalValue)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Grid: Desempenho por Vendedor & Motivos de Perda */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking por Vendedor */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2 text-foreground">
              <Users className="h-4 w-4 text-primary" />
              <span>Desempenho Comercial por Vendedor</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {metrics.sellerRanking.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4">Sem dados no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground uppercase text-[10px] text-left">
                      <th className="py-2 px-2">Vendedor</th>
                      <th className="py-2 px-2 text-center">Total</th>
                      <th className="py-2 px-2 text-center">Ganhas</th>
                      <th className="py-2 px-2 text-center">Conversão</th>
                      <th className="py-2 px-2 text-right">Faturado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono-tech">
                    {metrics.sellerRanking.map((s) => (
                      <tr key={s.seller} className="hover:bg-muted/40">
                        <td className="py-2.5 px-2 font-bold text-foreground font-sans">{s.seller}</td>
                        <td className="py-2.5 px-2 text-center text-muted-foreground">{s.total}</td>
                        <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">{s.ganhas}</td>
                        <td className="py-2.5 px-2 text-center font-bold text-foreground">
                          {s.conversionRate.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 text-right font-bold text-primary">
                          {formatCurrency(s.valorGanho)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Motivos de Perda */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2 text-foreground">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <span>Motivos de Perda Registrados</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {metrics.lossReasonsList.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4">
                Nenhuma oportunidade perdida registrada no período selecionado.
              </p>
            ) : (
              <div className="space-y-3">
                {metrics.lossReasonsList.map((m) => {
                  const percent =
                    metrics.perdidasCount > 0 ? (m.count / metrics.perdidasCount) * 100 : 0;

                  return (
                    <div key={m.reason} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground truncate">{m.reason}</span>
                        <span className="font-mono-tech text-muted-foreground text-[11px] shrink-0">
                          {m.count} ({percent.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className="h-full bg-rose-500 rounded-full transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Origem dos Leads */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2 text-foreground">
            <PieChart className="h-4 w-4 text-primary" />
            <span>Efetividade por Canal de Origem do Lead</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {metrics.originDistribution.map((orig) => (
              <div
                key={orig.origem}
                className="p-3 rounded-xl border border-border/70 bg-muted/20 space-y-1"
              >
                <span className="text-[11px] text-muted-foreground font-medium block truncate">
                  {orig.origem}
                </span>
                <p className="text-lg font-bold font-mono-tech text-foreground">{orig.count}</p>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono-tech pt-1 border-t border-border/40">
                  <span>Ganhas: {orig.ganhas}</span>
                  <span>{formatCurrency(orig.valorTotal)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
