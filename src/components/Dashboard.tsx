import { Order, STATUS_CONFIG, STATUS_ORDER, OrderStatus } from "@/types/order";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart3, ClipboardList, Clock, TrendingUp, Archive, Timer, CheckCircle2,
  ArrowRight, FileDown, DatabaseBackup, Loader2, Upload, AlertTriangle,
  Printer, CalendarClock, History, Bell, Trash2, Info, Square,
  PrinterCheck, Layers, Truck, List, Eye, EyeOff, Search, Filter,
  ChevronLeft, ChevronRight, Activity, ShieldCheck, Sparkles, RefreshCw, X, Download
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PreImpressaoTab } from "./PreImpressaoTab";
import { OffsetIcon } from "./icons/OffsetIcon";
import { DEPARTMENTS, EXPEDICAO_DEPARTMENT, Department, DEPARTMENT_MAP } from "@/types/production";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrderAnalytics, formatDuration } from "@/hooks/useOrderAnalytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportSingleOrderPDF, exportFullAnalyticsPDF, exportColumnPDF, exportAllColumnsPDF } from "@/lib/pdfExport";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useState, useRef, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface DashboardProps {
  orders: Order[];
  archivedCount: number;
}

const ITEMS_PER_PAGE = 12;

export function Dashboard({ orders, archivedCount }: DashboardProps) {
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState("geral");

  // Production floor filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSector, setSelectedSector] = useState<string>("all");
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

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

      toast.success(`Backup de ${new Date(data.backup_date).toLocaleDateString("pt-BR")} restaurado com sucesso!`);
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

      toast.success(`Backup realizado com sucesso! ${data.summary.orders} ordens exportadas.`);
    } catch (err: any) {
      toast.error("Erro ao realizar backup: " + (err.message || "Tente novamente"));
    } finally {
      setBackupLoading(false);
    }
  };

  const { buildTimelines, getAverageTimePerStatus, getAverageTotalTime } = useOrderAnalytics();

  const NON_PRODUCTION_SECTORS = ["faturamento", "compras", "manutencao"];
  const total = useMemo(() => {
    const productionOrders = orders.filter((o) => {
      if (o.parent_order_id) return false;
      if (o.setor && NON_PRODUCTION_SECTORS.includes(o.setor)) return false;
      if (!o.setor && o.status === "arquivo_liberado") return false;
      if (o.setor && o.setor_status === "saida") return false;
      return true;
    });
    const uniqueTitulos = new Set(productionOrders.map((o) => o.titulo));
    return uniqueTitulos.size;
  }, [orders]);

  const countByStatus = useMemo(() => {
    return STATUS_ORDER.reduce((acc, status) => {
      acc[status] = orders.filter((o) => o.status === status && !o.arquivado).length;
      return acc;
    }, {} as Record<OrderStatus, number>);
  }, [orders]);

  const todayOrders = useMemo(() => {
    const today = new Date();
    return orders.filter((o) => {
      if (o.parent_order_id) return false;
      const created = new Date(o.created_at);
      return created.toDateString() === today.toDateString();
    }).length;
  }, [orders]);

  const completedOrders = useMemo(() => {
    return orders.filter((o) => o.status === "arquivo_liberado");
  }, [orders]);

  const completedTodayOrders = useMemo(() => {
    const today = new Date();
    return orders.filter((o) => {
      if (o.status !== "arquivo_liberado" || o.setor) return false;
      const updated = new Date(o.updated_at);
      return updated.toDateString() === today.toDateString();
    });
  }, [orders]);

  const activeNonArchived = useMemo(() => {
    return orders.filter((o) => !o.arquivado);
  }, [orders]);

  const ordersWithDeadline = useMemo(() => {
    return orders.filter((o) => o.prazo && !o.arquivado);
  }, [orders]);

  const avgTotal = useMemo(() => getAverageTotalTime(orders), [orders, getAverageTotalTime]);
  const avgPerStatus = useMemo(() => getAverageTimePerStatus(orders), [orders, getAverageTimePerStatus]);

  // Sector breakdown data
  const allDepts = useMemo(() => [...DEPARTMENTS, EXPEDICAO_DEPARTMENT], []);

  const preImpressaoOrders = useMemo(() => {
    return activeNonArchived.filter((o) => !o.setor || !["qualidade", "expedicao", "compras", "manutencao"].includes(o.setor));
  }, [activeNonArchived]);

  const sectorCounts = useMemo(() => {
    return {
      pre_impressao: preImpressaoOrders.length,
      qualidade: activeNonArchived.filter((o) => o.setor === "qualidade" && o.setor_status !== "saida").length,
      expedicao: activeNonArchived.filter((o) => o.setor === "expedicao" && o.setor_status !== "saida").length,
    };
  }, [activeNonArchived, preImpressaoOrders]);

  const maxCount = useMemo(() => Math.max(...Object.values(countByStatus), 1), [countByStatus]);

  // Timelines
  const allTimelines = useMemo(() => buildTimelines(orders), [orders, buildTimelines]);
  const multiProofOrders = useMemo(() => allTimelines.filter((t) => t.provasCount > 1), [allTimelines]);

  const recentCompleted = useMemo(() => {
    return buildTimelines(
      completedOrders
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 10)
    );
  }, [completedOrders, buildTimelines]);

  const activeOrders = useMemo(() => {
    return orders.filter((o) => !o.arquivado && o.status !== "arquivo_liberado");
  }, [orders]);

  const activeTimelines = useMemo(() => {
    return buildTimelines(
      activeOrders.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 12)
    );
  }, [activeOrders, buildTimelines]);

  // Critical deadlines (overdue or due in < 2 hours)
  const criticalDeadlines = useMemo(() => {
    const now = new Date();
    return ordersWithDeadline.filter((o) => {
      const remaining = new Date(o.prazo!).getTime() - now.getTime();
      return remaining < 7200000; // less than 2 hours or overdue
    });
  }, [ordersWithDeadline]);

  // Production floor filtered list
  const filteredProductionOrders = useMemo(() => {
    let list = activeNonArchived.filter((o) => {
      // Must be a production order
      if (o.setor) {
        return o.setor_status !== "saida" && !o.parent_order_id;
      } else {
        return o.status !== "arquivo_liberado" && !o.parent_order_id;
      }
    });

    // Sector filter
    if (selectedSector === "pre_impressao") {
      list = list.filter((o) => !o.setor || !["qualidade", "expedicao", "compras", "manutencao"].includes(o.setor));
    } else if (selectedSector !== "all") {
      list = list.filter((o) => o.setor === selectedSector);
    }

    // Urgency filter
    if (onlyUrgent) {
      list = list.filter((o) => o.urgente || o.urgente_prova || o.urgente_impressao || o.urgente_acabamento || o.urgente_expedicao);
    }

    // Search term filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((o) =>
        o.titulo.toLowerCase().includes(q) ||
        (o.cliente && o.cliente.toLowerCase().includes(q)) ||
        (o.descricao && o.descricao.toLowerCase().includes(q))
      );
    }

    // Sort by OS number descending
    return list.sort((a, b) => {
      const numA = parseInt(a.titulo.replace(/\D/g, "")) || 0;
      const numB = parseInt(b.titulo.replace(/\D/g, "")) || 0;
      return numB - numA;
    });
  }, [activeNonArchived, selectedSector, onlyUrgent, searchTerm]);

  // Pagination for production table
  const totalPages = Math.ceil(filteredProductionOrders.length / ITEMS_PER_PAGE) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProductionOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProductionOrders, currentPage]);

  const handleSelectSectorFilter = (sectorKey: string) => {
    setSelectedSector(sectorKey);
    setCurrentPage(1);
    setActiveTab("producao");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* Executive Telemetry Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-3xl bg-card dark:bg-slate-900/60 border border-border dark:border-slate-800/80 backdrop-blur-xl shadow-xs dark:shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="relative p-3 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 text-cyan-500 dark:text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
            <BarChart3 className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Dashboard de Telemetria</h1>
              <Badge variant="outline" className="font-mono-tech text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5">
                SISTEMA OPERACIONAL
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Primacor OS v2.0 • Monitoramento em tempo real da produção e fluxo gráfico
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-card border-border hover:bg-muted text-foreground text-xs h-9 rounded-xl shadow-xs"
            onClick={() => {
              exportFullAnalyticsPDF(allTimelines, avgPerStatus, avgTotal, {
                total,
                liberadas: completedOrders.length,
                arquivadas: archivedCount,
                criadasHoje: todayOrders,
              });
              toast.success("PDF analítico completo exportado!");
            }}
          >
            <FileDown className="h-4 w-4 text-cyan-500 dark:text-cyan-400" />
            Exportar Relatório PDF
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-card border-border hover:bg-muted text-foreground text-xs h-9 rounded-xl shadow-xs"
            onClick={handleBackup}
            disabled={backupLoading}
          >
            {backupLoading ? <Loader2 className="h-4 w-4 animate-spin text-cyan-500 dark:text-cyan-400" /> : <DatabaseBackup className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />}
            {backupLoading ? "Gerando Backup..." : "Backup JSON"}
          </Button>
        </div>
      </div>

      {/* Row 1: KPI Telemetry Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-card dark:bg-slate-900/60 border border-border dark:border-slate-800/80 shadow-xs dark:shadow-[0_0_20px_rgba(6,182,212,0.08)] relative overflow-hidden group hover:border-cyan-500/50 transition-all">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
            <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400 font-semibold tracking-wide uppercase text-[11px]">
              <Layers className="h-3.5 w-3.5" /> OS em Produção
            </span>
            <Activity className="h-3.5 w-3.5 text-cyan-500/50 group-hover:text-cyan-400 transition-colors" />
          </div>
          <div className="text-3xl font-extrabold font-mono-tech text-foreground tracking-tight">{total}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Ordens ativas na fábrica</p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-500 opacity-60" />
        </div>

        <div className="p-4 rounded-2xl bg-card dark:bg-slate-900/60 border border-border dark:border-slate-800/80 shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.08)] relative overflow-hidden group hover:border-blue-500/50 transition-all">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
            <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold tracking-wide uppercase text-[11px]">
              <Clock className="h-3.5 w-3.5" /> Criadas Hoje
            </span>
            <Sparkles className="h-3.5 w-3.5 text-blue-500/50 group-hover:text-blue-400 transition-colors" />
          </div>
          <div className="text-3xl font-extrabold font-mono-tech text-foreground tracking-tight">{todayOrders}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Novas entradas no dia</p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-60" />
        </div>

        <div className="p-4 rounded-2xl bg-card dark:bg-slate-900/60 border border-border dark:border-slate-800/80 shadow-xs dark:shadow-[0_0_20px_rgba(16,185,129,0.08)] relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold tracking-wide uppercase text-[11px]">
              <CheckCircle2 className="h-3.5 w-3.5" /> Aprovadas Hoje
            </span>
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/50 group-hover:text-emerald-400 transition-colors" />
          </div>
          <div className="text-3xl font-extrabold font-mono-tech text-foreground tracking-tight">{completedTodayOrders.length}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Saídas de pré-impressão</p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60" />
        </div>

        <div className="p-4 rounded-2xl bg-card dark:bg-slate-900/60 border border-border dark:border-slate-800/80 shadow-xs dark:shadow-[0_0_20px_rgba(139,92,246,0.08)] relative overflow-hidden group hover:border-violet-500/50 transition-all">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
            <span className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400 font-semibold tracking-wide uppercase text-[11px]">
              <Printer className="h-3.5 w-3.5" /> Provas Hoje
            </span>
            <PrinterCheck className="h-3.5 w-3.5 text-violet-500/50 group-hover:text-violet-400 transition-colors" />
          </div>
          <div className="text-3xl font-extrabold font-mono-tech text-foreground tracking-tight">{provasTodayCount}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Provas físicas e digitais</p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-500 opacity-60" />
        </div>

        <div className="p-4 rounded-2xl bg-card dark:bg-slate-900/60 border border-border dark:border-slate-800/80 shadow-xs dark:shadow-[0_0_20px_rgba(245,158,11,0.08)] relative overflow-hidden group hover:border-amber-500/50 transition-all col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold tracking-wide uppercase text-[11px]">
              <ArrowRight className="h-3.5 w-3.5" /> Novo Arquivo
            </span>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500/50 group-hover:text-amber-400 transition-colors" />
          </div>
          <div className="text-3xl font-extrabold font-mono-tech text-foreground tracking-tight">{novoArquivoTodayCount}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Ajustes liberados hoje</p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-rose-500 opacity-60" />
        </div>
      </div>

      {/* Row 2: Sector Production Radar Bar */}
      <div className="p-4 rounded-2xl bg-card dark:bg-slate-900/60 border border-border dark:border-slate-800/80 shadow-xs backdrop-blur-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-500 dark:text-cyan-400" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Distribuição por Setor de Fábrica
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">Clique para filtrar ordens no Chão de Fábrica</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => handleSelectSectorFilter("pre_impressao")}
            className="flex flex-col p-3 rounded-xl bg-muted/40 dark:bg-slate-950/60 border border-border dark:border-slate-800 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all text-left group"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span className="font-medium group-hover:text-cyan-500 dark:group-hover:text-cyan-400 transition-colors">Pré-Impressão</span>
              <span className="font-mono-tech font-bold text-foreground text-sm">{sectorCounts.pre_impressao}</span>
            </div>
            <div className="w-full h-1.5 bg-muted dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 dark:bg-cyan-400 rounded-full transition-all duration-500"
                style={{ width: `${total > 0 ? (sectorCounts.pre_impressao / total) * 100 : 0}%` }}
              />
            </div>
          </button>

          <button
            onClick={() => handleSelectSectorFilter("qualidade")}
            className="flex flex-col p-3 rounded-xl bg-muted/40 dark:bg-slate-950/60 border border-border dark:border-slate-800 hover:border-violet-500/40 hover:bg-violet-500/5 transition-all text-left group"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span className="font-medium group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors">Qualidade</span>
              <span className="font-mono-tech font-bold text-foreground text-sm">{sectorCounts.qualidade}</span>
            </div>
            <div className="w-full h-1.5 bg-muted dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 dark:bg-violet-400 rounded-full transition-all duration-500"
                style={{ width: `${total > 0 ? (sectorCounts.qualidade / total) * 100 : 0}%` }}
              />
            </div>
          </button>

          <button
            onClick={() => handleSelectSectorFilter("expedicao")}
            className="flex flex-col p-3 rounded-xl bg-muted/40 dark:bg-slate-950/60 border border-border dark:border-slate-800 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all text-left group"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span className="font-medium group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors">Expedição</span>
              <span className="font-mono-tech font-bold text-foreground text-sm">{sectorCounts.expedicao}</span>
            </div>
            <div className="w-full h-1.5 bg-muted dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${total > 0 ? (sectorCounts.expedicao / total) * 100 : 0}%` }}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Structured Executive Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <div className="flex items-center justify-between overflow-x-auto pb-1 border-b border-border">
          <TabsList className="bg-card dark:bg-slate-950/80 border border-border dark:border-slate-800/80 p-1 rounded-2xl h-auto gap-1 shadow-xs">
            <TabsTrigger
              value="geral"
              className="text-xs py-2 px-3.5 rounded-xl data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:font-bold transition-all"
            >
              Visão Geral & Gargalos
            </TabsTrigger>
            <TabsTrigger
              value="producao"
              className="text-xs py-2 px-3.5 rounded-xl data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:font-bold transition-all"
            >
              Chão de Fábrica ({filteredProductionOrders.length})
            </TabsTrigger>
            <TabsTrigger
              value="sla"
              className="text-xs py-2 px-3.5 rounded-xl data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:font-bold transition-all"
            >
              Lead Time & Prazos
            </TabsTrigger>
            <TabsTrigger
              value="pre-impressao"
              className="text-xs py-2 px-3.5 rounded-xl data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:font-bold transition-all"
            >
              Métricas Pré-Impressão
            </TabsTrigger>
            <TabsTrigger
              value="avisos"
              className="text-xs py-2 px-3.5 rounded-xl data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:font-bold transition-all"
            >
              Avisos ({avisos.length})
            </TabsTrigger>
            <TabsTrigger
              value="backup"
              className="text-xs py-2 px-3.5 rounded-xl data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:font-bold transition-all"
            >
              Exportações & Backup
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB 1: VISÃO GERAL & GARGALOS */}
        <TabsContent value="geral" className="space-y-6 m-0">
          {/* Critical Deadlines Alert Banner */}
          {criticalDeadlines.length > 0 && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-rose-300">
                    Atenção: {criticalDeadlines.length} {criticalDeadlines.length === 1 ? "Ordem com Prazo Crítico" : "Ordens com Prazos Críticos"}
                  </h4>
                  <p className="text-xs text-rose-400/80">
                    Ordens atrasadas ou que vencem em menos de 2 horas requerem prioridade imediata.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveTab("sla")}
                className="bg-rose-500/20 border-rose-500/40 hover:bg-rose-500/30 text-rose-200 text-xs h-8 rounded-xl shrink-0"
              >
                Ver Prazos no SLA
              </Button>
            </div>
          )}

          {/* Section: Status Breakdown & Average Stage Times */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Breakdown Bar Meter */}
            <Card className="border border-border bg-card backdrop-blur-md rounded-2xl shadow-xl">
              <CardHeader className="pb-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-cyan-500" /> Distribuição por Etapa (Pré-Impressão)
                  </CardTitle>
                  <span className="text-xs font-mono-tech text-cyan-600 dark:text-cyan-400 font-bold">
                    {preImpressaoOrders.length} ordens
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {STATUS_ORDER.map((status) => {
                  const config = STATUS_CONFIG[status];
                  const count = countByStatus[status] || 0;
                  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;

                  return (
                    <div key={status} className="flex items-center gap-3">
                      <div className="w-36 text-xs text-foreground truncate font-medium">{config.label}</div>
                      <div className="flex-1 h-7 bg-muted/70 rounded-xl border border-border overflow-hidden relative p-0.5">
                        <div
                          className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
                          style={{
                            width: `${Math.max(pct, count > 0 ? 10 : 0)}%`,
                            backgroundColor: `hsl(var(--status-${config.colorKey}))`,
                          }}
                        >
                          {count > 0 && (
                            <span className="text-[10px] font-bold font-mono-tech text-white drop-shadow whitespace-nowrap">
                              {count}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="w-8 text-right font-mono-tech text-xs font-bold text-muted-foreground">
                        {count}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Average Duration per Stage */}
            <Card className="border border-border bg-card backdrop-blur-md rounded-2xl shadow-xl">
              <CardHeader className="pb-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Timer className="h-4 w-4 text-amber-500" /> Tempo Médio por Etapa (Ordens Liberadas)
                  </CardTitle>
                  <span className="text-xs font-mono-tech text-amber-600 dark:text-amber-400 font-bold">
                    Total: {avgTotal !== null ? formatDuration(avgTotal) : "—"}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {Object.keys(avgPerStatus).length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    Ainda não há dados suficientes de ordens finalizadas para calcular médias.
                  </div>
                ) : (
                  STATUS_ORDER.map((status) => {
                    const config = STATUS_CONFIG[status];
                    const avg = avgPerStatus[status] || 0;
                    const maxAvg = Math.max(...Object.values(avgPerStatus), 1);
                    const pct = (avg / maxAvg) * 100;
                    const isWide = pct >= 18;

                    return (
                      <div key={status} className="flex items-center gap-3" title={`${config.label}: ${avg > 0 ? formatDuration(avg) : "Sem dados"}`}>
                        <div className="w-36 text-xs text-foreground truncate font-medium">{config.label}</div>
                        <div className="flex-1 h-7 bg-muted/70 rounded-xl border border-border overflow-hidden relative p-0.5 flex items-center">
                          <div
                            className={`h-full rounded-lg transition-all duration-500 flex items-center shrink-0 ${
                              isWide ? "justify-end pr-2" : ""
                            }`}
                            style={{
                              width: `${Math.max(pct, avg > 0 ? 3.5 : 0)}%`,
                              minWidth: isWide ? "72px" : undefined,
                              backgroundColor: `hsl(var(--status-${config.colorKey}))`,
                            }}
                          >
                            {isWide && avg > 0 && (
                              <span className="text-[10px] font-bold font-mono-tech text-white drop-shadow whitespace-nowrap">
                                {formatDuration(avg)}
                              </span>
                            )}
                          </div>
                          {!isWide && avg > 0 && (
                            <span className="ml-2 text-[10px] sm:text-[11px] font-bold font-mono-tech text-foreground whitespace-nowrap">
                              {formatDuration(avg)}
                            </span>
                          )}
                          {avg === 0 && (
                            <span className="ml-2 text-[10px] font-mono-tech text-muted-foreground/50 whitespace-nowrap">
                              —
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* Section: Deadlines & Multiple Proofs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Controle de Prazos */}
            <Card className="border border-border bg-card backdrop-blur-md rounded-2xl shadow-xl">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-rose-500" /> Controle de Prazos ({ordersWithDeadline.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {ordersWithDeadline.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Nenhuma ordem com prazo estipulado no momento.</p>
                ) : (
                  <div className="space-y-2.5">
                    {ordersWithDeadline
                      .sort((a, b) => new Date(a.prazo!).getTime() - new Date(b.prazo!).getTime())
                      .slice(0, 6)
                      .map((o) => {
                        const deadline = new Date(o.prazo!);
                        const now = new Date();
                        const remaining = deadline.getTime() - now.getTime();
                        const isOverdue = remaining < 0;
                        const isNear = remaining > 0 && remaining < 3600000;
                        const statusConfig = STATUS_CONFIG[o.status as OrderStatus];

                        return (
                          <div
                            key={o.id}
                            className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                              isOverdue
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-200"
                                : isNear
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-200"
                                : "bg-muted/40 border-border text-foreground"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono-tech font-bold text-xs text-foreground">{o.titulo}</span>
                                <span className="text-[11px] text-muted-foreground truncate">• {o.cliente}</span>
                                {o.urgente && (
                                  <Badge variant="destructive" className="text-[9px] px-1 py-0">URG</Badge>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                {o.descricao}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xs font-mono-tech font-bold text-foreground">
                                {format(deadline, "dd/MM HH:mm")}
                              </div>
                              <div className={`text-[10px] font-semibold ${isOverdue ? "text-rose-600 dark:text-rose-400" : isNear ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                                {isOverdue ? `Atrasado ${formatDuration(Math.abs(remaining))}` : `Faltam ${formatDuration(remaining)}`}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Controle de Retrabalho (Múltiplas Provas) */}
            <Card className="border border-border bg-card backdrop-blur-md rounded-2xl shadow-xl">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Printer className="h-4 w-4 text-violet-500" /> Controle de Provas & Retrabalho ({multiProofOrders.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {multiProofOrders.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Nenhuma O.S. precisou de mais de 1 prova até agora.</p>
                ) : (
                  <div className="space-y-2.5">
                    {multiProofOrders
                      .sort((a, b) => b.provasCount - a.provasCount)
                      .slice(0, 6)
                      .map((t) => {
                        const statusConfig = STATUS_CONFIG[t.statusAtual as OrderStatus];
                        return (
                          <div
                            key={t.orderId}
                            className="p-3 rounded-xl bg-muted/40 border border-border flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono-tech font-bold text-xs text-foreground">{t.titulo}</span>
                                <span className="text-[11px] text-muted-foreground truncate">• {t.cliente}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Tipo: {t.provaDigital ? "Digital" : ""}{t.provaDigital && t.provaEmail ? " + " : ""}{t.provaEmail ? "E-mail" : ""}{!t.provaDigital && !t.provaEmail ? "Física" : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/30 text-violet-600 dark:text-violet-300 px-2.5 py-1 rounded-xl">
                              <Printer className="h-3.5 w-3.5" />
                              <span className="font-mono-tech font-bold text-xs">{t.provasCount}</span>
                              <span className="text-[10px]">provas</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: CHÃO DE FÁBRICA (OS EM PRODUÇÃO) */}
        <TabsContent value="producao" className="space-y-4 m-0">
          {/* Controls Bar: Search + Sector Pills + Urgency Toggle */}
          <div className="p-4 rounded-2xl bg-card border border-border backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por O.S., cliente, descrição..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 bg-background border-input h-9 text-xs rounded-xl text-foreground placeholder:text-muted-foreground"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-start md:justify-end">
              <Button
                variant={selectedSector === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => handleSelectSectorFilter("all")}
                className="h-8 text-xs rounded-xl px-3"
              >
                Todos ({activeNonArchived.filter((o) => !o.parent_order_id && ((o.setor && o.setor_status !== "saida") || (!o.setor && o.status !== "arquivo_liberado"))).length})
              </Button>
              <Button
                variant={selectedSector === "pre_impressao" ? "default" : "outline"}
                size="sm"
                onClick={() => handleSelectSectorFilter("pre_impressao")}
                className="h-8 text-xs rounded-xl px-3"
              >
                Pré-Imp ({sectorCounts.pre_impressao})
              </Button>
              <Button
                variant={selectedSector === "qualidade" ? "default" : "outline"}
                size="sm"
                onClick={() => handleSelectSectorFilter("qualidade")}
                className="h-8 text-xs rounded-xl px-3"
              >
                Qualidade ({sectorCounts.qualidade})
              </Button>
              <Button
                variant={selectedSector === "expedicao" ? "default" : "outline"}
                size="sm"
                onClick={() => handleSelectSectorFilter("expedicao")}
                className="h-8 text-xs rounded-xl px-3"
              >
                Expedição ({sectorCounts.expedicao})
              </Button>

              <Button
                variant={onlyUrgent ? "destructive" : "outline"}
                size="sm"
                onClick={() => {
                  setOnlyUrgent(!onlyUrgent);
                  setCurrentPage(1);
                }}
                className={`h-8 text-xs rounded-xl px-3 gap-1.5 ${onlyUrgent ? "" : "border-slate-800 text-slate-300"}`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Urgentes
              </Button>
            </div>
          </div>

          {/* Table Card */}
          <Card className="border border-border bg-card backdrop-blur-md rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-[120px] text-xs font-semibold text-muted-foreground">O.S.</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Cliente</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Descrição</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Setor & Etapa Atual</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Última Atualização</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-right">Data de Entrega</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-xs text-muted-foreground">
                        Nenhuma ordem de serviço encontrada com os filtros selecionados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedOrders.map((o) => {
                      const isUrgent = o.urgente || o.urgente_prova || o.urgente_impressao || o.urgente_acabamento || o.urgente_expedicao;
                      const dept = o.setor ? DEPARTMENT_MAP[o.setor as Department] : null;
                      const setorLabel = dept ? dept.label : "Pré-Impressão";
                      const statusLabel = dept
                        ? dept.statuses.find((s) => s.id === o.setor_status)?.label || o.setor_status || "—"
                        : STATUS_CONFIG[o.status as OrderStatus]?.label || o.status || "—";

                      return (
                        <TableRow
                          key={o.id}
                          className={`border-border/60 hover:bg-accent/40 transition-colors ${
                            isUrgent ? "bg-rose-500/5" : ""
                          }`}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1.5">
                              {isUrgent && (
                                <Badge variant="destructive" className="text-[9px] px-1 py-0 font-bold">
                                  URG
                                </Badge>
                              )}
                              <span className="font-mono-tech font-bold text-xs text-foreground">
                                {o.titulo}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-foreground font-medium">
                            {o.cliente || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
                            {o.descricao || "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="font-semibold text-cyan-600 dark:text-cyan-400">{setorLabel}</span>
                            <span className="text-muted-foreground"> / {statusLabel}</span>
                          </TableCell>
                          <TableCell className="text-xs font-mono-tech text-muted-foreground">
                            {format(new Date(o.updated_at), "dd/MM/yyyy HH:mm")}
                          </TableCell>
                          <TableCell className="text-xs font-mono-tech text-right text-foreground">
                            {o.entrega_data_limite ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                {format(new Date(o.entrega_data_limite), "dd/MM/yyyy")}
                              </span>
                            ) : o.prazo ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {format(new Date(o.prazo), "dd/MM/yyyy HH:mm")}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-3 border-t border-border bg-muted/30 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} a{" "}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredProductionOrders.length)} de{" "}
                  {filteredProductionOrders.length} ordens
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    className="h-8 text-xs rounded-xl bg-card border-border text-foreground hover:bg-accent"
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </Button>
                  <span className="text-xs font-mono-tech text-muted-foreground px-2">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    className="h-8 text-xs rounded-xl bg-card border-border text-foreground hover:bg-accent"
                  >
                    Próximo <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* TAB 3: LEAD TIME & PRAZOS */}
        <TabsContent value="sla" className="space-y-6 m-0">
          {/* Últimas OS Liberadas — Tempo Detalhado */}
          <Card className="border border-border bg-card backdrop-blur-md rounded-2xl shadow-xl">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Últimas O.S. Liberadas — Tempo Detalhado por Etapa
                </CardTitle>
                <span className="text-xs text-muted-foreground">Top 10 ordens concluídas</span>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {recentCompleted.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Nenhuma O.S. liberada ainda para exibir timeline.</p>
              ) : (
                <div className="space-y-3">
                  {recentCompleted.map((t) => (
                    <div
                      key={t.orderId}
                      className="p-4 rounded-2xl bg-card border border-border space-y-2.5 hover:border-border/80 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-mono-tech font-bold text-sm text-foreground">{t.titulo}</span>
                          <span className="text-xs text-muted-foreground ml-2">• {t.cliente}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-mono-tech font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
                            <Timer className="h-3.5 w-3.5" />
                            {t.tempoTotal !== null ? formatDuration(t.tempoTotal) : "—"}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title="Exportar PDF desta OS"
                            onClick={() => {
                              exportSingleOrderPDF(t);
                              toast.success(`PDF da O.S. ${t.titulo} exportado!`);
                            }}
                          >
                            <FileDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Steps Journey Chips */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {STATUS_ORDER.map((status, idx) => {
                          const config = STATUS_CONFIG[status];
                          const ms = t.tempoPorStatus[status];
                          if (!ms && ms !== 0) return null;

                          return (
                            <div key={status} className="flex items-center gap-1">
                              {idx > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground mx-0.5" />}
                              <div
                                className="text-[10px] px-2 py-0.5 rounded-lg font-medium border"
                                style={{
                                  backgroundColor: `hsl(var(--status-${config.colorKey}-bg))`,
                                  color: `hsl(var(--status-${config.colorKey}))`,
                                  borderColor: `hsl(var(--status-${config.colorKey}) / 0.3)`,
                                }}
                              >
                                {config.label}: <span className="font-mono-tech font-bold">{formatDuration(ms)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="text-[11px] text-muted-foreground font-mono-tech">
                        Criada em: {format(new Date(t.criadoEm), "dd/MM/yyyy HH:mm")}
                        {t.finalizadoEm && (
                          <> • Concluída em: {format(new Date(t.finalizadoEm), "dd/MM/yyyy HH:mm")}</>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* OS em Andamento — Tempo Acumulado */}
          <Card className="border border-border bg-card backdrop-blur-md rounded-2xl shadow-xl">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-cyan-500" /> O.S. Ativas em Produção — Tempo Acumulado
                </CardTitle>
                <span className="text-xs text-muted-foreground">Top 12 ordens em processamento</span>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {activeTimelines.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Nenhuma O.S. ativa no momento.</p>
              ) : (
                <div className="space-y-3">
                  {activeTimelines.map((t) => {
                    const statusConfig = STATUS_CONFIG[t.statusAtual as OrderStatus];
                    return (
                      <div
                        key={t.orderId}
                        className="p-4 rounded-2xl bg-card border border-border space-y-2.5 hover:border-border/80 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-mono-tech font-bold text-sm text-foreground">{t.titulo}</span>
                            <span className="text-xs text-muted-foreground ml-2">• {t.cliente}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {statusConfig && (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-semibold"
                                style={{
                                  backgroundColor: `hsl(var(--status-${statusConfig.colorKey}-bg))`,
                                  color: `hsl(var(--status-${statusConfig.colorKey}))`,
                                  borderColor: `hsl(var(--status-${statusConfig.colorKey}) / 0.3)`,
                                }}
                              >
                                {statusConfig.label}
                              </Badge>
                            )}
                            <div className="flex items-center gap-1.5 text-xs font-mono-tech font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-xl border border-cyan-500/20">
                              <Timer className="h-3.5 w-3.5" />
                              {t.tempoTotal !== null ? formatDuration(t.tempoTotal) : "—"}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="Exportar PDF desta OS"
                              onClick={() => {
                                exportSingleOrderPDF(t);
                                toast.success(`PDF da O.S. ${t.titulo} exportado!`);
                              }}
                            >
                              <FileDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Steps Journey Chips */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {STATUS_ORDER.map((status, idx) => {
                            const config = STATUS_CONFIG[status];
                            const ms = t.tempoPorStatus[status];
                            if (!ms) return null;

                            return (
                              <div key={status} className="flex items-center gap-1">
                                {idx > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground mx-0.5" />}
                                <div
                                  className="text-[10px] px-2 py-0.5 rounded-lg font-medium border"
                                  style={{
                                    backgroundColor: `hsl(var(--status-${config.colorKey}-bg))`,
                                    color: `hsl(var(--status-${config.colorKey}))`,
                                    borderColor: `hsl(var(--status-${config.colorKey}) / 0.3)`,
                                  }}
                                >
                                  {config.label}: <span className="font-mono-tech font-bold">{formatDuration(ms)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="text-[11px] text-muted-foreground font-mono-tech">
                          Criada em: {format(new Date(t.criadoEm), "dd/MM/yyyy HH:mm")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: MÉTRICAS PRÉ-IMPRESSÃO */}
        <TabsContent value="pre-impressao" className="m-0">
          <PreImpressaoTab />
        </TabsContent>

        {/* TAB 5: AVISOS & COMUNICADOS */}
        <TabsContent value="avisos" className="space-y-4 m-0">
          <Card className="border border-border bg-card backdrop-blur-md rounded-2xl shadow-xl">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Bell className="h-4 w-4 text-cyan-500" /> Registro de Avisos & Comunicados ({avisos.length})
                </CardTitle>
                <span className="text-xs text-muted-foreground">Histórico de comunicações enviadas</span>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {avisosLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-xs font-mono-tech">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-500" /> Carregando avisos...
                </div>
              ) : avisos.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-10">Nenhum aviso registrado no momento.</p>
              ) : (
                <div className="space-y-3">
                  {avisos.map((aviso) => (
                    <div
                      key={aviso.id}
                      className="p-4 rounded-2xl bg-card border border-border space-y-2.5 hover:border-border/80 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={aviso.tipo === "urgente" ? "destructive" : aviso.tipo === "lembrete" ? "secondary" : "default"}
                            className="text-[10px]"
                          >
                            {aviso.tipo === "urgente" ? "🔴 Urgente" : aviso.tipo === "lembrete" ? "🟡 Lembrete" : "ℹ️ Info"}
                          </Badge>
                          <span className="font-semibold text-sm text-foreground">{aviso.titulo}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono-tech text-muted-foreground">
                            {format(new Date(aviso.created_at), "dd/MM/yyyy HH:mm")}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                            onClick={() => handleDeleteAviso(aviso.id)}
                            title="Excluir aviso"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <p className="text-xs text-foreground/90 leading-relaxed">{aviso.mensagem}</p>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1 border-t border-border">
                        <span>Para: <strong className="text-foreground">{aviso.destinatario_id ? (profiles[aviso.destinatario_id] || "Usuário específico") : "📢 Todos"}</strong></span>
                        <span>•</span>
                        <span>Enviado por: <strong className="text-foreground">{profiles[aviso.criado_por] || "Admin"}</strong></span>
                      </div>

                      {/* Read Status View */}
                      {(() => {
                        const leituras = avisosLidos[aviso.id] || [];
                        if (aviso.destinatario_id) {
                          const leu = leituras.find((l) => l.user_id === aviso.destinatario_id);
                          return (
                            <div className="flex items-center gap-1.5 text-xs pt-1">
                              {leu ? (
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono-tech text-[11px]">
                                  <Eye className="h-3 w-3" />
                                  Visualizado em {format(new Date(leu.lido_em), "dd/MM HH:mm")}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-muted-foreground text-[11px]">
                                  <EyeOff className="h-3 w-3" />
                                  Não visualizado ainda
                                </span>
                              )}
                            </div>
                          );
                        } else {
                          const totalUsers = Object.keys(profiles).length;
                          return (
                            <div className="space-y-1 pt-1">
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Eye className="h-3 w-3 text-cyan-500" />
                                <span>Visualizado por {leituras.length}/{totalUsers} usuários</span>
                              </div>
                              {leituras.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {leituras.map((l) => (
                                    <Badge key={l.user_id} variant="outline" className="text-[10px] px-1.5 py-0 bg-muted border-border text-foreground">
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 6: EXPORTAÇÕES & BACKUP */}
        <TabsContent value="backup" className="space-y-6 m-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Exportar PDFs */}
            <Card className="border border-border bg-card backdrop-blur-md rounded-2xl shadow-xl">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileDown className="h-4 w-4 text-cyan-500" /> Exportação de Relatórios PDF
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Gere relatórios impressos ou digitais do fluxo de pré-impressão.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <Button
                  className="w-full gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-xl h-10 shadow-lg"
                  onClick={() => {
                    const active = orders.filter((o) => !o.arquivado);
                    if (active.length === 0) {
                      toast.info("Nenhuma O.S. ativa para exportar");
                      return;
                    }
                    const groups = STATUS_ORDER.map((s) => ({
                      status: s,
                      label: STATUS_CONFIG[s].label,
                      orders: active.filter((o) => o.status === s),
                    }));
                    exportAllColumnsPDF(groups);
                    toast.success("PDF de todas as colunas exportado!");
                  }}
                >
                  <FileDown className="h-4 w-4" />
                  Exportar Todas as Colunas em PDF
                </Button>

                <div className="grid grid-cols-2 gap-2.5">
                  {STATUS_ORDER.map((status) => {
                    const config = STATUS_CONFIG[status];
                    const statusOrders = orders.filter((o) => o.status === status && !o.arquivado);
                    return (
                      <Button
                        key={status}
                        variant="outline"
                        className="justify-start gap-2 h-auto py-2.5 px-3 rounded-xl bg-card border-border hover:bg-accent text-left"
                        onClick={() => {
                          if (statusOrders.length === 0) {
                            toast.info(`Nenhuma O.S. em "${config.label}"`);
                            return;
                          }
                          exportColumnPDF(statusOrders, config.label);
                          toast.success(`PDF "${config.label}" exportado!`);
                        }}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: `hsl(var(--status-${config.colorKey}))` }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground truncate">{config.label}</div>
                          <div className="text-[10px] text-muted-foreground font-mono-tech">{statusOrders.length} ordens</div>
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Backup do Banco de Dados */}
            <Card className="border border-border bg-card backdrop-blur-md rounded-2xl shadow-xl">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <DatabaseBackup className="h-4 w-4 text-emerald-500" /> Backup & Restauração do Sistema
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Exporte cópia completa da base de dados em JSON ou restaure um backup anterior.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-4 w-4" /> Segurança dos Dados Primacor
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    O arquivo gerado inclui todas as Ordens de Serviço, perfis, histórico de movimentações, avisos e configurações em formato estruturado.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <Button
                    className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-10 font-semibold"
                    onClick={handleBackup}
                    disabled={backupLoading || restoreLoading}
                  >
                    {backupLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" /> : <Download className="h-4 w-4 text-primary-foreground" />}
                    {backupLoading ? "Gerando Backup..." : "Baixar Backup (JSON)"}
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
                    variant="outline"
                    className="flex-1 gap-2 bg-card border-border hover:bg-accent text-foreground rounded-xl h-10 font-semibold"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={backupLoading || restoreLoading}
                  >
                    {restoreLoading ? <Loader2 className="h-4 w-4 animate-spin text-emerald-500" /> : <Upload className="h-4 w-4 text-emerald-500" />}
                    {restoreLoading ? "Restaurando..." : "Restaurar Backup"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
