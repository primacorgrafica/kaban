import { Order, STATUS_CONFIG, STATUS_ORDER, OrderStatus } from "@/types/order";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, ClipboardList, Clock, TrendingUp, Archive, Timer, CheckCircle2, ArrowRight, FileDown, DatabaseBackup, Loader2, Upload, AlertTriangle, Printer, CalendarClock, History, Bell, Trash2, Info, AlertTriangle as AlertIcon, Square, PrinterCheck, Layers, Truck, List, Eye, EyeOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PreImpressaoTab } from "./PreImpressaoTab";
import { OffsetIcon } from "./icons/OffsetIcon";
import { DEPARTMENTS, EXPEDICAO_DEPARTMENT, Department, DEPARTMENT_MAP } from "@/types/production";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrderAnalytics, formatDuration } from "@/hooks/useOrderAnalytics";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { exportSingleOrderPDF, exportFullAnalyticsPDF, exportColumnPDF, exportAllColumnsPDF } from "@/lib/pdfExport";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface DashboardProps {
  orders: Order[];
  archivedCount: number;
}

export function Dashboard({ orders, archivedCount }: DashboardProps) {
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Avisos management
  const [avisos, setAvisos] = useState<any[]>([]);
  const [avisosLoading, setAvisosLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [provasTodayCount, setProvasTodayCount] = useState(0);
  const [novoArquivoTodayCount, setNovoArquivoTodayCount] = useState(0);
  const [avisosLidos, setAvisosLidos] = useState<Record<string, { user_id: string; lido_em: string }[]>>({});

  useEffect(() => {
    const fetchAvisos = async () => {
      const { data } = await supabase
        .from("avisos")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setAvisos(data);
      setAvisosLoading(false);
    };
    const fetchProfiles = async () => {
      const { data } = await supabase.from("profiles").select("user_id, nome");
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((p: any) => { map[p.user_id] = p.nome; });
        setProfiles(map);
      }
    };
    const fetchProvasToday = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("order_status_history")
        .select("id", { count: "exact", head: true })
        .eq("status_novo", "aguardando_prova")
        .gte("created_at", todayStart.toISOString());
      setProvasTodayCount(count || 0);
    };
    const fetchNovoArquivoToday = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("order_status_history")
        .select("id", { count: "exact", head: true })
        .eq("status_anterior", "aguardando_novo_arquivo")
        .gte("created_at", todayStart.toISOString());
      setNovoArquivoTodayCount(count || 0);
    };
    const fetchAvisosLidos = async () => {
      const { data } = await supabase
        .from("avisos_lidos")
        .select("aviso_id, user_id, lido_em");
      if (data) {
        const map: Record<string, { user_id: string; lido_em: string }[]> = {};
        data.forEach((r: any) => {
          if (!map[r.aviso_id]) map[r.aviso_id] = [];
          map[r.aviso_id].push({ user_id: r.user_id, lido_em: r.lido_em });
        });
        setAvisosLidos(map);
      }
    };
    fetchAvisos();
    fetchProfiles();
    fetchProvasToday();
    fetchNovoArquivoToday();
    fetchAvisosLidos();
  }, []);

  const handleDeleteAviso = async (id: string) => {
    const { error } = await supabase.from("avisos").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir aviso");
    } else {
      setAvisos((prev) => prev.filter((a) => a.id !== id));
      toast.success("Aviso excluído!");
    }
  };

  const handleRestore = async (file: File) => {
    setRestoreLoading(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      
      if (!backup?.tables || !backup?.metadata) {
        throw new Error("Arquivo de backup inválido.");
      }

      const { data, error } = await supabase.functions.invoke("restore-backup", {
        body: backup,
      });
      if (error) throw error;

      toast.success(`Backup de ${new Date(data.backup_date).toLocaleDateString("pt-BR")} restaurado com sucesso! Recarregue a página para ver as alterações.`);
    } catch (err: any) {
      toast.error("Erro ao restaurar backup: " + (err.message || "Arquivo inválido"));
    } finally {
      setRestoreLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("backup-database");
      if (error) throw error;
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Backup realizado! ${data.summary.orders} ordens, ${data.summary.profiles} perfis exportados.`);
    } catch (err: any) {
      toast.error("Erro ao realizar backup: " + (err.message || "Tente novamente"));
    } finally {
      setBackupLoading(false);
    }
  };

  const { buildTimelines, getAverageTimePerStatus, getAverageTotalTime } = useOrderAnalytics();

  const NON_PRODUCTION_SECTORS = ["faturamento", "compras", "manutencao"];
  const total = (() => {
    const productionOrders = orders.filter((o) => {
      // Exclude sub-orders ("OS com carimbo" — cópias para outros setores)
      if (o.parent_order_id) return false;
      // Exclude non-production sectors
      if (o.setor && NON_PRODUCTION_SECTORS.includes(o.setor)) return false;
      // Exclude orders at "saída" in pre-impressão
      if (!o.setor && o.status === "arquivo_liberado") return false;
      // Exclude orders at "saída" in production sectors
      if (o.setor && o.setor_status === "saida") return false;
      return true;
    });
    // Count distinct titulo to avoid counting sub-orders separately
    const uniqueTitulos = new Set(productionOrders.map(o => o.titulo));
    return uniqueTitulos.size;
  })();
  const countByStatus = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = orders.filter((o) => o.status === status && !o.arquivado).length;
    return acc;
  }, {} as Record<OrderStatus, number>);

  const todayOrders = orders.filter((o) => {
    // Exclude sub-orders ("OS com carimbo")
    if (o.parent_order_id) return false;
    const today = new Date();
    const created = new Date(o.created_at);
    return created.toDateString() === today.toDateString();
  }).length;

  const completedOrders = orders.filter((o) => o.status === "arquivo_liberado");
  const today = new Date();
  const completedTodayOrders = orders.filter((o) => {
    if (o.status !== "arquivo_liberado" || o.setor) return false;
    const updated = new Date(o.updated_at);
    return updated.toDateString() === today.toDateString();
  });
  const urgentOrders = orders.filter((o) => o.urgente && !o.arquivado);
  const ordersWithDeadline = orders.filter((o) => o.prazo && !o.arquivado);
  const avgTotal = getAverageTotalTime(orders);
  const avgPerStatus = getAverageTimePerStatus(orders);
  // Count orders per setor (department) with status breakdown
  const allDepts = [...DEPARTMENTS, EXPEDICAO_DEPARTMENT];
  const activeNonArchived = orders.filter((o) => !o.arquivado);

  // Pre-impressão uses STATUS_ORDER statuses
  const preImpressaoOrders = activeNonArchived.filter((o) => !o.setor);
  const preImpressaoBreakdown = STATUS_ORDER.map((s) => ({
    id: s,
    label: STATUS_CONFIG[s].label,
    colorKey: STATUS_CONFIG[s].colorKey,
    count: preImpressaoOrders.filter((o) => o.status === s).length,
  }));

  // Production departments use their own statuses
  const setorData = [
    {
      key: "pre_impressao",
      label: "Pré-Impressão",
      total: preImpressaoOrders.length,
      breakdown: preImpressaoBreakdown,
    },
    ...allDepts.map((dept) => {
      const deptOrders = activeNonArchived.filter((o) => o.setor === dept.id && o.setor_status !== "saida");
      const breakdown = dept.statuses
        .filter((s) => s.id !== "saida")
        .map((s) => ({
          id: s.id,
          label: s.label,
          colorKey: s.colorKey,
          count: deptOrders.filter((o) => o.setor_status === s.id).length,
        }));
      return {
        key: dept.id,
        label: dept.label,
        total: deptOrders.length,
        breakdown,
      };
    }),
  ];

  const maxSetorCount = Math.max(...setorData.map((s) => s.total), 1);
  const maxCount = Math.max(...Object.values(countByStatus), 1);

  // Build timelines for all orders
  const allTimelines = buildTimelines(orders);

  // Orders with multiple proofs
  const multiProofOrders = allTimelines.filter((t) => t.provasCount > 1);

  // Build timelines for recently completed orders
  const recentCompleted = buildTimelines(
    completedOrders
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 10)
  );

  // Build timelines for active (in-progress) orders
  const activeOrders = orders.filter((o) => !o.arquivado && o.status !== "arquivo_liberado");
  const activeTimelines = buildTimelines(
    activeOrders.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 10)
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4 overflow-auto h-full">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Dashboard & Analytics</h2>
      </div>
      <Tabs defaultValue="geral" className="w-full">
        <TabsList>
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="pre-impressao">Pré-Impressão</TabsTrigger>
        </TabsList>
        <TabsContent value="geral" className="space-y-6 mt-4">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            exportFullAnalyticsPDF(allTimelines, avgPerStatus, avgTotal, {
              total,
              liberadas: completedOrders.length,
              arquivadas: archivedCount,
              criadasHoje: todayOrders,
            });
            toast.success("PDF completo exportado!");
          }}
        >
          <FileDown className="h-4 w-4" />
          Exportar PDF Completo
        </Button>
      </div>

      {/* Metric cards - Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <ClipboardList className="h-4 w-4" /> OS. em Produção
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> OS. Criadas Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{todayOrders}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> OS. Aprovadas Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{completedTodayOrders.length}</p>
            <p className="text-xs text-muted-foreground">saída pré-impressão</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Printer className="h-4 w-4" /> Provas Produzidas Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{provasTodayCount}</p>
            <p className="text-xs text-muted-foreground">produzidas hoje</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <ArrowRight className="h-4 w-4" /> Novo Arquivo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{novoArquivoTodayCount}</p>
            <p className="text-xs text-muted-foreground">finalizadas hoje</p>
          </CardContent>
        </Card>
      </div>

      {/* Metric cards - Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Square className="h-4 w-4" /> CTP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeNonArchived.filter((o) => o.setor === "ctp" && o.setor_status !== "saida").length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <OffsetIcon className="h-4 w-4" /> Off-Set
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeNonArchived.filter((o) => o.setor === "offset" && o.setor_status !== "saida").length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <PrinterCheck className="h-4 w-4" /> Digital
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeNonArchived.filter((o) => o.setor === "digital" && o.setor_status !== "saida").length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Layers className="h-4 w-4" /> Acabamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeNonArchived.filter((o) => o.setor === "acabamento" && o.setor_status !== "saida").length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Truck className="h-4 w-4" /> Expedição
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeNonArchived.filter((o) => o.setor === "expedicao" && o.setor_status !== "saida").length}</p>
          </CardContent>
        </Card>
      </div>

      {/* OS em Produção - Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <List className="h-4 w-4" /> OS em Produção ({activeNonArchived.filter((o) => o.setor && o.setor_status !== "saida" && !o.parent_order_id).length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">OS</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Etapa / Setor</TableHead>
                  <TableHead>Última Atualização</TableHead>
                  <TableHead>Data Entrega</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeNonArchived
                  .filter((o) => o.setor && o.setor_status !== "saida")
                  .sort((a, b) => {
                    const numA = parseInt(a.titulo.replace(/\D/g, "")) || 0;
                    const numB = parseInt(b.titulo.replace(/\D/g, "")) || 0;
                    return numB - numA;
                  })
                  .map((o) => {
                    const dept = DEPARTMENT_MAP[o.setor as Department];
                    const statusLabel = dept?.statuses.find((s) => s.id === o.setor_status)?.label || o.setor_status || "—";
                    const setorLabel = dept?.label || o.setor || "—";
                    const isUrgent = o.urgente || o.urgente_prova || o.urgente_impressao || o.urgente_acabamento || o.urgente_expedicao;
                    return (
                      <TableRow key={o.id} className={isUrgent ? "bg-destructive/5" : ""}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            {isUrgent && <Badge variant="destructive" className="text-[9px] px-1 py-0">URG</Badge>}
                            {o.titulo}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{o.cliente}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{o.descricao}</TableCell>
                        <TableCell className="text-xs">
                          <span className="font-medium">{setorLabel}</span>
                          <span className="text-muted-foreground"> / {statusLabel}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(o.updated_at), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {o.entrega_data_limite
                            ? format(new Date(o.entrega_data_limite), "dd/MM/yyyy")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Timer className="h-4 w-4" /> Tempo Médio por Etapa (OS. Liberadas)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(avgPerStatus).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma OS. liberada ainda para calcular médias</p>
          ) : (
            <div className="space-y-3">
              {STATUS_ORDER.map((status) => {
                const config = STATUS_CONFIG[status];
                const avg = avgPerStatus[status] || 0;
                const maxAvg = Math.max(...Object.values(avgPerStatus), 1);
                const pct = (avg / maxAvg) * 100;

                return (
                  <div key={status} className="flex items-center gap-3">
                    <div className="w-36 text-sm text-muted-foreground truncate">{config.label}</div>
                    <div className="flex-1 h-8 bg-muted rounded-md overflow-hidden relative">
                      <div
                        className="h-full rounded-md transition-all duration-500 ease-out flex items-center justify-end pr-2"
                        style={{
                          width: `${Math.max(pct, avg > 0 ? 8 : 0)}%`,
                          backgroundColor: `hsl(var(--status-${config.colorKey}))`,
                          minWidth: avg > 0 ? '60px' : '0',
                        }}
                      >
                        {avg > 0 && (
                          <span className="text-xs font-medium text-white drop-shadow-sm">{formatDuration(avg)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* OS. por Status bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">OS. por Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {STATUS_ORDER.map((status) => {
              const config = STATUS_CONFIG[status];
              const count = countByStatus[status];
              const pct = (count / maxCount) * 100;

              return (
                <div key={status} className="flex items-center gap-3">
                  <div className="w-36 text-sm text-muted-foreground truncate">{config.label}</div>
                  <div className="flex-1 h-8 bg-muted rounded-md overflow-hidden relative">
                    <div
                      className="h-full rounded-md transition-all duration-500 ease-out"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: `hsl(var(--status-${config.colorKey}))`,
                        minWidth: count > 0 ? '24px' : '0',
                      }}
                    />
                  </div>
                  <div className="w-8 text-sm font-semibold text-right">{count}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Exportar colunas individuais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <FileDown className="h-4 w-4" /> Exportar Pré-Impressão em PDF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full gap-2"
            onClick={() => {
              const activeOrders = orders.filter((o) => !o.arquivado);
              if (activeOrders.length === 0) {
                toast.info("Nenhuma OS. ativa para exportar");
                return;
              }
              const groups = STATUS_ORDER.map((s) => ({
                status: s,
                label: STATUS_CONFIG[s].label,
                orders: activeOrders.filter((o) => o.status === s),
              }));
              exportAllColumnsPDF(groups);
              toast.success("PDF exportado com sucesso!");
            }}
          >
            <FileDown className="h-4 w-4" />
            Exportar Tudo em PDF
          </Button>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {STATUS_ORDER.map((status) => {
              const config = STATUS_CONFIG[status];
              const statusOrders = orders.filter((o) => o.status === status && !o.arquivado);
              return (
                <Button
                  key={status}
                  variant="outline"
                  className="justify-start gap-2 h-auto py-3"
                  onClick={() => {
                    if (statusOrders.length === 0) {
                      toast.info(`Nenhuma OS. em "${config.label}"`);
                      return;
                    }
                    exportColumnPDF(statusOrders, config.label);
                    toast.success(`PDF "${config.label}" exportado!`);
                  }}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: `hsl(var(--status-${config.colorKey}))` }}
                  />
                  <div className="text-left">
                    <div className="text-sm font-medium">{config.label}</div>
                    <div className="text-xs text-muted-foreground">{statusOrders.length} ordem(ns)</div>
                  </div>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Backup do Sistema */}
      <Card className="border-2 border-dashed border-primary/30">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <DatabaseBackup className="h-4 w-4" /> Backup do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Exporte todos os dados do sistema em JSON ou restaure a partir de um backup anterior.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              className="flex-1 gap-2"
              variant="default"
              onClick={handleBackup}
              disabled={backupLoading || restoreLoading}
            >
              {backupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
              {backupLoading ? "Gerando backup..." : "Baixar Backup (JSON)"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleRestore(file);
              }}
            />
            <Button
              className="flex-1 gap-2"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={backupLoading || restoreLoading}
            >
              {restoreLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {restoreLoading ? "Restaurando..." : "Restaurar Backup"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Últimas OS. Liberadas — Tempo Detalhado
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentCompleted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma OS. liberada ainda</p>
          ) : (
            <div className="space-y-4">
                {recentCompleted.map((t) => (
                  <div key={t.orderId} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-sm">{t.titulo}</span>
                        <span className="text-xs text-muted-foreground ml-2">• {t.cliente}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-sm font-bold text-primary">
                          <Timer className="h-3.5 w-3.5" />
                          {t.tempoTotal !== null ? formatDuration(t.tempoTotal) : "—"}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Exportar PDF desta OS."
                          onClick={() => {
                            exportSingleOrderPDF(t);
                            toast.success("PDF exportado!");
                          }}
                        >
                          <FileDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {STATUS_ORDER.map((status, idx) => {
                        const config = STATUS_CONFIG[status];
                        const ms = t.tempoPorStatus[status];
                        if (!ms && ms !== 0) return null;

                        return (
                          <div key={status} className="flex items-center gap-1">
                            {idx > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/50 mx-0.5" />}
                            <div
                              className="text-xs px-2 py-1 rounded-md font-medium"
                              style={{
                                backgroundColor: `hsl(var(--status-${config.colorKey}-bg))`,
                                color: `hsl(var(--status-${config.colorKey}))`,
                              }}
                            >
                              {config.label}: {formatDuration(ms)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Criada: {new Date(t.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {t.finalizadoEm && (
                        <> — Liberada: {new Date(t.finalizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</>
                      )}
                    </div>
                  </div>
                ))}
              </div>
          )}
        </CardContent>
      </Card>

      {/* Active orders timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4" /> OS. em Andamento — Tempo Acumulado
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeTimelines.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma OS. ativa no momento</p>
          ) : (
            <div className="space-y-4">
                {activeTimelines.map((t) => {
                  const statusConfig = STATUS_CONFIG[t.statusAtual as OrderStatus];
                  return (
                    <div key={t.orderId} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-sm">{t.titulo}</span>
                          <span className="text-xs text-muted-foreground ml-2">• {t.cliente}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {statusConfig && (
                            <span
                              className="text-xs px-2 py-0.5 rounded font-medium"
                              style={{
                                backgroundColor: `hsl(var(--status-${statusConfig.colorKey}-bg))`,
                                color: `hsl(var(--status-${statusConfig.colorKey}))`,
                              }}
                            >
                              {statusConfig.label}
                            </span>
                          )}
                          <span className="text-sm font-bold text-muted-foreground">
                            {t.tempoTotal !== null ? formatDuration(t.tempoTotal) : "—"}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Exportar PDF desta OS."
                            onClick={() => {
                              exportSingleOrderPDF(t);
                              toast.success("PDF exportado!");
                            }}
                          >
                            <FileDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {STATUS_ORDER.map((status, idx) => {
                          const config = STATUS_CONFIG[status];
                          const ms = t.tempoPorStatus[status];
                          if (!ms) return null;

                          return (
                            <div key={status} className="flex items-center gap-1">
                              {idx > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/50 mx-0.5" />}
                              <div
                                className="text-xs px-2 py-1 rounded-md font-medium"
                                style={{
                                  backgroundColor: `hsl(var(--status-${config.colorKey}-bg))`,
                                  color: `hsl(var(--status-${config.colorKey}))`,
                                }}
                              >
                                {config.label}: {formatDuration(ms)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Criada: {new Date(t.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  );
                })}
              </div>
          )}
        </CardContent>
      </Card>

      {/* Proof tracking - orders with multiple proofs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Printer className="h-4 w-4" /> Controle de Provas — OS. com Múltiplas Provas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {multiProofOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma OS. precisou de mais de 1 prova</p>
          ) : (
            <div className="space-y-3">
              {multiProofOrders
                .sort((a, b) => b.provasCount - a.provasCount)
                .map((t) => {
                  const statusConfig = STATUS_CONFIG[t.statusAtual as OrderStatus];
                  return (
                    <div key={t.orderId} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{t.titulo}</span>
                          <span className="text-xs text-muted-foreground">• {t.cliente}</span>
                          {statusConfig && (
                            <span
                              className="text-xs px-2 py-0.5 rounded font-medium"
                              style={{
                                backgroundColor: `hsl(var(--status-${statusConfig.colorKey}-bg))`,
                                color: `hsl(var(--status-${statusConfig.colorKey}))`,
                              }}
                            >
                              {statusConfig.label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Tipo: {t.provaDigital ? "Digital" : ""}{t.provaDigital && t.provaEmail ? " + " : ""}{t.provaEmail ? "E-mail" : ""}{!t.provaDigital && !t.provaEmail ? "Não especificado" : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-600 px-3 py-1.5 rounded-md">
                        <Printer className="h-4 w-4" />
                        <span className="font-bold text-lg">{t.provasCount}</span>
                        <span className="text-xs">provas</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deadline tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <CalendarClock className="h-4 w-4" /> Controle de Prazos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ordersWithDeadline.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma OS. ativa com prazo definido</p>
          ) : (
            <div className="space-y-3">
              {ordersWithDeadline
                .sort((a, b) => new Date(a.prazo!).getTime() - new Date(b.prazo!).getTime())
                .map((o) => {
                  const deadline = new Date(o.prazo!);
                  const now = new Date();
                  const remaining = deadline.getTime() - now.getTime();
                  const isOverdue = remaining < 0;
                  const isNear = remaining > 0 && remaining < 3600000; // < 1h
                  const statusConfig = STATUS_CONFIG[o.status as OrderStatus];

                  return (
                    <div
                      key={o.id}
                      className={`border rounded-lg p-3 flex items-center justify-between gap-3 ${
                        isOverdue ? "border-destructive/50 bg-destructive/5" : isNear ? "border-amber-500/50 bg-amber-500/5" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{o.titulo}</span>
                          <span className="text-xs text-muted-foreground">• {o.cliente}</span>
                          {o.urgente && <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-medium">Urgente</span>}
                          {statusConfig && (
                            <span
                              className="text-xs px-2 py-0.5 rounded font-medium"
                              style={{
                                backgroundColor: `hsl(var(--status-${statusConfig.colorKey}-bg))`,
                                color: `hsl(var(--status-${statusConfig.colorKey}))`,
                              }}
                            >
                              {statusConfig.label}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-medium">
                          {deadline.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className={`text-xs font-semibold ${isOverdue ? "text-destructive" : isNear ? "text-amber-500" : "text-muted-foreground"}`}>
                          {isOverdue
                            ? `Atrasado ${formatDuration(Math.abs(remaining))}`
                            : `Faltam ${formatDuration(remaining)}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full movement history for active orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <History className="h-4 w-4" /> Histórico Completo de Movimentações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-4">
              {allTimelines
                .filter((t) => t.movimentacoes.length > 0)
                .sort((a, b) => {
                  const lastA = a.movimentacoes[a.movimentacoes.length - 1];
                  const lastB = b.movimentacoes[b.movimentacoes.length - 1];
                  return new Date(lastB.data).getTime() - new Date(lastA.data).getTime();
                })
                .slice(0, 20)
                .map((t) => (
                  <div key={t.orderId} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{t.titulo}</span>
                      <span className="text-xs text-muted-foreground">• {t.cliente}</span>
                      {t.provasCount > 1 && (
                        <span className="text-xs bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded font-medium">
                          {t.provasCount} provas
                        </span>
                      )}
                      {t.urgente && <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-medium">Urgente</span>}
                    </div>
                    <div className="space-y-1">
                      {t.movimentacoes.map((m, idx) => {
                        const paraConfig = STATUS_CONFIG[m.para as OrderStatus];
                        return (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground w-28 flex-shrink-0">
                              {new Date(m.data).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                            {paraConfig && (
                              <span
                                className="px-2 py-0.5 rounded font-medium"
                                style={{
                                  backgroundColor: `hsl(var(--status-${paraConfig.colorKey}-bg))`,
                                  color: `hsl(var(--status-${paraConfig.colorKey}))`,
                                }}
                              >
                                {paraConfig.label}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {t.tempoTotal !== null && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Timer className="h-3 w-3" /> Tempo total: {formatDuration(t.tempoTotal)}
                        {t.prazo && (
                          <> | Prazo: {new Date(t.prazo).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      {/* Gerenciamento de Avisos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Bell className="h-4 w-4" /> Avisos Enviados ({avisos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {avisosLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : avisos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum aviso enviado ainda</p>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {avisos.map((aviso) => (
                  <div key={aviso.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={aviso.tipo === "urgente" ? "destructive" : aviso.tipo === "lembrete" ? "secondary" : "default"} className="text-[10px]">
                          {aviso.tipo === "urgente" ? "🔴 Urgente" : aviso.tipo === "lembrete" ? "🟡 Lembrete" : "ℹ️ Info"}
                        </Badge>
                        <span className="font-semibold text-sm">{aviso.titulo}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(aviso.created_at), "dd/MM/yyyy HH:mm")}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteAviso(aviso.id)}
                          title="Excluir aviso"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{aviso.mensagem}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Para: {aviso.destinatario_id ? (profiles[aviso.destinatario_id] || "Usuário específico") : "📢 Todos"}</span>
                      <span>•</span>
                      <span>Por: {profiles[aviso.criado_por] || "Admin"}</span>
                    </div>
                    {/* Read status */}
                    {(() => {
                      const leituras = avisosLidos[aviso.id] || [];
                      if (aviso.destinatario_id) {
                        // Individual: show if the specific user read it
                        const leu = leituras.find(l => l.user_id === aviso.destinatario_id);
                        return (
                          <div className="flex items-center gap-1.5 text-xs">
                            {leu ? (
                              <span className="flex items-center gap-1 text-emerald-600">
                                <Eye className="h-3 w-3" />
                                Visualizado em {format(new Date(leu.lido_em), "dd/MM HH:mm")}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <EyeOff className="h-3 w-3" />
                                Não visualizado
                              </span>
                            )}
                          </div>
                        );
                      } else {
                        // Global: show count and list of who read
                        const totalUsers = Object.keys(profiles).length;
                        return (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs">
                              <Eye className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                Visualizado por {leituras.length}/{totalUsers} usuários
                              </span>
                            </div>
                            {leituras.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {leituras.map((l) => (
                                  <Badge key={l.user_id} variant="outline" className="text-[10px] px-1.5 py-0">
                                    {profiles[l.user_id] || "Usuário"}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }
                    })()}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
      </TabsContent>
        <TabsContent value="pre-impressao" className="mt-4">
          <PreImpressaoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
