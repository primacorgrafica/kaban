import { ReactNode, useEffect, useState, useCallback, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Monitor, Archive, Search, Menu, X, LogOut, BarChart3, Users, Maximize, Minimize, Truck, Megaphone, Lightbulb, Handshake, Square, PrinterCheck, Layers, ChevronDown, ShoppingCart, CircleDollarSign, AlertTriangle, Wrench, Briefcase, ShieldCheck, LucideIcon, Factory, ClipboardList, Settings, Package, KeyRound } from "lucide-react";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import logoImg from "@/assets/logo-sidebar.png";
import { OffsetIcon } from "./icons/OffsetIcon";
import { PrimacorIcon } from "./icons/PrimacorIcon";
import { GalpaoIcon } from "./icons/GalpaoIcon";
import { Input } from "@/components/ui/input";
import { CreateOrderDialog } from "./CreateOrderDialog";
import { CreateOMDialog } from "./CreateOMDialog";
import { CreateOCDialog } from "./CreateOCDialog";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAvisos, Aviso } from "@/hooks/useAvisos";
import { NotificationBell } from "./NotificationBell";
import { AvisoPopup } from "./AvisoPopup";
import { SendAvisoDialog } from "./SendAvisoDialog";
import { supabase } from "@/integrations/supabase/client";
import { subscribeOrders } from "@/lib/realtimeManager";

interface LayoutProps {
  children: ReactNode;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onAddOrder: (data: { titulo: string; descricao: string; cliente: string; observacao?: string }) => void;
  activeCount: number;
  archivedCount: number;
  sectorName?: string;
  countsLoading?: boolean;
  permissions: {
    canCreateOS: boolean;
    canAccessDashboard: boolean;
    canAccessComercial?: boolean;
    canArchive: boolean;
    canManageUsers: boolean;
    isViewOnly: boolean;
  };
}

