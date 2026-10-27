import { Order, STATUS_CONFIG, STATUS_ORDER, OrderStatus } from "@/types/order";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart3, ClipboardList, Clock, TrendingUp, Archive, Timer, CheckCircle2, ShoppingBag, RotateCcw,
  ArrowRight, FileDown, DatabaseBackup, Loader2, Upload, AlertTriangle,
  Printer, CalendarClock, History, Bell, Trash2, Info, Square,
  PrinterCheck, Layers, Truck, List, Eye, EyeOff, Search, Filter,
  ChevronLeft, ChevronRight, Activity, ShieldCheck, Sparkles, RefreshCw, X, Download, Check, Palette, ShoppingCart, Factory
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PreImpressaoTab } from "./PreImpressaoTab";
import { OrderDetailDialog } from "./OrderDetailDialog";
import { getOrderRevision, cleanObservationRevision } from "@/lib/orderRevision";
import { OffsetIcon } from "./icons/OffsetIcon";
import { DEPARTMENTS, EXPEDICAO_DEPARTMENT, COMPRAS_DEPARTMENT, Department, DEPARTMENT_MAP } from "@/types/production";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrderAnalytics, formatDuration } from "@/hooks/useOrderAnalytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportSingleOrderPDF, exportFullAnalyticsPDF, exportColumnPDF, exportAllColumnsPDF } from "@/lib/pdfExport";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useState, useRef, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import {
  SPECIAL_SUPPLIES,
  isSpecialSupplyActive,
  isSpecialSupplySent,
  getSpecialSupplyCustomText,
  getSpecialSupplyDetails,
  SpecialSupplyId,
  hasSpecialSuppliesForCompras,
  formatSafeDate,
  parseSafeDate,
} from "@/lib/processos";

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

  // Suprimentos especiais (PANTONE, FACA, CLICHÊ)
  const [supplySearch, setSupplySearch] = useState("");
  const [supplyTypeFilter, setSupplyTypeFilter] = useState<string>("all");
  const [supplyStatusFilter, setSupplyStatusFilter] = useState<string>("all");

  // Governança e Auditoria das Mudanças Recentes (REVs, Compras, Trava de Saída)
  const [governancaSubFilter, setGovernancaSubFilter] = useState<"all" | "revisoes" | "compras" | "saida_travas">("all");
  const [governancaSearch, setGovernancaSearch] = useState("");

  // Avisos management
  const [avisos, setAvisos] = useState<any[]>([]);
  const [avisosLoading, setAvisosLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [provasTodayCount, setProvasTodayCount] = useState(0);
  const [novoArquivoTodayCount, setNovoArquivoTodayCount] = useState(0);
  const [avisosLidos, setAvisosLidos] = useState<Record<string, { user_id: string; lido_em: string }[]>>({});

  // Home Live Radar states
  const [homeSearchTerm, setHomeSearchTerm] = useState("");
  const [homePage, setHomePage] = useState(1);
  const HOME_ITEMS_PER_PAGE = 7;
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);

  const handleUpdateOrderForDetail = async (id: string, data: Partial<Order>) => {
    const { error } = await supabase.from("orders").update(data).eq("id", id);
    if (error) {
      toast.error("Erro ao atualizar ordem: " + error.message);
    } else {
      toast.success("Ordem atualizada!");
      setSelectedOrderForDetail((prev) => (prev && prev.id === id ? { ...prev, ...data } : prev));
    }
  };

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
    return activeNonArchived.filter((o) => !o.setor || !["qualidade", "ctp", "digital", "expedicao", "compras", "manutencao"].includes(o.setor));
  }, [activeNonArchived]);

  const sectorCounts = useMemo(() => {
    const chaoDeFabrica = activeNonArchived.filter(
      (o) => o.setor && !["compras", "manutencao", "qualidade", "ctp", "digital", "expedicao"].includes(o.setor) && o.setor_status !== "saida"
    ).length;
    const ctp = activeNonArchived.filter((o) => o.setor === "ctp" && o.setor_status !== "saida").length;
    const digital = activeNonArchived.filter((o) => o.setor === "digital" && o.setor_status !== "saida").length;
    const qualidade = activeNonArchived.filter((o) => o.setor === "qualidade" && o.setor_status !== "saida").length;
    const expedicao = activeNonArchived.filter((o) => o.setor === "expedicao" && o.setor_status !== "saida").length;
    const compras = activeNonArchived.filter((o) => o.setor === "compras" && o.setor_status !== "saida").length;
    return {
      pre_impressao: preImpressaoOrders.length,
      chao_de_fabrica: chaoDeFabrica,
      ctp,
      digital,
      qualidade,
      expedicao,
      compras,
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

  // Urgent orders
  const urgentOrders = useMemo(() => {
    return activeNonArchived.filter(
      (o) => o.urgente || o.urgente_impressao || o.urgente_acabamento || o.urgente_expedicao
    );
  }, [activeNonArchived]);

  // Filtered orders for Home Live Radar
  const filteredHomeOrders = useMemo(() => {
    let list = activeNonArchived;
    if (homeSearchTerm.trim()) {
      const q = homeSearchTerm.toLowerCase();
      list = list.filter((o) =>
        o.titulo?.toLowerCase().includes(q) ||
        o.cliente?.toLowerCase().includes(q) ||
        o.descricao?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const aUrg = !!(a.urgente || a.urgente_impressao || a.urgente_acabamento || a.urgente_expedicao);
      const bUrg = !!(b.urgente || b.urgente_impressao || b.urgente_acabamento || b.urgente_expedicao);
      if (aUrg && !bUrg) return -1;
      if (!aUrg && bUrg) return 1;
      if (a.prazo && b.prazo) return new Date(a.prazo).getTime() - new Date(b.prazo).getTime();
      if (a.prazo) return -1;
      if (b.prazo) return 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [activeNonArchived, homeSearchTerm]);

  const totalHomePages = useMemo(() => Math.ceil(filteredHomeOrders.length / HOME_ITEMS_PER_PAGE) || 1, [filteredHomeOrders]);

  const paginatedHomeOrders = useMemo(() => {
    const start = (homePage - 1) * HOME_ITEMS_PER_PAGE;
    return filteredHomeOrders.slice(start, start + HOME_ITEMS_PER_PAGE);
  }, [filteredHomeOrders, homePage]);

  // Production floor filtered list
  const filteredProductionOrders = useMemo(() => {
    let list = activeNonArchived.filter((o) => {
      // Must be a production order
      if (o.setor === "compras") {
        return o.setor_status !== "saida";
      }
      if (o.setor) {
        return o.setor_status !== "saida" && !o.parent_order_id;
      } else {
        return o.status !== "arquivo_liberado" && !o.parent_order_id;
      }
    });

    // Sector filter
    if (selectedSector === "pre_impressao") {
      list = list.filter((o) => !o.setor || !["qualidade", "ctp", "digital", "expedicao", "compras", "manutencao"].includes(o.setor));
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

  // Registros de Telemetria de Suprimentos Especiais (PANTONE, FACA, CLICHÊ)
  const specialSupplyRecords = useMemo(() => {
    const list: Array<{
      orderId: string;
      titulo: string;
      cliente: string;
      descricao?: string | null;
      supplyId: SpecialSupplyId;
      supplyLabel: string;
      sent: boolean;
      sentAt: string | null;
      createdAt: string;
      operator: string | null;
      status: string;
    }> = [];

    orders.forEach((o) => {
      SPECIAL_SUPPLIES.forEach((supply) => {
        if (isSpecialSupplyActive(o.processos, supply.id)) {
          const details = getSpecialSupplyDetails(o.processos, supply.id);
          list.push({
            orderId: o.id,
            titulo: o.titulo,
            cliente: o.cliente,
            descricao: o.descricao,
            supplyId: supply.id,
            supplyLabel: supply.label,
            sent: details.sent,
            sentAt: details.sentAt,
            createdAt: o.created_at,
            operator: details.operator || o.operador || null,
            status: o.status,
          });
        }
      });
    });

    return list.sort((a, b) => {
      const dateA = parseSafeDate(a.sentAt) || parseSafeDate(a.createdAt) || new Date(0);
      const dateB = parseSafeDate(b.sentAt) || parseSafeDate(b.createdAt) || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });
  }, [orders]);

  const filteredSupplyRecords = useMemo(() => {
    return specialSupplyRecords.filter((r) => {
      if (supplyTypeFilter !== "all" && r.supplyId !== supplyTypeFilter) return false;
      if (supplyStatusFilter === "sent" && !r.sent) return false;
      if (supplyStatusFilter === "pending" && r.sent) return false;
      if (supplySearch.trim()) {
        const q = supplySearch.toLowerCase();
        return (
          r.titulo.toLowerCase().includes(q) ||
          r.cliente.toLowerCase().includes(q) ||
          (r.descricao && r.descricao.toLowerCase().includes(q)) ||
          r.supplyLabel.toLowerCase().includes(q) ||
          (r.operator && r.operator.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [specialSupplyRecords, supplyTypeFilter, supplyStatusFilter, supplySearch]);

  const supplyStats = useMemo(() => {
    const total = specialSupplyRecords.length;
    const sent = specialSupplyRecords.filter((r) => r.sent).length;
    const pending = total - sent;

    const pantoneTotal = specialSupplyRecords.filter((r) => r.supplyId === "PANTONE").length;
    const pantoneSent = specialSupplyRecords.filter((r) => r.supplyId === "PANTONE" && r.sent).length;

    const facaTotal = specialSupplyRecords.filter((r) => r.supplyId === "FACA").length;
    const facaSent = specialSupplyRecords.filter((r) => r.supplyId === "FACA" && r.sent).length;

    const clicheTotal = specialSupplyRecords.filter((r) => r.supplyId === "CLICHE").length;
    const clicheSent = specialSupplyRecords.filter((r) => r.supplyId === "CLICHE" && r.sent).length;

    return {
      total,
      sent,
      pending,
      pantone: { total: pantoneTotal, sent: pantoneSent, pending: pantoneTotal - pantoneSent },
      faca: { total: facaTotal, sent: facaSent, pending: facaTotal - facaSent },
      cliche: { total: clicheTotal, sent: clicheSent, pending: clicheTotal - clicheSent },
    };
  }, [specialSupplyRecords]);

  const handleExportSupplyCSV = () => {
    if (filteredSupplyRecords.length === 0) {
      toast.info("Nenhum registro para exportar.");
      return;
    }
    const headers = ["O.S.", "Cliente", "Suprimento", "Status", "Data_Aprovacao", "Horario_Aprovacao", "Operador_Responsavel", "Data_Criacao_OS"];
    const rows = filteredSupplyRecords.map((r) => [
      `#${r.titulo}`,
      `"${(r.cliente || "").replace(/"/g, '""')}"`,
      r.supplyLabel,
      r.sent ? "ENVIADO / APROVADO" : "PENDENTE",
      r.sent && r.sentAt ? (formatSafeDate(r.sentAt, "dd/MM/yyyy") || "Registrado") : (r.sent ? "Registrado" : "Pendente"),
      r.sent && r.sentAt ? (formatSafeDate(r.sentAt, "HH:mm:ss") || "—") : "—",
      `"${(r.operator || "—").replace(/"/g, '""')}"`,
      formatSafeDate(r.createdAt, "dd/MM/yyyy HH:mm") || "—"
    ]);
    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((row) => row.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `telemetria_suprimentos_${format(new Date(), "yyyyMMdd_HHmm")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Relatório de suprimentos exportado com sucesso!");
  };

  // ═══ GOVERNANÇA: CONTROLE DE REVISÕES (REVS - RETRABALHOS) ═══
  const revisionOrders = useMemo(() => {
    return orders
      .filter((o) => !o.arquivado && getOrderRevision(o) >= 2)
      .map((o) => {
        const revNumber = getOrderRevision(o);
        const cleanObs = cleanObservationRevision(o.observacao);
        return {
          order: o,
          revNumber,
          cleanObs,
        };
      })
      .sort((a, b) => b.revNumber - a.revNumber || new Date(b.order.updated_at).getTime() - new Date(a.order.updated_at).getTime());
  }, [orders]);

  const rev2Count = useMemo(() => revisionOrders.filter((r) => r.revNumber === 2).length, [revisionOrders]);
  const rev3PlusCount = useMemo(() => revisionOrders.filter((r) => r.revNumber >= 3).length, [revisionOrders]);

  // ═══ GOVERNANÇA: CENTRAL DE COMPRAS INTEGRADA (PANTONES & OUTROS) ═══
  const comprasOrders = useMemo(() => {
    return orders
      .filter((o) => !o.arquivado && o.setor === "compras" && (!o.parent_order_id || hasSpecialSuppliesForCompras(o.processos)))
      .map((o) => {
        const pantoneActive = isSpecialSupplyActive(o.processos, "PANTONE");
        const pantoneSent = isSpecialSupplySent(o.processos, "PANTONE");
        const pantoneText = getSpecialSupplyCustomText(o.processos, "PANTONE");

        const outrosActive = isSpecialSupplyActive(o.processos, "OUTROS");
        const outrosSent = isSpecialSupplySent(o.processos, "OUTROS");
        const outrosText = getSpecialSupplyCustomText(o.processos, "OUTROS");

        const facaActive = isSpecialSupplyActive(o.processos, "FACA");
        const facaSent = isSpecialSupplySent(o.processos, "FACA");

        const clicheActive = isSpecialSupplyActive(o.processos, "CLICHE");
        const clicheSent = isSpecialSupplySent(o.processos, "CLICHE");

        const hasItemsToBuy = pantoneActive || outrosActive;
        const isExplicitComprado = o.processos?.some(
          (p) => p === "COMPRADO" || p.startsWith("COMPRADO:") || p === "COMPRA:ok" || p.startsWith("COMPRA:ok:")
        );
        const isComprado = isExplicitComprado || (hasItemsToBuy && (!pantoneActive || pantoneSent) && (!outrosActive || outrosSent));

        return {
          order: o,
          pantoneActive,
          pantoneSent,
          pantoneText,
          outrosActive,
          outrosSent,
          outrosText,
          facaActive,
          facaSent,
          clicheActive,
          clicheSent,
          isComprado,
          isFinalizado: o.setor_status === "saida",
        };
      })
      .sort((a, b) => new Date(b.order.updated_at).getTime() - new Date(a.order.updated_at).getTime());
  }, [orders]);

  const comprasStats = useMemo(() => {
    const total = comprasOrders.length;
    const comprados = comprasOrders.filter((c) => c.isComprado).length;
    const pendentes = total - comprados;
    const pantoneCount = comprasOrders.filter((c) => c.pantoneActive).length;
    const outrosCount = comprasOrders.filter((c) => c.outrosActive).length;
    return { total, comprados, pendentes, pantoneCount, outrosCount };
  }, [comprasOrders]);

  // ═══ GOVERNANÇA: AUDITORIA DA TRAVA DE SAÍDA (FACA & CLICHÊ) ═══
  const saidaOrders = useMemo(() => {
    return orders
      .filter((o) => !o.arquivado && (o.status === "arquivo_liberado" || o.setor_status === "saida"))
      .map((o) => {
        const facaActive = isSpecialSupplyActive(o.processos, "FACA");
        const facaSent = isSpecialSupplySent(o.processos, "FACA");
        const clicheActive = isSpecialSupplyActive(o.processos, "CLICHE");
        const clicheSent = isSpecialSupplySent(o.processos, "CLICHE");
        const pantoneActive = isSpecialSupplyActive(o.processos, "PANTONE");
        const pantoneSent = isSpecialSupplySent(o.processos, "PANTONE");

        const requiredAny = facaActive || clicheActive;
        const allSent = (!facaActive || facaSent) && (!clicheActive || clicheSent);

        return {
          order: o,
          facaActive,
          facaSent,
          clicheActive,
          clicheSent,
          pantoneActive,
          pantoneSent,
          requiredAny,
          allSent,
        };
      })
      .sort((a, b) => new Date(b.order.updated_at).getTime() - new Date(a.order.updated_at).getTime());
  }, [orders]);

  const saidaWithToolsCount = useMemo(() => saidaOrders.filter((s) => s.requiredAny).length, [saidaOrders]);

  // Filtros de busca da aba Governança
  const filteredRevisionOrders = useMemo(() => {
    let list = revisionOrders;
    if (governancaSearch.trim()) {
      const q = governancaSearch.toLowerCase();
      list = list.filter((r) =>
        r.order.titulo.toLowerCase().includes(q) ||
        (r.order.cliente && r.order.cliente.toLowerCase().includes(q)) ||
        (r.order.descricao && r.order.descricao.toLowerCase().includes(q)) ||
        (r.cleanObs && r.cleanObs.toLowerCase().includes(q)) ||
        (r.order.vendedor && r.order.vendedor.toLowerCase().includes(q)) ||
        (r.order.operador && r.order.operador.toLowerCase().includes(q))
      );
    }
    return list;
  }, [revisionOrders, governancaSearch]);

  const filteredComprasOrders = useMemo(() => {
    let list = comprasOrders;
    if (governancaSearch.trim()) {
      const q = governancaSearch.toLowerCase();
      list = list.filter((c) =>
        c.order.titulo.toLowerCase().includes(q) ||
        (c.order.cliente && c.order.cliente.toLowerCase().includes(q)) ||
        (c.order.descricao && c.order.descricao.toLowerCase().includes(q)) ||
        (c.pantoneText && c.pantoneText.toLowerCase().includes(q)) ||
        (c.outrosText && c.outrosText.toLowerCase().includes(q)) ||
        (c.order.responsavel_compra && String(c.order.responsavel_compra).toLowerCase().includes(q)) ||
        (c.order.fornecedor_compra && String(c.order.fornecedor_compra).toLowerCase().includes(q))
      );
    }
    return list;
  }, [comprasOrders, governancaSearch]);

  const filteredSaidaOrders = useMemo(() => {
    let list = saidaOrders;
    if (governancaSearch.trim()) {
      const q = governancaSearch.toLowerCase();
      list = list.filter((s) =>
        s.order.titulo.toLowerCase().includes(q) ||
        (s.order.cliente && s.order.cliente.toLowerCase().includes(q)) ||
        (s.order.descricao && s.order.descricao.toLowerCase().includes(q)) ||
        (s.order.operador && s.order.operador.toLowerCase().includes(q))
      );
    }
    return list;
  }, [saidaOrders, governancaSearch]);

  const handleExportGovernancaCSV = () => {
    const rows: string[][] = [];
    rows.push(["TIPO", "O.S.", "CLIENTE", "STATUS_OU_ETAPA", "DETALHES_MUDANCA", "OPERADOR_OU_RESPONSAVEL", "VENDEDOR", "DATA_ATUALIZACAO"]);

    revisionOrders.forEach((r) => {
      rows.push([
        "RETRABALHO_REVISAO",
        `#${r.order.titulo}`,
        `"${(r.order.cliente || "").toUpperCase().replace(/"/g, '""')}"`,
        r.order.status || r.order.setor_status || "—",
        `"REV ${r.revNumber} - ${(r.cleanObs || "Sem observação").replace(/"/g, '""')}"`,
        `"${(r.order.operador || "—").replace(/"/g, '""')}"`,
        `"${(r.order.vendedor || "—").replace(/"/g, '""')}"`,
        formatSafeDate(r.order.updated_at, "dd/MM/yyyy HH:mm") || "—",
      ]);
    });

    comprasOrders.forEach((c) => {
      const itens: string[] = [];
      if (c.pantoneActive) itens.push(`Pantone: ${c.pantoneText || "Sim"}`);
      if (c.outrosActive) itens.push(`Outros: ${c.outrosText || "Sim"}`);
      rows.push([
        "COMPRAS_INTEGRADA",
        `#${c.order.titulo}`,
        `"${(c.order.cliente || "").toUpperCase().replace(/"/g, '""')}"`,
        c.isComprado ? "COMPRADO (VERDE)" : "PENDENTE DE COMPRA",
        `"${itens.join(" | ") || "Sem itens específicos"}"`,
        `"${(c.order.responsavel_compra || c.order.operador || "Compras").replace(/"/g, '""')}"`,
        `"${(c.order.vendedor_compra || c.order.vendedor || "—").replace(/"/g, '""')}"`,
        formatSafeDate(c.order.updated_at, "dd/MM/yyyy HH:mm") || "—",
      ]);
    });

    saidaOrders.slice(0, 50).forEach((s) => {
      rows.push([
        "TRAVA_SAIDA_FERRAMENTAL",
        `#${s.order.titulo}`,
        `"${(s.order.cliente || "").toUpperCase().replace(/"/g, '""')}"`,
        "SAIDA_LIBERADA",
        `"Faca: ${s.facaActive ? (s.facaSent ? "Enviada" : "Pendente") : "N/A"} | Clichê: ${s.clicheActive ? (s.clicheSent ? "Enviado" : "N/A") : "N/A"}"`,
        `"${(s.order.operador || "—").replace(/"/g, '""')}"`,
        `"${(s.order.vendedor || "—").replace(/"/g, '""')}"`,
        formatSafeDate(s.order.updated_at, "dd/MM/yyyy HH:mm") || "—",
      ]);
    });

    const csvContent = "\uFEFF" + rows.map((row) => row.join(";")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `auditoria_governanca_mudancas_${format(new Date(), "yyyyMMdd_HHmm")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Relatório de Governança e Auditoria exportado com sucesso!");
  };

  const dashboardContainerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.07,
        delayChildren: 0.03,
      },
    },
  };

  const dashboardItemVariants = {
    hidden: { opacity: 0, y: 14 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 380,
        damping: 26,
      },
    },
  };

  return (
    <motion.div
      variants={dashboardContainerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 w-full max-w-none px-1 sm:px-2 pb-12 relative"
    >
      {/* Ambient Glassmorphism Refraction Glow (using image palette #06141B, #11212D, #253745, #4A5C6A, #9BA8AB, #CCD0CF) */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
        <div className="absolute -top-32 left-1/4 h-[440px] w-[440px] rounded-full bg-[#253745]/30 dark:bg-[#11212D]/80 blur-[120px] opacity-70" />
        <div className="absolute top-1/3 right-4 h-[400px] w-[400px] rounded-full bg-[#4A5C6A]/25 dark:bg-[#253745]/40 blur-[110px] opacity-65" />
        <div className="absolute -bottom-20 left-10 h-[380px] w-[380px] rounded-full bg-[#9BA8AB]/20 dark:bg-[#06141B]/60 blur-[100px] opacity-50" />
      </div>

      {/* Executive Telemetry Header - Modern SaaS Minimalist Glassmorphic */}
      <motion.div
        variants={dashboardItemVariants}
        className="glass-bento p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3.5">
          <div className="relative p-2.5 rounded-xl bg-[#253745]/60 border border-[#4A5C6A]/50 text-[#CCD0CF] backdrop-blur-md">
            <BarChart3 className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground font-sans">
                Painel Administrador
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Primacor OS • Monitoramento em tempo real do fluxo gráfico e chão de fábrica
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-background/80 hover:bg-muted text-foreground text-xs h-8 rounded-lg border-border/80 saas-interactive shadow-xs backdrop-blur-md cursor-pointer"
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
              <FileDown className="h-3.5 w-3.5 text-[#9BA8AB] dark:text-[#CCD0CF]" />
              <span>Relatório PDF</span>
            </Button>
          </motion.div>

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-background/80 hover:bg-muted text-foreground text-xs h-8 rounded-lg border-border/80 saas-interactive shadow-xs backdrop-blur-md cursor-pointer"
              onClick={handleBackup}
              disabled={backupLoading}
            >
              {backupLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#CCD0CF]" />
              ) : (
                <DatabaseBackup className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              <span>{backupLoading ? "Gerando..." : "Backup JSON"}</span>
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Executive Command Bento Grid - 4 High-Impact SaaS Modules */}
      <motion.div variants={dashboardItemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Module 1: Saúde Operacional & Eficiência */}
        <motion.div
          whileHover={{ y: -4, scale: 1.008 }}
          transition={{ type: "spring", stiffness: 350, damping: 24 }}
          className="glass-bento p-5 flex flex-col justify-between group cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Saúde Operacional
            </span>
            <div className="p-2 rounded-xl bg-[#253745]/50 text-[#CCD0CF] border border-[#4A5C6A]/40 backdrop-blur-md">
              <Activity className="h-4 w-4" />
            </div>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono-tech text-foreground tracking-tight">
                {total > 0 ? Math.round(((total - criticalDeadlines.length) / total) * 100) : 100}%
              </span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                no prazo
              </span>
            </div>
            <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden mt-2.5">
              <div
                className="h-full bg-gradient-to-r from-[#9BA8AB] to-[#CCD0CF] rounded-full transition-all duration-700 shadow-sm"
                style={{ width: `${total > 0 ? Math.round(((total - criticalDeadlines.length) / total) * 100) : 100}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/60">
            <span>{total} ativas na fábrica</span>
            <span className="font-mono-tech font-bold text-foreground">+{todayOrders} hoje</span>
          </div>
        </motion.div>

        {/* Module 2: Radar de Atenção & Gargalos */}
        <motion.div
          whileHover={{ y: -4, scale: 1.008 }}
          transition={{ type: "spring", stiffness: 350, damping: 24 }}
          className="glass-bento p-5 flex flex-col justify-between group cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Atenção & Gargalos
            </span>
            <div className="p-2 rounded-xl bg-rose-500/10 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20 backdrop-blur-md">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>

          <div className="my-2.5 grid grid-cols-2 gap-2">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => { setActiveTab("producao"); setOnlyUrgent(true); }}
              className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/25 transition-all text-left group cursor-pointer backdrop-blur-sm"
            >
              <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold uppercase">Urgentes</div>
              <div className="text-xl font-bold font-mono-tech text-rose-600 dark:text-rose-300">
                {urgentOrders.length}
              </div>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => { setActiveTab("sla"); }}
              className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 transition-all text-left group cursor-pointer backdrop-blur-sm"
            >
              <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase">Prazo Crítico</div>
              <div className="text-xl font-bold font-mono-tech text-amber-600 dark:text-amber-300">
                {criticalDeadlines.length}
              </div>
            </motion.button>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/60">
            <span>Ajuste Arquivo: <strong className="font-mono-tech text-foreground">{novoArquivoTodayCount}</strong></span>
            <span className="text-rose-600 dark:text-rose-400 font-semibold">{urgentOrders.length > 0 ? "Ação Requerida" : "Normal"}</span>
          </div>
        </motion.div>

        {/* Module 3: Pipeline de Fluxo Setorial */}
        <motion.div
          whileHover={{ y: -4, scale: 1.008 }}
          transition={{ type: "spring", stiffness: 350, damping: 24 }}
          className="glass-bento p-5 flex flex-col justify-between group cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Fluxo Industrial
            </span>
            <div className="p-2 rounded-xl bg-violet-500/10 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/20 backdrop-blur-md">
              <Factory className="h-4 w-4" />
            </div>
          </div>

          <div className="my-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Pré-Impressão</span>
              <span className="font-mono-tech font-bold text-foreground">{sectorCounts.pre_impressao}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Chão de Fábrica</span>
              <span className="font-mono-tech font-bold text-foreground">{sectorCounts.chao_de_fabrica}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Qualidade & Expedição</span>
              <span className="font-mono-tech font-bold text-foreground">{sectorCounts.qualidade + sectorCounts.expedicao}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/60">
            <span>Saídas hoje: <strong className="font-mono-tech text-emerald-600 dark:text-emerald-400">+{completedTodayOrders.length}</strong></span>
            <button onClick={() => setActiveTab("producao")} className="text-primary hover:underline text-[11px] font-medium cursor-pointer">Ver tudo →</button>
          </div>
        </motion.div>

        {/* Module 4: Governança & Suprimentos */}
        <motion.div
          whileHover={{ y: -4, scale: 1.008 }}
          transition={{ type: "spring", stiffness: 350, damping: 24 }}
          className="glass-bento p-5 flex flex-col justify-between group cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Governança & Suprimentos
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 backdrop-blur-md">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>

          <div className="my-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Revisões (REV 2+)</span>
              <span className={`font-mono-tech font-bold ${revisionOrders.length > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
                {revisionOrders.length}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Trava de Saída</span>
              <span className="font-mono-tech font-bold text-emerald-600 dark:text-emerald-400">
                100% Auditada
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Suprimentos Aprovados</span>
              <span className="font-mono-tech font-bold text-foreground">
                {supplyStats.sent}/{supplyStats.total}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/60">
            <span>Compras: <strong className="font-mono-tech text-foreground">{comprasStats.pendentes} pend.</strong></span>
            <button onClick={() => setActiveTab("governanca")} className="text-primary hover:underline text-[11px] font-medium cursor-pointer">Auditar →</button>
          </div>
        </motion.div>
      </motion.div>

      {/* Structured Executive Navigation Tabs - Animated Framer Motion Segmented Control */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <motion.div variants={dashboardItemVariants} className="glass-bento p-1.5 w-full overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-none py-0.5 w-full">
            {[
              { id: "geral", label: "Visão Geral", icon: Activity },
              { id: "producao", label: "Chão de Fábrica", icon: Factory, count: filteredProductionOrders.length },
              { id: "governanca", label: "Governança & REVs", icon: ShieldCheck, badge: revisionOrders.length > 0 ? `${revisionOrders.length} REV` : undefined },
              { id: "sla", label: "Lead Time & SLA", icon: Timer },
              { id: "pre-impressao", label: "Métricas Pré-Impressão", icon: BarChart3 },
              { id: "suprimentos", label: "Suprimentos", icon: Layers, badge: `${supplyStats.sent}/${supplyStats.total}` },
              { id: "avisos", label: "Avisos", icon: Bell, count: avisos.length },
              { id: "backup", label: "Backup & Exportações", icon: DatabaseBackup },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              const TabIcon = tab.icon;
              return (
                <motion.button
                  key={tab.id}
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative px-3 py-2 rounded-xl text-xs font-semibold transition-colors duration-150 flex items-center gap-2 select-none shrink-0 cursor-pointer ${
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="dashboard-tab-active-indicator"
                      className="absolute inset-0 rounded-xl bg-background/95 dark:bg-[#11212D]/90 border border-border shadow-xs dark:shadow-[0_2px_12px_rgba(0,0,0,0.4)] backdrop-blur-md"
                      transition={{ type: "spring", stiffness: 450, damping: 32 }}
                    />
                  )}
                  <TabIcon className={`h-3.5 w-3.5 relative z-10 transition-colors ${isActive ? "text-[#CCD0CF]" : "text-muted-foreground"}`} />
                  <span className="relative z-10 whitespace-nowrap">{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`relative z-10 text-[10px] px-1.5 py-0.2 rounded-full font-mono-tech ${
                        isActive
                          ? "bg-[#253745] text-[#CCD0CF] font-bold"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                  {tab.badge && (
                    <span
                      className={`relative z-10 text-[10px] px-1.5 py-0.2 rounded-full font-mono-tech ${
                        isActive
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* TAB 1: VISÃO GERAL & GARGALOS */}
        <TabsContent value="geral" className="space-y-6 m-0 focus-visible:outline-none">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="space-y-6"
          >
          {/* Critical Deadlines Alert Banner - Sleek Minimalist */}
          {criticalDeadlines.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/20 text-rose-500 shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-rose-600 dark:text-rose-300">
                    Atenção: {criticalDeadlines.length} {criticalDeadlines.length === 1 ? "Ordem com Prazo Crítico" : "Ordens com Prazos Críticos"}
                  </h4>
                  <p className="text-[11px] text-rose-600/80 dark:text-rose-300/80 mt-0.5">
                    Ordens atrasadas ou que vencem em menos de 2 horas requerem prioridade imediata no fluxo.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveTab("sla")}
                className="bg-rose-500/15 border-rose-500/30 hover:bg-rose-500/25 text-rose-700 dark:text-rose-200 text-xs h-8 rounded-lg shrink-0 saas-interactive"
              >
                Ver no SLA
              </Button>
            </div>
          )}

          {/* Radar de Ordens no Fluxo em Tempo Real (Live Factory Radar) */}
          <div className="glass-bento p-5 w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border/60 gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#253745]/50 text-[#CCD0CF] border border-[#4A5C6A]/40">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-foreground tracking-tight">
                      Radar de Ordens no Fluxo em Tempo Real
                    </h3>
                    <span className="text-[10px] font-mono-tech px-2 py-0.5 rounded-full bg-[#253745] text-[#CCD0CF] font-bold border border-[#4A5C6A]/40">
                      {filteredHomeOrders.length} ativas
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Acompanhamento instantâneo de ordens em Pré-Impressão e Chão de Fábrica
                  </p>
                </div>
              </div>

              {/* Quick Search & Grid Link */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar O.S., cliente..."
                    value={homeSearchTerm}
                    onChange={(e) => {
                      setHomeSearchTerm(e.target.value);
                      setHomePage(1);
                    }}
                    className="pl-8 pr-3 bg-background border-input h-8 text-xs rounded-lg w-40 sm:w-56"
                  />
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("producao")}
                  className="text-xs h-8 rounded-lg border-border/80 hover:bg-muted text-foreground saas-interactive"
                >
                  Chão de Fábrica ({filteredProductionOrders.length}) →
                </Button>
              </div>
            </div>

            {/* Live Orders Table */}
            <div className="mt-3 overflow-x-auto scrollbar-none">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60 hover:bg-transparent">
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-2.5">O.S. / Título</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-2.5">Cliente</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-2.5">Etapa / Setor</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-2.5">Prazo / SLA</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-2.5">Prioridade</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground py-2.5 text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedHomeOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                        Nenhuma ordem encontrada para os filtros aplicados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedHomeOrders.map((o) => {
                      const isUrg = !!(o.urgente || o.urgente_impressao || o.urgente_acabamento || o.urgente_expedicao);
                      const deadline = o.prazo ? new Date(o.prazo) : null;
                      const remaining = deadline ? deadline.getTime() - Date.now() : null;
                      const isOverdue = remaining !== null && remaining < 0;
                      const isCritical = remaining !== null && remaining > 0 && remaining < 7200000;
                      const statusConfig = o.status ? STATUS_CONFIG[o.status as OrderStatus] : null;

                      return (
                        <TableRow
                          key={`home-order-${o.id}`}
                          onClick={() => setSelectedOrderForDetail(o)}
                          className="border-border/50 hover:bg-muted/40 transition-colors cursor-pointer group"
                        >
                          <TableCell className="py-2.5 font-mono-tech font-bold text-xs text-foreground group-hover:text-[#CCD0CF] transition-colors">
                            #{o.titulo}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span className="text-xs font-semibold text-foreground truncate max-w-[200px] block uppercase">
                              {o.cliente || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                              o.setor
                                ? "bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/25"
                                : "bg-[#253745]/50 text-[#CCD0CF] border-[#4A5C6A]/40"
                            }`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              {o.setor ? (DEPARTMENT_MAP[o.setor]?.label || o.setor) : (statusConfig?.label || "Pré-Impressão")}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5">
                            {deadline ? (
                              <span className={`text-[11px] font-mono-tech font-semibold px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${
                                isOverdue
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                  : isCritical
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                  : "bg-muted text-muted-foreground border-border/60"
                              }`}>
                                <Clock className="h-3 w-3" />
                                {format(deadline, "dd/MM HH:mm")}
                                {isOverdue && " (Atrasado)"}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/60">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5">
                            {isUrg ? (
                              <span className="saas-pill bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-bold animate-pulse">
                                URGENTE
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground font-medium">Normal</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground group-hover:text-foreground group-hover:bg-[#253745] rounded-lg"
                              title="Inspecionar O.S."
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {totalHomePages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-border/60 text-xs text-muted-foreground">
                <span>Página {homePage} de {totalHomePages}</span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={homePage <= 1}
                    onClick={() => setHomePage((p) => Math.max(1, p - 1))}
                    className="h-7 w-7 p-0 rounded-lg border-border/70"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={homePage >= totalHomePages}
                    onClick={() => setHomePage((p) => Math.min(totalHomePages, p + 1))}
                    className="h-7 w-7 p-0 rounded-lg border-border/70"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Hub de Governança & Exceções (Sleek Compact Summary or Detailed Cards) */}
          {revisionOrders.length === 0 && comprasOrders.length === 0 ? (
            <div className="glass-bento p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    Governança Operacional: 100% em Conformidade
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Zero retrabalhos ativos e todas as aquisições de insumos em dia no fluxo industrial.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveTab("governanca")}
                className="text-xs h-7 rounded-lg text-primary hover:bg-primary/10 border-border/80 shrink-0 saas-interactive"
              >
                Auditar Mudanças →
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* REVs Recentes */}
              <div className="glass-bento p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                        <RotateCcw className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-foreground">Ordens em Revisão / Retrabalho</h3>
                        <p className="text-[10px] text-muted-foreground">{revisionOrders.length} ordens com histórico</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setActiveTab("governanca"); setGovernancaSubFilter("revisoes"); }}
                      className="text-xs h-7 text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:bg-amber-500/10 px-2.5 rounded-lg saas-interactive"
                    >
                      Ver Todas
                    </Button>
                  </div>

                  <div className="pt-3">
                    {revisionOrders.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        Nenhuma ordem com retrabalho ou revisão no momento.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {revisionOrders.slice(0, 5).map((r) => (
                          <div
                            key={`home-rev-${r.order.id}`}
                            onClick={() => setSelectedOrderForDetail(r.order)}
                            className="p-2.5 rounded-xl bg-muted/30 hover:bg-muted/60 border border-border/60 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono-tech font-bold text-xs text-foreground">#{r.order.titulo}</span>
                                <span className="text-[11px] font-medium text-foreground truncate">• {(r.order.cliente || "").toUpperCase()}</span>
                                <span
                                  className={`text-[10px] font-mono-tech font-bold px-1.5 py-0.5 rounded ${
                                    r.revNumber >= 3
                                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                  }`}
                                >
                                  REV {r.revNumber}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                {r.cleanObs || "Motivo da revisão não especificado"}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                                {r.order.operador || "—"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Compras Recentes */}
              <div className="glass-bento p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-pink-500/10 text-pink-500">
                        <ShoppingBag className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-foreground">Central de Compras Integrada</h3>
                        <p className="text-[10px] text-muted-foreground">{comprasStats.total} ordens com insumos</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setActiveTab("governanca"); setGovernancaSubFilter("compras"); }}
                      className="text-xs h-7 text-pink-600 dark:text-pink-400 hover:text-pink-700 hover:bg-pink-500/10 px-2.5 rounded-lg saas-interactive"
                    >
                      Ver Todas
                    </Button>
                  </div>

                  <div className="pt-3">
                    {comprasOrders.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        Nenhuma ordem enviada para Compras no momento.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {comprasOrders.slice(0, 5).map((c) => (
                          <div
                            key={`home-compras-${c.order.id}`}
                            onClick={() => setSelectedOrderForDetail(c.order)}
                            className="p-2.5 rounded-xl bg-muted/30 hover:bg-muted/60 border border-border/60 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono-tech font-bold text-xs text-foreground">#{c.order.titulo}</span>
                                <span className="text-[11px] font-medium text-foreground truncate">• {(c.order.cliente || "").toUpperCase()}</span>
                                {c.pantoneActive && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/25">
                                    PANTONE
                                  </span>
                                )}
                                {c.outrosActive && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-600 dark:text-purple-400 font-medium border border-purple-500/25">
                                    INSUMO
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                {c.pantoneText ? `Pantone: ${c.pantoneText}` : c.outrosText ? `Insumo: ${c.outrosText}` : (c.order.descricao || "Item em processo de compra")}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              {c.isComprado ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                                  <Check className="h-3 w-3 stroke-[3]" /> Comprado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md">
                                  <Clock className="h-3 w-3" /> Pendente
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section: Status Breakdown & Average Stage Times */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Status Breakdown Bar Meter */}
            <div className="glass-bento p-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#253745]/50 text-[#CCD0CF]">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">Distribuição por Etapa (Pré-Impressão)</h3>
                    <p className="text-[10px] text-muted-foreground">Status do fluxo atual</p>
                  </div>
                </div>
                <span className="text-xs font-mono-tech text-[#CCD0CF] font-bold bg-[#253745] border border-[#4A5C6A]/40 px-2 py-0.5 rounded-md">
                  {preImpressaoOrders.length} ordens
                </span>
              </div>

              <div className="pt-3 space-y-2.5">
                {STATUS_ORDER.map((status) => {
                  const config = STATUS_CONFIG[status];
                  const count = countByStatus[status] || 0;
                  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;

                  return (
                    <div key={status} className="flex items-center gap-3">
                      <div className="w-32 sm:w-36 text-xs text-foreground truncate font-medium">{config.label}</div>
                      <div className="flex-1 h-5 bg-muted/60 rounded-md border border-border/60 overflow-hidden relative p-0.5">
                        <div
                          className="h-full rounded transition-all duration-500 flex items-center justify-end pr-1.5"
                          style={{
                            width: `${Math.max(pct, count > 0 ? 8 : 0)}%`,
                            backgroundColor: `hsl(var(--status-${config.colorKey}))`,
                          }}
                        >
                          {count > 0 && (
                            <span className="text-[9px] font-bold font-mono-tech text-white drop-shadow whitespace-nowrap">
                              {count}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="w-6 text-right font-mono-tech text-xs font-bold text-muted-foreground">
                        {count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Average Duration per Stage */}
            <div className="glass-bento p-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <Timer className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">Tempo Médio por Etapa</h3>
                    <p className="text-[10px] text-muted-foreground">Ordens liberadas</p>
                  </div>
                </div>
                <span className="text-xs font-mono-tech text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                  Total: {avgTotal !== null ? formatDuration(avgTotal) : "—"}
                </span>
              </div>

              <div className="pt-3 space-y-2.5">
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
                    const isWide = pct >= 20;

                    return (
                      <div key={status} className="flex items-center gap-3" title={`${config.label}: ${avg > 0 ? formatDuration(avg) : "Sem dados"}`}>
                        <div className="w-32 sm:w-36 text-xs text-foreground truncate font-medium">{config.label}</div>
                        <div className="flex-1 h-5 bg-muted/60 rounded-md border border-border/60 overflow-hidden relative p-0.5 flex items-center">
                          <div
                            className={`h-full rounded transition-all duration-500 flex items-center shrink-0 ${
                              isWide ? "justify-end pr-1.5" : ""
                            }`}
                            style={{
                              width: `${Math.max(pct, avg > 0 ? 3.5 : 0)}%`,
                              minWidth: isWide ? "65px" : undefined,
                              backgroundColor: `hsl(var(--status-${config.colorKey}))`,
                            }}
                          >
                            {isWide && avg > 0 && (
                              <span className="text-[9px] font-bold font-mono-tech text-white drop-shadow whitespace-nowrap">
                                {formatDuration(avg)}
                              </span>
                            )}
                          </div>
                          {!isWide && avg > 0 && (
                            <span className="ml-2 text-[10px] font-bold font-mono-tech text-foreground whitespace-nowrap">
                              {formatDuration(avg)}
                            </span>
                          )}
                          {avg === 0 && (
                            <span className="ml-2 text-[9px] font-mono-tech text-muted-foreground/50 whitespace-nowrap">
                              —
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Section: Deadlines & Multiple Proofs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Controle de Prazos */}
            <div className="glass-bento p-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
                    <CalendarClock className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">Controle de Prazos (SLA)</h3>
                    <p className="text-[10px] text-muted-foreground">{ordersWithDeadline.length} com prazo estipulado</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveTab("sla")}
                  className="text-xs h-7 text-primary hover:bg-primary/10 px-2.5 rounded-lg saas-interactive"
                >
                  Ver no SLA
                </Button>
              </div>

              <div className="pt-3">
                {ordersWithDeadline.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    Nenhuma ordem com prazo estipulado no momento.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ordersWithDeadline
                      .sort((a, b) => new Date(a.prazo!).getTime() - new Date(b.prazo!).getTime())
                      .slice(0, 5)
                      .map((o) => {
                        const deadline = new Date(o.prazo!);
                        const now = new Date();
                        const remaining = deadline.getTime() - now.getTime();
                        const isOverdue = remaining < 0;
                        const isNear = remaining > 0 && remaining < 3600000;

                        return (
                          <div
                            key={o.id}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                              isOverdue
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-200"
                                : isNear
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-200"
                                : "bg-muted/30 border-border/60 text-foreground"
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
              </div>
            </div>

            {/* Controle de Retrabalho (Múltiplas Provas) */}
            <div className="glass-bento p-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500">
                    <Printer className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">Controle de Provas & Retrabalho</h3>
                    <p className="text-[10px] text-muted-foreground">{multiProofOrders.length} ordens com +1 prova</p>
                  </div>
                </div>
              </div>

              <div className="pt-3">
                {multiProofOrders.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    Nenhuma O.S. precisou de mais de 1 prova até agora.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {multiProofOrders
                      .sort((a, b) => b.provasCount - a.provasCount)
                      .slice(0, 5)
                      .map((t) => (
                        <div
                          key={t.orderId}
                          className="p-2.5 rounded-xl bg-muted/30 hover:bg-muted/60 border border-border/60 flex items-center justify-between gap-3 transition-colors"
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
                          <div className="flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/25 text-violet-600 dark:text-violet-300 px-2 py-0.5 rounded-lg">
                            <Printer className="h-3 w-3" />
                            <span className="font-mono-tech font-bold text-xs">{t.provasCount}</span>
                            <span className="text-[9px]">provas</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section: Suprimentos Especiais Executive Widget (Minimalist & Link to Full Tab) */}
          {supplyStats.total > 0 && (
            <div className="glass-bento p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-border/60 gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">
                      Suprimentos Especiais (Faca • Clichê • Pantone)
                    </h3>
                    <p className="text-[10px] text-muted-foreground">
                      {supplyStats.sent} de {supplyStats.total} suprimentos liberados ({Math.round((supplyStats.sent / Math.max(supplyStats.total, 1)) * 100)}%)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExportSupplyCSV}
                    className="text-xs h-7 rounded-lg border-border/80 text-foreground hover:bg-muted saas-interactive gap-1.5"
                  >
                    <Download className="h-3 w-3 text-emerald-500" />
                    <span>CSV</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setActiveTab("suprimentos")}
                    className="text-xs h-7 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 saas-interactive gap-1"
                  >
                    <span>Painel Completo</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* 3 Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
                <div className="p-3 rounded-xl bg-background/80 border border-border/60 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-foreground">FACA</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {supplyStats.faca.sent} de {supplyStats.faca.total} liberadas
                    </div>
                  </div>
                  <span className={`text-xs font-mono-tech font-bold px-2 py-0.5 rounded-md ${
                    supplyStats.faca.total > 0 && supplyStats.faca.sent === supplyStats.faca.total
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : supplyStats.faca.sent > 0
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {supplyStats.faca.total > 0
                      ? `${Math.round((supplyStats.faca.sent / supplyStats.faca.total) * 100)}%`
                      : "—"}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-background/80 border border-border/60 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-foreground">CLICHÊ</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {supplyStats.cliche.sent} de {supplyStats.cliche.total} liberados
                    </div>
                  </div>
                  <span className={`text-xs font-mono-tech font-bold px-2 py-0.5 rounded-md ${
                    supplyStats.cliche.total > 0 && supplyStats.cliche.sent === supplyStats.cliche.total
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : supplyStats.cliche.sent > 0
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {supplyStats.cliche.total > 0
                      ? `${Math.round((supplyStats.cliche.sent / supplyStats.cliche.total) * 100)}%`
                      : "—"}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-background/80 border border-border/60 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-foreground">PANTONE</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {supplyStats.pantone.sent} de {supplyStats.pantone.total} liberados
                    </div>
                  </div>
                  <span className={`text-xs font-mono-tech font-bold px-2 py-0.5 rounded-md ${
                    supplyStats.pantone.total > 0 && supplyStats.pantone.sent === supplyStats.pantone.total
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : supplyStats.pantone.sent > 0
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {supplyStats.pantone.total > 0
                      ? `${Math.round((supplyStats.pantone.sent / supplyStats.pantone.total) * 100)}%`
                      : "—"}
                  </span>
                </div>
              </div>

              {/* Recent special supplies preview (up to 4) */}
              <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
                {filteredSupplyRecords.slice(0, 4).map((r, idx) => (
                  <div
                    key={`geral-supply-preview-${r.orderId}-${r.supplyId}-${idx}`}
                    className="px-3 py-2 rounded-lg bg-muted/20 hover:bg-muted/40 flex items-center justify-between gap-2 text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono-tech font-bold text-foreground">#{r.titulo}</span>
                      <span className="text-muted-foreground truncate">• {r.cliente}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#253745] text-[#CCD0CF] border border-[#4A5C6A]/40">
                        {r.supplyLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.sent ? (
                        <span className="saas-pill bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 text-[10px]">
                          <CheckCircle2 className="h-3 w-3" /> Aprovado
                        </span>
                      ) : (
                        <span className="saas-pill bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-[10px]">
                          <Clock className="h-3 w-3" /> Pendente
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground hidden sm:inline">
                        {r.operator || "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </motion.div>
        </TabsContent>

        {/* TAB: GOVERNANÇA OPERACIONAL & AUDITORIA DE MUDANÇAS */}
        <TabsContent value="governanca" className="space-y-6 m-0 focus-visible:outline-none">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="space-y-6"
          >
          {/* Header & Filter Controls */}
          <div className="glass-bento p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                <h2 className="text-base font-bold text-foreground">
                  Painel de Governança Operacional & Auditoria
                </h2>
                <Badge variant="outline" className="font-mono-tech text-[10px] text-[#CCD0CF] border-[#4A5C6A]/50 bg-[#253745]">
                  ADMIN VIEW
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Rastreamento centralizado de Retrabalhos (REVs), Trava de Ferramental na Saída e Compras de Pantones/Insumos
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filtrar por O.S. ou Cliente..."
                  value={governancaSearch}
                  onChange={(e) => setGovernancaSearch(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-xl bg-muted/40 border-border"
                />
                {governancaSearch && (
                  <button
                    onClick={() => setGovernancaSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportGovernancaCSV}
                className="gap-2 text-xs h-9 rounded-xl border-border bg-card hover:bg-muted text-foreground"
              >
                <Download className="h-3.5 w-3.5 text-emerald-500" />
                Exportar Auditoria CSV
              </Button>
            </div>
          </div>

          {/* Subfilter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setGovernancaSubFilter("all")}
              className={`text-xs px-3.5 py-1.5 rounded-xl font-medium transition-all ${
                governancaSubFilter === "all"
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              Todos os Registros ({filteredRevisionOrders.length + filteredComprasOrders.length + filteredSaidaOrders.length})
            </button>
            <button
              onClick={() => setGovernancaSubFilter("revisoes")}
              className={`text-xs px-3.5 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                governancaSubFilter === "revisoes"
                  ? "bg-amber-500 text-white font-bold shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Controle de Revisões (REVs)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-black/20 text-white">
                {filteredRevisionOrders.length}
              </span>
            </button>
            <button
              onClick={() => setGovernancaSubFilter("compras")}
              className={`text-xs px-3.5 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                governancaSubFilter === "compras"
                  ? "bg-pink-600 text-white font-bold shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>Central de Compras (Pantones & Outros)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-black/20 text-white">
                {filteredComprasOrders.length}
              </span>
            </button>
            <button
              onClick={() => setGovernancaSubFilter("saida_travas")}
              className={`text-xs px-3.5 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                governancaSubFilter === "saida_travas"
                  ? "bg-emerald-600 text-white font-bold shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Trava de Saída Faca & Clichê</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-black/20 text-white">
                {filteredSaidaOrders.length}
              </span>
            </button>
          </div>

          {/* TABLE 1: REVISÕES & RETRABALHOS (REVs) */}
          {(governancaSubFilter === "all" || governancaSubFilter === "revisoes") && (
            <Card className="glass-bento overflow-hidden">
              <CardHeader className="pb-3 border-b border-border bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-500">
                      <RotateCcw className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold text-foreground">
                        Controle de Revisões & Retrabalhos (REVs)
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Ordens que sofreram correções e retornaram para Preparação de Arquivo
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono-tech text-xs bg-amber-500/10 text-amber-500 border-amber-500/30">
                      REV 2: {rev2Count}
                    </Badge>
                    {rev3PlusCount > 0 && (
                      <Badge variant="outline" className="font-mono-tech text-xs bg-rose-500/15 text-rose-500 border-rose-500/40 animate-pulse font-bold">
                        REV 3+: {rev3PlusCount} (CRÍTICO)
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-[120px] text-xs font-semibold text-muted-foreground">O.S.</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Cliente (Caixa Alta)</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Nível REV</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Motivo / Observação da Revisão</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Vendedor</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Operador</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Status / Etapa Atual</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground text-right">Última Atualização</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRevisionOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-xs text-muted-foreground">
                          Nenhuma ordem com revisão identificada no filtro atual.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRevisionOrders.map((r) => {
                        const isCritical = r.revNumber >= 3;
                        const statusConfig = r.order.status ? STATUS_CONFIG[r.order.status as OrderStatus] : null;
                        return (
                          <TableRow key={`rev-${r.order.id}`} className="border-border/60 hover:bg-accent/40 transition-colors">
                            <TableCell className="font-medium">
                              <span className="font-mono-tech font-bold text-sm text-foreground">
                                #{r.order.titulo}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col max-w-[220px]">
                                <span className="text-xs font-bold text-foreground tracking-wide uppercase truncate">
                                  {(r.order.cliente || "—").toUpperCase()}
                                </span>
                                {r.order.descricao && (
                                  <span className="text-[11px] text-muted-foreground truncate">
                                    {r.order.descricao}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={`font-mono-tech font-bold text-xs px-2.5 py-0.5 rounded-md ${
                                  isCritical
                                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/50 animate-pulse"
                                    : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                                }`}
                              >
                                {isCritical ? `REV ${r.revNumber} (ALERTA)` : `REV ${r.revNumber}`}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="max-w-[320px] text-xs text-foreground bg-muted/40 rounded-lg p-2 border border-border/50">
                                {r.cleanObs || "Motivo não registrado na observação."}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {r.order.vendedor || "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs font-medium text-foreground">
                                {r.order.operador || "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[11px] font-medium border-border">
                                {statusConfig?.label || r.order.setor_status || r.order.status || "—"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-xs font-mono-tech text-muted-foreground">
                                {formatSafeDate(r.order.updated_at, "dd/MM/yyyy HH:mm") || "—"}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* TABLE 2: CENTRAL DE COMPRAS INTEGRADA */}
          {(governancaSubFilter === "all" || governancaSubFilter === "compras") && (
            <Card className="glass-bento overflow-hidden">
              <CardHeader className="pb-3 border-b border-border bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-pink-600/20 text-pink-500">
                      <ShoppingBag className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold text-foreground">
                        Central de Compras Integrada (Saída → Compras)
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Ordens enviadas para Compras para aquisição de Pantones, Insumos Especiais e Peças
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono-tech text-xs bg-emerald-500/15 text-emerald-500 border-emerald-500/30 font-semibold">
                      Comprados: {comprasStats.comprados}
                    </Badge>
                    <Badge variant="outline" className="font-mono-tech text-xs bg-amber-500/15 text-amber-500 border-amber-500/30 font-semibold">
                      Pendentes: {comprasStats.pendentes}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-[120px] text-xs font-semibold text-muted-foreground">O.S.</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Cliente (Caixa Alta)</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Pantones Requisitados</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Outros Insumos</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Ferramental</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Status da Compra</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Responsável / Comprador</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Etapa Kanban</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground text-right">Data/Hora</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredComprasOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-xs text-muted-foreground">
                          Nenhuma ordem em compras encontrada com o filtro atual.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredComprasOrders.map((c) => {
                        return (
                          <TableRow key={`compras-${c.order.id}`} className="border-border/60 hover:bg-accent/40 transition-colors">
                            <TableCell className="font-medium">
                              <span className="font-mono-tech font-bold text-sm text-foreground">
                                #{c.order.titulo}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col max-w-[220px]">
                                <span className="text-xs font-bold text-foreground tracking-wide uppercase truncate">
                                  {(c.order.cliente || "—").toUpperCase()}
                                </span>
                                {c.order.descricao && (
                                  <span className="text-[11px] text-muted-foreground truncate">
                                    {c.order.descricao}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {c.pantoneActive ? (
                                <Badge variant="outline" className="bg-blue-500/15 text-blue-500 dark:text-blue-400 border-blue-500/30 text-xs font-bold">
                                  <Palette className="h-3 w-3 mr-1" />
                                  {c.pantoneText ? `Pantone: ${c.pantoneText}` : "Pantone Ativo"}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {c.outrosActive ? (
                                <Badge variant="outline" className="bg-purple-500/15 text-purple-500 dark:text-purple-400 border-purple-500/30 text-xs font-medium">
                                  {c.outrosText || "Insumo Especial"}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5 text-xs">
                                {c.facaActive && (
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${c.facaSent ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                                    FACA
                                  </span>
                                )}
                                {c.clicheActive && (
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${c.clicheSent ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                                    CLICHÊ
                                  </span>
                                )}
                                {!c.facaActive && !c.clicheActive && (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {c.isComprado ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40">
                                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                                  <span>COMPRADO (VERDE)</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>PENDENTE DE COMPRA</span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs font-medium text-foreground">
                                {(c.order as any).responsavel_compra || c.order.operador || "Compras"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[11px] font-medium border-border uppercase">
                                {c.order.setor_status || "entrada"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-xs font-mono-tech text-muted-foreground">
                                {formatSafeDate(c.order.updated_at, "dd/MM/yyyy HH:mm") || "—"}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* TABLE 3: AUDITORIA DA TRAVA DE SAÍDA (FACA & CLICHÊ) */}
          {(governancaSubFilter === "all" || governancaSubFilter === "saida_travas") && (
            <Card className="glass-bento overflow-hidden">
              <CardHeader className="pb-3 border-b border-border bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-500">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold text-foreground">
                        Auditoria de Trava na Saída (Faca & Clichê)
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Garantia de conformidade: nenhuma ordem é liberada para Saída sem verificação do envio de ferramental
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono-tech text-xs bg-emerald-500/15 text-emerald-500 border-emerald-500/30 font-semibold">
                    100% de Saídas Auditadas
                  </Badge>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-[120px] text-xs font-semibold text-muted-foreground">O.S.</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Cliente (Caixa Alta)</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Faca Especial</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Clichê</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Status da Trava</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Operador Liberador</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground text-right">Data/Hora Saída</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSaidaOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                          Nenhuma ordem finalizada ou em saída encontrada.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSaidaOrders.slice(0, 50).map((s) => {
                        return (
                          <TableRow key={`saida-${s.order.id}`} className="border-border/60 hover:bg-accent/40 transition-colors">
                            <TableCell className="font-medium">
                              <span className="font-mono-tech font-bold text-sm text-foreground">
                                #{s.order.titulo}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col max-w-[240px]">
                                <span className="text-xs font-bold text-foreground tracking-wide uppercase truncate">
                                  {(s.order.cliente || "—").toUpperCase()}
                                </span>
                                {s.order.descricao && (
                                  <span className="text-[11px] text-muted-foreground truncate">
                                    {s.order.descricao}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {s.facaActive ? (
                                <Badge variant="outline" className={`text-xs font-bold ${s.facaSent ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : "bg-amber-500/15 text-amber-500 border-amber-500/30"}`}>
                                  {s.facaSent ? "Faca Enviada" : "Pendente"}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Não requer</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {s.clicheActive ? (
                                <Badge variant="outline" className={`text-xs font-bold ${s.clicheSent ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : "bg-amber-500/15 text-amber-500 border-amber-500/30"}`}>
                                  {s.clicheSent ? "Clichê Enviado" : "Pendente"}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Não requer</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                <span>Verificado na Saída</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs font-medium text-foreground">
                                {s.order.operador || "—"}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-xs font-mono-tech text-muted-foreground">
                                {formatSafeDate(s.order.updated_at, "dd/MM/yyyy HH:mm") || "—"}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
          </motion.div>
        </TabsContent>

        <TabsContent value="producao" className="space-y-4 m-0 focus-visible:outline-none">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="space-y-4"
          >
          {/* Controls Bar: Search + Sector Pills + Urgency Toggle */}
          <div className="glass-bento p-4 flex flex-col md:flex-row items-center justify-between gap-3">
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
                variant={selectedSector === "ctp" ? "default" : "outline"}
                size="sm"
                onClick={() => handleSelectSectorFilter("ctp")}
                className="h-8 text-xs rounded-xl px-3"
              >
                CTP ({sectorCounts.ctp})
              </Button>
              <Button
                variant={selectedSector === "digital" ? "default" : "outline"}
                size="sm"
                onClick={() => handleSelectSectorFilter("digital")}
                className="h-8 text-xs rounded-xl px-3"
              >
                Digital ({sectorCounts.digital})
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
          <Card className="glass-bento overflow-hidden">
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
                            <span className="font-semibold text-[#CCD0CF]">{setorLabel}</span>
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
          </motion.div>
        </TabsContent>

        {/* TAB 3: LEAD TIME & PRAZOS */}
        <TabsContent value="sla" className="space-y-6 m-0 focus-visible:outline-none">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="space-y-6"
          >
          {/* Últimas OS Liberadas — Tempo Detalhado */}
          <Card className="glass-bento">
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
          <Card className="glass-bento">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#CCD0CF]" /> O.S. Ativas em Produção — Tempo Acumulado
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
                            <div className="flex items-center gap-1.5 text-xs font-mono-tech font-bold text-[#CCD0CF] bg-[#253745] px-2.5 py-1 rounded-xl border border-[#4A5C6A]/40">
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
          </motion.div>
        </TabsContent>

        {/* TAB 4: MÉTRICAS PRÉ-IMPRESSÃO */}
        <TabsContent value="pre-impressao" className="m-0 focus-visible:outline-none">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            <PreImpressaoTab />
          </motion.div>
        </TabsContent>

        {/* TAB 5: AVISOS & COMUNICADOS */}
        <TabsContent value="avisos" className="space-y-4 m-0 focus-visible:outline-none">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="space-y-4"
          >
          <Card className="glass-bento">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Bell className="h-4 w-4 text-[#CCD0CF]" /> Registro de Avisos & Comunicados ({avisos.length})
                </CardTitle>
                <span className="text-xs text-muted-foreground">Histórico de comunicações enviadas</span>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {avisosLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-xs font-mono-tech">
                  <Loader2 className="h-4 w-4 animate-spin text-[#CCD0CF]" /> Carregando avisos...
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
                                <Eye className="h-3 w-3 text-[#CCD0CF]" />
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
          </motion.div>
        </TabsContent>

        {/* TAB 6: EXPORTAÇÕES & BACKUP */}
        <TabsContent value="backup" className="space-y-6 m-0 focus-visible:outline-none">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="space-y-6"
          >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Exportar PDFs */}
            <Card className="glass-bento">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileDown className="h-4 w-4 text-[#9BA8AB]" /> Exportação de Relatórios PDF
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Gere relatórios impressos ou digitais do fluxo de pré-impressão.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <Button
                  className="w-full gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#CCD0CF] dark:hover:bg-white dark:text-[#06141B] font-semibold rounded-xl h-10 shadow-lg transition-all"
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
            <Card className="glass-bento">
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
          </motion.div>
        </TabsContent>

        {/* TAB: TELEMETRIA DE SUPRIMENTOS ESPECIAIS (FACA, CLICHÊ, PANTONE) */}
        <TabsContent value="suprimentos" className="space-y-6 m-0 focus-visible:outline-none">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="space-y-6"
          >
          {/* KPI Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total */}
            <Card className="glass-bento p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Total de Suprimentos</div>
                  <div className="text-2xl font-bold font-mono-tech text-foreground mt-1">{supplyStats.total}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#253745]/60 text-[#CCD0CF] border border-[#4A5C6A]/40">
                  <Layers className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                <span className="text-emerald-500 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {supplyStats.sent} aprovados
                </span>
                <span className="text-amber-500 dark:text-amber-400 font-semibold flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {supplyStats.pending} pendentes
                </span>
              </div>
            </Card>

            {/* FACA */}
            <Card className="glass-bento p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Faca Especial</div>
                  <div className="text-2xl font-bold font-mono-tech text-foreground mt-1">
                    {supplyStats.faca.sent} <span className="text-sm font-normal text-muted-foreground">/ {supplyStats.faca.total}</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-xs">
                  FACA
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                <span>Taxa de Liberação</span>
                <span className="font-mono-tech font-bold text-foreground">
                  {supplyStats.faca.total > 0 ? `${Math.round((supplyStats.faca.sent / supplyStats.faca.total) * 100)}%` : "0%"}
                </span>
              </div>
            </Card>

            {/* CLICHE */}
            <Card className="glass-bento p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Clichê</div>
                  <div className="text-2xl font-bold font-mono-tech text-foreground mt-1">
                    {supplyStats.cliche.sent} <span className="text-sm font-normal text-muted-foreground">/ {supplyStats.cliche.total}</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-xs">
                  CLICHÊ
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                <span>Taxa de Liberação</span>
                <span className="font-mono-tech font-bold text-foreground">
                  {supplyStats.cliche.total > 0 ? `${Math.round((supplyStats.cliche.sent / supplyStats.cliche.total) * 100)}%` : "0%"}
                </span>
              </div>
            </Card>

            {/* PANTONE */}
            <Card className="glass-bento p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Pantone</div>
                  <div className="text-2xl font-bold font-mono-tech text-foreground mt-1">
                    {supplyStats.pantone.sent} <span className="text-sm font-normal text-muted-foreground">/ {supplyStats.pantone.total}</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-xs">
                  PANTONE
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                <span>Taxa de Liberação</span>
                <span className="font-mono-tech font-bold text-foreground">
                  {supplyStats.pantone.total > 0 ? `${Math.round((supplyStats.pantone.sent / supplyStats.pantone.total) * 100)}%` : "0%"}
                </span>
              </div>
            </Card>
          </div>

          {/* Filters & Actions Bar */}
          <div className="glass-bento p-4 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por O.S., cliente, operador..."
                value={supplySearch}
                onChange={(e) => setSupplySearch(e.target.value)}
                className="pl-9 bg-background border-input h-9 text-xs rounded-xl text-foreground placeholder:text-muted-foreground"
              />
              {supplySearch && (
                <button
                  onClick={() => setSupplySearch("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-start md:justify-end">
              {/* Type filter pills */}
              <Button
                variant={supplyTypeFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setSupplyTypeFilter("all")}
                className="h-8 text-xs rounded-xl px-3"
              >
                Todos
              </Button>
              <Button
                variant={supplyTypeFilter === "FACA" ? "default" : "outline"}
                size="sm"
                onClick={() => setSupplyTypeFilter("FACA")}
                className="h-8 text-xs rounded-xl px-3"
              >
                Faca ({supplyStats.faca.total})
              </Button>
              <Button
                variant={supplyTypeFilter === "CLICHE" ? "default" : "outline"}
                size="sm"
                onClick={() => setSupplyTypeFilter("CLICHE")}
                className="h-8 text-xs rounded-xl px-3"
              >
                Clichê ({supplyStats.cliche.total})
              </Button>
              <Button
                variant={supplyTypeFilter === "PANTONE" ? "default" : "outline"}
                size="sm"
                onClick={() => setSupplyTypeFilter("PANTONE")}
                className="h-8 text-xs rounded-xl px-3"
              >
                Pantone ({supplyStats.pantone.total})
              </Button>

              <div className="h-4 w-px bg-border mx-1" />

              {/* Status filter */}
              <Button
                variant={supplyStatusFilter === "all" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setSupplyStatusFilter("all")}
                className="h-8 text-xs rounded-xl px-2.5"
              >
                Status: Todos
              </Button>
              <Button
                variant={supplyStatusFilter === "sent" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setSupplyStatusFilter("sent")}
                className="h-8 text-xs rounded-xl px-2.5 text-emerald-500"
              >
                Aprovados
              </Button>
              <Button
                variant={supplyStatusFilter === "pending" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setSupplyStatusFilter("pending")}
                className="h-8 text-xs rounded-xl px-2.5 text-amber-500"
              >
                Pendentes
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportSupplyCSV}
                className="h-8 text-xs rounded-xl px-3 gap-1.5 border-[#4A5C6A]/50 text-[#CCD0CF] hover:bg-[#253745] font-semibold ml-auto md:ml-0"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar CSV
              </Button>
            </div>
          </div>

          {/* Records Table */}
          <Card className="glass-bento overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-[120px] text-xs font-semibold text-muted-foreground">O.S.</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Cliente & Descrição</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Suprimento</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Data da Aprovação</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Horário</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Tempo até Envio</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-right">Operador Responsável</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSupplyRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-xs text-muted-foreground">
                        Nenhum suprimento encontrado com os filtros selecionados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSupplyRecords.map((r, idx) => {
                      const hasSentDate = r.sent && Boolean(r.sentAt);
                      const sentDate = hasSentDate ? parseSafeDate(r.sentAt) : null;
                      const createdDate = parseSafeDate(r.createdAt);
                      const elapsedSinceCreation =
                        hasSentDate && sentDate && createdDate
                          ? sentDate.getTime() - createdDate.getTime()
                          : null;

                      return (
                        <TableRow
                          key={`${r.orderId}-${r.supplyId}-${idx}`}
                          className="border-border/60 hover:bg-accent/40 transition-colors"
                        >
                          <TableCell className="font-medium">
                            <span className="font-mono-tech font-bold text-xs text-foreground">
                              #{r.titulo}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col max-w-[260px]">
                              <span className="text-xs font-medium text-foreground truncate">
                                {r.cliente || "—"}
                              </span>
                              {r.descricao && (
                                <span className="text-[11px] text-muted-foreground truncate">
                                  {r.descricao}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                r.sent
                                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                  : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                              }`}
                            >
                              {r.supplyLabel}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {r.sent ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Enviado / Aprovado</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30">
                                <Clock className="h-3 w-3" />
                                <span>Pendente</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {sentDate ? (
                              <span className="text-xs font-mono-tech font-medium text-foreground">
                                {formatSafeDate(sentDate, "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            ) : r.sent ? (
                              <span className="text-xs text-muted-foreground italic">Registrado</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {sentDate ? (
                              <span className="text-xs font-mono-tech font-bold text-emerald-500 dark:text-emerald-400">
                                {formatSafeDate(sentDate, "HH:mm:ss")}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {elapsedSinceCreation && elapsedSinceCreation > 0 ? (
                              <span className="text-xs font-mono-tech text-muted-foreground">
                                {formatDuration(elapsedSinceCreation)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-xs font-medium text-foreground">
                              {r.operator || "—"}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Modal de Detalhes da O.S. disparado por clique nos cards ou no radar */}
      <OrderDetailDialog
        order={selectedOrderForDetail}
        open={!!selectedOrderForDetail}
        onOpenChange={(open) => !open && setSelectedOrderForDetail(null)}
        onUpdate={handleUpdateOrderForDetail}
      />
    </motion.div>
  );
}