export function Layout({ children, searchQuery, onSearchChange, onAddOrder, activeCount, archivedCount, sectorName, countsLoading = false, permissions }: LayoutProps) {
  const location = useLocation();
  const { signOut, user, isAdmin, authReady, hasModule } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [viewingAviso, setViewingAviso] = useState<Aviso | null>(null);
  const [deptCounts, setDeptCounts] = useState<Record<string, number>>({});
  const [deptCountsLoaded, setDeptCountsLoaded] = useState(false);
  const [producaoOpen, setProducaoOpen] = useState(false);
  const [expedicaoOpen, setExpedicaoOpen] = useState(false);
  const [cadastrosOpen, setCadastrosOpen] = useState(false);
  const avisoSessionStartedAt = useRef(Date.now());

  const fetchDeptCounts = useCallback(async () => {
    const NON_PRODUCTION_SECTORS = ["faturamento", "compras", "manutencao"];
    const [prodResult, preResult] = await Promise.all([
      supabase
        .from("orders")
        .select("setor, setor_status, titulo")
        .not("setor", "is", null)
        .eq("arquivado", false)
        .neq("setor_status", "saida"),
      supabase
        .from("orders")
        .select("status, titulo")
        .is("setor", null)
        .eq("arquivado", false)
        .neq("status", "arquivo_liberado"),
    ]);

    if (prodResult.error || preResult.error) {
      console.error("Erro ao carregar contadores da sidebar:", prodResult.error || preResult.error);
      return;
    }

    const counts: Record<string, number> = {};
    if (prodResult.data) {
      // For production sectors, count distinct titulo; for non-production, count all rows
      const sectorTitulos: Record<string, Set<string>> = {};
      prodResult.data.forEach((row: { setor: string | null; titulo: string }) => {
        if (row.setor) {
          if (NON_PRODUCTION_SECTORS.includes(row.setor)) {
            counts[row.setor] = (counts[row.setor] || 0) + 1;
          } else {
            if (!sectorTitulos[row.setor]) sectorTitulos[row.setor] = new Set();
            sectorTitulos[row.setor].add(row.titulo);
          }
        }
      });
      Object.entries(sectorTitulos).forEach(([setor, titulos]) => {
        counts[setor] = titulos.size;
      });
    }
    // Pre-impressão: count distinct titulo (exclude sub-orders)
    if (preResult.data) {
      const preTitulos = new Set(preResult.data.map((row: { titulo: string }) => row.titulo));
      counts["pre_impressao"] = preTitulos.size;
    } else {
      counts["pre_impressao"] = 0;
    }
    setDeptCounts(counts);
    setDeptCountsLoaded(true);
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady || !user) {
      return;
    }

    void fetchDeptCounts();

    const unsub = subscribeOrders(() => { void fetchDeptCounts(); });
    return () => { unsub(); };
  }, [authReady, user]);

  const { avisos, naoLidos, lidos, loading: avisosLoading, marcarComoLido, enviarAviso } = useAvisos();

  // Exibe apenas avisos recebidos nesta sessão do Layout. A leitura é persistida
  // assim que o popup abre para que uma troca de rota não possa reabri-lo.
  const shownKey = user ? `avisos_exibidos_${user.id}` : null;
  useEffect(() => {
    if (avisosLoading || !shownKey || viewingAviso) return;
    let shown: string[] = [];
    try {
      shown = JSON.parse(localStorage.getItem(shownKey) || "[]");
    } catch { shown = []; }
    const next = naoLidos.find((a) => (
      !shown.includes(a.id)
      && new Date(a.created_at).getTime() >= avisoSessionStartedAt.current
    ));
    if (next) {
      localStorage.setItem(shownKey, JSON.stringify([...shown, next.id].slice(-200)));
      setViewingAviso(next);
      void marcarComoLido(next.id);
    }
  }, [naoLidos, avisosLoading, shownKey, viewingAviso, marcarComoLido]);


  const handleDismissAviso = () => {
    setViewingAviso(null);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const allProducaoItems = [
    { to: "/producao/desenvolvimento", label: "Embalagens", icon: Lightbulb, count: deptCountsLoaded ? (deptCounts["desenvolvimento"] ?? 0) : undefined },
    { to: "/", label: "Pré-Impressão", icon: Monitor, count: deptCountsLoaded ? (deptCounts["pre_impressao"] ?? 0) : undefined },
    { to: "/producao/ctp", label: "CTP", icon: Square, count: deptCountsLoaded ? (deptCounts["ctp"] ?? 0) : undefined },
    { to: "/producao/digital", label: "Digital", icon: PrinterCheck, count: deptCountsLoaded ? (deptCounts["digital"] ?? 0) : undefined },
    { to: "/producao/offset", label: "Off-Set", icon: OffsetIcon as any, count: deptCountsLoaded ? (deptCounts["offset"] ?? 0) : undefined },
    { to: "/producao/acabamento", label: "Acabamento", icon: Layers, count: deptCountsLoaded ? (deptCounts["acabamento"] ?? 0) : undefined },
    { to: "/producao/terceiros", label: "Terceiros", icon: Handshake, count: deptCountsLoaded ? (deptCounts["terceiros"] ?? 0) : undefined },
    { to: "/producao/qualidade", label: "Qualidade", icon: Search, count: deptCountsLoaded ? (deptCounts["qualidade"] ?? 0) : undefined },
  ];

  const allExpedicaoItems = [
    { to: "/expedicao", label: "Expedição", icon: Truck, count: deptCountsLoaded ? (deptCounts["expedicao"] ?? 0) : undefined },
    { to: "/entregas", label: "Gestão de Entregas", icon: Package },
  ];

  const producaoItems = hasModule("producao") ? allProducaoItems : [];
  const expedicaoItems = hasModule("expedicao") ? allExpedicaoItems : [];

  const topItems = [
    ...(permissions.canAccessComercial && hasModule("comercial") ? [{ to: "/comercial", label: "Comercial", icon: Briefcase }] : []),
    ...(hasModule("pcp") ? [{ to: "/pcp", label: "PCP", icon: ClipboardList }] : []),
  ];

  const bottomItems = [
    ...(permissions.canArchive && hasModule("trabalhos_concluidos") ? [{ to: "/arquivados", label: "Trabalhos Concluídos", icon: Archive, count: countsLoading ? undefined : archivedCount }] : []),
    ...(hasModule("compras") ? [{ to: "/compras", label: "Compras", icon: ShoppingCart, count: deptCountsLoaded ? (deptCounts["compras"] ?? 0) : undefined }] : []),
    ...(hasModule("manutencao") ? [{ to: "/manutencao", label: "Manutenção", icon: Wrench, count: deptCountsLoaded ? (deptCounts["manutencao"] ?? 0) : undefined }] : []),
    ...(permissions.canAccessDashboard && hasModule("dashboard") ? [{ to: "/dashboard", label: "Dashboard", icon: BarChart3 }] : []),
  ];

  const cadastrosItems = [
    { to: "/usuarios", label: "Usuários", icon: Users },
    { to: "/equipamentos", label: "Equipamentos", icon: Settings },
  ];

  const isCadastrosActive = cadastrosItems.some(i => location.pathname === i.to);


  const renderNavLink = (item: { to: string; label: string; icon: any; count?: number }) => {
    const isActive = location.pathname === item.to;
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={() => setSidebarOpen(false)}
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
          isActive
            ? "bg-sidebar-primary/15 text-sidebar-primary font-medium shadow-sm"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        }`}
      >
        <item.icon className="h-4 w-4" />
        {item.label}
        {item.count !== undefined && (
          <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${isActive ? "bg-sidebar-primary/20 text-sidebar-primary" : "opacity-50"}`}>
            {item.count}
          </span>
        )}
      </Link>
    );
  };

  const isProducaoActive = producaoItems.some(i => location.pathname === i.to);
  const isExpedicaoActive = expedicaoItems.some(i => location.pathname === i.to);

  // Auto-open Produção group when navigating to a production page
  // Removed auto-open for Produção — it stays collapsed until clicked

  useEffect(() => {
    if (isCadastrosActive) setCadastrosOpen(true);
  }, [isCadastrosActive]);

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 flex-col transition-transform duration-200 text-sidebar-foreground ${
          isFullscreen ? "hidden" : "flex"
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ background: "var(--gradient-sidebar)" }}
      >
        <div className="px-5 py-5 flex items-center justify-between">
          <div className="flex items-center">
            <img src={logoImg} alt="Primacor Gráfica" className="w-28 h-auto object-contain" />
          </div>
          <button className="lg:hidden text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto scrollbar-none">
          {topItems.map(renderNavLink)}

          {/* Produção - collapsible group */}
          {producaoItems.length > 0 && (
            <>
              <button
                onClick={() => setProducaoOpen(!producaoOpen)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full ${
                  isProducaoActive && !producaoOpen
                    ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <Factory className="h-4 w-4" />
                Produção
                <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform duration-200 ${producaoOpen ? "rotate-180" : ""}`} />
              </button>
              {producaoOpen && (
                <div className="pl-3 space-y-0.5">
                  {producaoItems.map(renderNavLink)}
                </div>
              )}
            </>
          )}

          {/* Expedição - collapsible group */}
          {expedicaoItems.length > 0 && (
            <>
              <button
                onClick={() => setExpedicaoOpen(!expedicaoOpen)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full ${
                  isExpedicaoActive && !expedicaoOpen
                    ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <Truck className="h-4 w-4" />
                Expedição
                <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform duration-200 ${expedicaoOpen ? "rotate-180" : ""}`} />
              </button>
              {expedicaoOpen && (
                <div className="pl-3 space-y-0.5">
                  {expedicaoItems.map(renderNavLink)}
                </div>
              )}
            </>
          )}

          {bottomItems.map(renderNavLink)}


          {/* Cadastros - collapsible group, admin only */}
          {permissions.canManageUsers && (
            <>
              <button
                onClick={() => setCadastrosOpen(!cadastrosOpen)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full ${
                  isCadastrosActive && !cadastrosOpen
                    ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <ClipboardList className="h-4 w-4" />
                Cadastros
                <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform duration-200 ${cadastrosOpen ? "rotate-180" : ""}`} />
              </button>
              {cadastrosOpen && (
                <div className="pl-3 space-y-0.5">
                  {cadastrosItems.map(renderNavLink)}
                </div>
              )}
            </>
          )}
        </nav>

        <div className="px-3 py-3 border-t border-sidebar-border/50">
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 mb-1"
              onClick={() => setSendDialogOpen(true)}
            >
              <Megaphone className="h-4 w-4 mr-2" /> Enviar Aviso
            </Button>
          )}
          <div className="text-xs text-sidebar-foreground/40 truncate mb-2 px-3">{user?.email}</div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 mb-1"
            onClick={() => setChangePasswordOpen(true)}
          >
            <KeyRound className="h-4 w-4 mr-2" /> Alterar senha
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
          <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-auto min-h-[3.5rem] border-b border-border/50 flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4 flex-shrink-0 glass">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="relative flex-1 min-w-0 max-w-sm order-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar OS....."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 h-9 bg-background/60 border-border/50 focus:bg-background transition-colors"
            />
          </div>
          {sectorName && (() => {
            const sectorIconMap: Record<string, LucideIcon> = {
              "Embalagens": Lightbulb,
              "CTP": Square,
              "Digital": PrinterCheck,
              "Acabamento": Layers,
              "Terceiros": Handshake,
              "Expedição": Truck,
              "Qualidade": Search,
              "Compras": ShoppingCart,
              "Manutenção": Wrench,
              
            };
            const SectorIcon = sectorIconMap[sectorName];
            return (
              <span className="flex items-center gap-1.5 text-lg font-semibold text-muted-foreground whitespace-nowrap order-1">
                {SectorIcon && <SectorIcon className="h-5 w-5" />}
                {sectorName}
              </span>
            );
          })()}
          <div className="flex items-center gap-2 ml-auto order-2">
            <NotificationBell
              avisos={avisos}
              naoLidos={naoLidos}
              lidos={lidos}
              onRead={marcarComoLido}
              onViewAviso={(aviso) => setViewingAviso(aviso)}
            />
            {permissions.canCreateOS && location.pathname !== "/faturamento" && location.pathname !== "/comercial" && location.pathname !== "/manutencao" && location.pathname !== "/compras" && location.pathname !== "/entregas" && location.pathname !== "/pcp" && (
              <CreateOrderDialog onAdd={onAddOrder} />
            )}
            {permissions.canCreateOS && location.pathname === "/manutencao" && (
              <CreateOMDialog />
            )}
            {permissions.canCreateOS && location.pathname === "/compras" && (
              <CreateOCDialog />
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              title={isFullscreen ? "Sair da tela inteira" : "Tela inteira"}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-x-clip overflow-y-auto p-2 sm:p-4">{children}</main>
      </div>

      {/* Aviso popup */}
      <AvisoPopup aviso={viewingAviso} onDismiss={handleDismissAviso} />

      {/* Send aviso dialog (admin only) */}
      <SendAvisoDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen} onSend={enviarAviso} />
    </div>
  );
}
