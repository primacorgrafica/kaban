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
import { ThemeToggle } from "./ThemeToggle";
import { CommandPalette } from "./CommandPalette";
import { AiProductionBottlenecksModal } from "./AiProductionBottlenecksModal";
import { ChatDialog } from "./chat/ChatDialog";
import { useChatNotification } from "./chat/GlobalChatNotifier";
import { RealtimeStatusIndicator } from "./RealtimeStatusIndicator";
import { SharePointStatusIndicator } from "./sharepoint/SharePointStatusIndicator";
import { Activity, Command, MessageSquare, ExternalLink, Compass } from "lucide-react";
import { Order, OrderStatus } from "@/types/order";
import { UTILITIES_CONFIG } from "@/config/utilities";
import { OrderDetailDialog } from "./OrderDetailDialog";
import { toast } from "sonner";

interface LayoutProps {
  children: ReactNode;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onAddOrder: (data: any) => Promise<any> | any;
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

// Cache em memória para transição instantânea de rotas (zero delay nos badges)
let cachedDeptCounts: Record<string, number> | null = null;

export function Layout({ children, searchQuery, onSearchChange, onAddOrder, activeCount, archivedCount, sectorName, countsLoading = false, permissions }: LayoutProps) {
  const location = useLocation();
  const { signOut, user, role, isAdmin, authReady, hasModule, canAccessSector, setorVinculado } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { unreadChatCount } = useChatNotification();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [viewingAviso, setViewingAviso] = useState<Aviso | null>(null);
  const [deptCounts, setDeptCounts] = useState<Record<string, number>>(() => cachedDeptCounts || {});
  const [deptCountsLoaded, setDeptCountsLoaded] = useState(() => !!cachedDeptCounts);
  const [producaoOpen, setProducaoOpen] = useState(false);
  const [expedicaoOpen, setExpedicaoOpen] = useState(false);
  const [cadastrosOpen, setCadastrosOpen] = useState(false);
  const [utilidadesOpen, setUtilidadesOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [bottlenecksModalOpen, setBottlenecksModalOpen] = useState(false);
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [inspectOrder, setInspectOrder] = useState<Order | null>(null);
  const avisoSessionStartedAt = useRef(Date.now());

  const handleUpdateInspectOrder = async (id: string, data: Partial<Order>) => {
    const { error } = await supabase.from("orders").update({ ...data, atualizado_por: user?.id || null }).eq("id", id);
    if (error) {
      toast.error("Erro ao atualizar O.S.");
    } else {
      toast.success("O.S. atualizada!");
      setInspectOrder((prev) => (prev ? { ...prev, ...data } : null));
    }
  };

  const handleMoveInspectOrder = async (id: string, status: OrderStatus) => {
    const { error } = await supabase.from("orders").update({ status, atualizado_por: user?.id || null }).eq("id", id);
    if (error) {
      toast.error("Erro ao alterar status da O.S.");
    } else {
      toast.success("Status atualizado!");
      setInspectOrder((prev) => (prev ? { ...prev, status } : null));
    }
  };

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
    cachedDeptCounts = counts;
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
    { to: "/producao/desenvolvimento", label: "Embalagens", icon: Lightbulb, count: deptCountsLoaded ? (deptCounts["desenvolvimento"] ?? 0) : undefined, dept: "desenvolvimento" },
    { to: "/", label: "Pré-Impressão", icon: Monitor, count: deptCountsLoaded ? (deptCounts["pre_impressao"] ?? 0) : undefined, dept: "pre_impressao" },
    { to: "/producao/ctp", label: "CTP", icon: Square, count: deptCountsLoaded ? (deptCounts["ctp"] ?? 0) : undefined, dept: "ctp" },
    { to: "/producao/digital", label: "Digital", icon: PrinterCheck, count: deptCountsLoaded ? (deptCounts["digital"] ?? 0) : undefined, dept: "digital" },
    { to: "/producao/offset", label: "Off-Set", icon: OffsetIcon as any, count: deptCountsLoaded ? (deptCounts["offset"] ?? 0) : undefined, dept: "offset" },
    { to: "/producao/acabamento", label: "Acabamento", icon: Layers, count: deptCountsLoaded ? (deptCounts["acabamento"] ?? 0) : undefined, dept: "acabamento" },
    { to: "/producao/terceiros", label: "Terceiros", icon: Handshake, count: deptCountsLoaded ? (deptCounts["terceiros"] ?? 0) : undefined, dept: "terceiros" },
    { to: "/producao/qualidade", label: "Qualidade", icon: Search, count: deptCountsLoaded ? (deptCounts["qualidade"] ?? 0) : undefined, dept: "qualidade" },
  ];

  const canAccessGestaoEntregas = isAdmin || role === "coordenador" || permissions.canAccessDashboard;
  const allExpedicaoItems = [
    { to: "/expedicao", label: "Expedição", icon: Truck, count: deptCountsLoaded ? (deptCounts["expedicao"] ?? 0) : undefined },
    ...(canAccessGestaoEntregas ? [{ to: "/entregas", label: "Gestão de Entregas", icon: Package }] : []),
  ];

  // Filtra itens de produção estritamente pelo setor vinculado ou permissão do usuário
  const producaoItems = hasModule("producao")
    ? allProducaoItems.filter(item => canAccessSector(item.dept))
    : [];
  const expedicaoItems = hasModule("expedicao") ? allExpedicaoItems : [];

  // O CHAT é universal e aberto a todos os usuários autenticados da Primacor
  const topItems = [
    { to: "/chat", label: "Chat Privado", icon: MessageSquare, count: unreadChatCount > 0 ? unreadChatCount : undefined },
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

  // Abre grupo de Produção automaticamente se for rota ativa ou se usuário tem setor vinculado único
  useEffect(() => {
    if (isProducaoActive || !!setorVinculado) {
      setProducaoOpen(true);
    }
  }, [isProducaoActive, setorVinculado]);

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
        <div className="px-5 py-4 border-b border-sidebar-border/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-xl bg-card border border-cyan-500/30 shadow-[0_0_15px_-3px_rgba(6,182,212,0.25)]">
              <img src={logoImg} alt="Primacor Gráfica" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-sidebar-foreground">PRIMACOR</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 font-mono-tech border border-cyan-500/25">v2.0</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono-tech">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                <span>ONLINE</span>
              </div>
            </div>
          </div>
          <button className="lg:hidden text-sidebar-foreground hover:text-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto scrollbar-none">
          {topItems.map(renderNavLink)}

          {/* Produção - se tiver apenas 1 setor liberado, exibe direto em primeira linha sem setinha/acordeão */}
          {producaoItems.length > 1 ? (
            <>
              <button
                onClick={() => setProducaoOpen(!producaoOpen)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full ${
                  isProducaoActive && !producaoOpen
                    ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
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
          ) : producaoItems.length === 1 ? (
            producaoItems.map(renderNavLink)
          ) : null}

          {/* Expedição - se tiver apenas 1 item liberado, exibe direto em primeira linha sem setinha/acordeão */}
          {expedicaoItems.length > 1 ? (
            <>
              <button
                onClick={() => setExpedicaoOpen(!expedicaoOpen)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full ${
                  isExpedicaoActive && !expedicaoOpen
                    ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
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
          ) : expedicaoItems.length === 1 ? (
            expedicaoItems.map(renderNavLink)
          ) : null}

          {bottomItems.map(renderNavLink)}


          {/* Cadastros - collapsible group, admin only */}
          {permissions.canManageUsers && (
            <>
              <button
                onClick={() => setCadastrosOpen(!cadastrosOpen)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full ${
                  isCadastrosActive && !cadastrosOpen
                    ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
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

          {/* Utilidades - Menu com sub-menus e botões para links externos */}
          <div>
            <button
              onClick={() => setUtilidadesOpen(!utilidadesOpen)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full ${
                utilidadesOpen
                  ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <Compass className="h-4 w-4" />
              Utilidades
              <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform duration-200 ${utilidadesOpen ? "rotate-180" : ""}`} />
            </button>
            {utilidadesOpen && (
              <div className="pl-3 space-y-2 mt-1 py-1">
                {UTILITIES_CONFIG.map((submenu) => (
                  <div key={submenu.id} className="space-y-0.5">
                    {submenu.title && (
                      <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 font-mono-tech flex items-center justify-between">
                        <span>{submenu.title}</span>
                      </div>
                    )}
                    {submenu.links.map((link) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all duration-150 group"
                        title={link.description || link.label}
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-cyan-500/70 group-hover:text-cyan-400 group-hover:scale-110 transition-all shrink-0" />
                        <span className="truncate flex-1 font-medium">{link.label}</span>
                        {link.badge && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                            {link.badge}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="px-3 py-3 border-t border-sidebar-border/60 bg-sidebar-background/60">
          <div className="px-3 py-2 mb-2 rounded-xl bg-card border border-border shadow-xs">
            <div className="text-[11px] text-foreground font-medium truncate flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_6px_#06b6d4]" />
              {user?.email}
            </div>
            <div className="text-[10px] text-primary font-mono-tech mt-0.5 uppercase tracking-wider font-semibold">
              {isAdmin ? "Administrador" : "Operador"}
            </div>
          </div>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-sidebar-accent mb-1 rounded-lg text-xs"
              onClick={() => setSendDialogOpen(true)}
            >
              <Megaphone className="h-3.5 w-3.5 mr-2 text-amber-500 dark:text-amber-400" /> Enviar Aviso
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-sidebar-accent mb-1 rounded-lg text-xs"
            onClick={() => setChangePasswordOpen(true)}
          >
            <KeyRound className="h-3.5 w-3.5 mr-2 text-primary" /> Alterar senha
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-500/10 rounded-lg text-xs"
            onClick={signOut}
          >
            <LogOut className="h-3.5 w-3.5 mr-2 text-rose-600 dark:text-rose-400" /> Sair
          </Button>
          <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 bg-background text-foreground">
        <header className="h-14 border-b border-border bg-card/85 backdrop-blur-xl flex flex-wrap items-center gap-3 px-4 flex-shrink-0 z-10 shadow-xs">
          <button className="lg:hidden p-1.5 rounded-lg bg-card border border-border text-foreground hover:bg-muted" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-4 w-4" />
          </button>
          <div className="relative flex-1 min-w-0 max-w-sm order-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar O.S., cliente ou processo..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 pr-16 h-9 bg-muted/50 border-input text-foreground placeholder:text-muted-foreground text-xs focus:border-primary focus:ring-1 focus:ring-primary/40 rounded-xl transition-all"
            />
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="hidden sm:inline-flex items-center gap-0.5 absolute right-2 top-1/2 -translate-y-1/2 text-[10px] bg-card text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-border font-mono-tech transition-colors shadow-xs"
              title="Abrir busca global rápida (Ctrl+K)"
            >
              Ctrl+K
            </button>
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
              <span className="flex items-center gap-2 text-sm font-bold text-foreground px-3 py-1 rounded-xl bg-card border border-border order-1 shadow-xs">
                {SectorIcon && <SectorIcon className="h-4 w-4 text-primary" />}
                <span className="tracking-wide uppercase font-mono-tech text-xs">{sectorName}</span>
              </span>
            );
          })()}
          <div className="flex items-center gap-2 ml-auto order-2">
            <RealtimeStatusIndicator />
            {(isAdmin || role === "coordenador") && <SharePointStatusIndicator />}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBottlenecksModalOpen(true)}
              className="h-9 px-2.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/25 rounded-xl hidden md:flex items-center gap-1.5 font-mono-tech transition-all"
              title="IA: Diagnóstico de Gargalos & Alertas"
            >
              <Activity className="h-3.5 w-3.5 text-amber-500" />
              <span>Gargalos</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChatDialogOpen(true)}
              className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 border border-border rounded-xl relative transition-all"
              title="Abrir Chat Privado"
            >
              <MessageSquare className="h-4 w-4" />
              {unreadChatCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-bold text-white shadow-xs animate-pulse">
                  {unreadChatCount > 9 ? "9+" : unreadChatCount}
                </span>
              )}
            </Button>
            <ThemeToggle />
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

      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onSelectOrder={(order) => setInspectOrder(order)}
      />

      {/* AI Production Bottlenecks Diagnostic Modal */}
      <AiProductionBottlenecksModal
        open={bottlenecksModalOpen}
        onOpenChange={setBottlenecksModalOpen}
        onSelectOrder={(order) => setInspectOrder(order)}
      />

      {/* Modal Centralizado de Detalhes da O.S. (idêntico ao de abrir na coluna) */}
      <OrderDetailDialog
        order={inspectOrder}
        open={!!inspectOrder}
        onOpenChange={(open) => !open && setInspectOrder(null)}
        onUpdate={handleUpdateInspectOrder}
        onDuplicate={async (order) => {
          const { id, created_at, updated_at, ...rest } = order;
          const { data, error } = await supabase.from("orders").insert({
            ...rest,
            titulo: `${order.titulo}-COPIA`,
            criado_por: user?.id || null,
          }).select().single();
          if (error) {
            toast.error("Erro ao duplicar O.S.");
          } else {
            toast.success("O.S. duplicada com sucesso!");
            if (data) setInspectOrder(data as Order);
          }
        }}
        onArchive={async (id) => {
          await supabase.from("orders").update({ arquivado: true, atualizado_por: user?.id || null }).eq("id", id);
          toast.success("O.S. arquivada com sucesso.");
          setInspectOrder(null);
        }}
        onDelete={async (id) => {
          await supabase.from("orders").delete().eq("id", id);
          toast.success("O.S. excluída.");
          setInspectOrder(null);
        }}
        onSendToProduction={async (id, dept, machine) => {
          await supabase.from("orders").update({
            setor: dept,
            setor_status: "entrada",
            maquina: machine || null,
            atualizado_por: user?.id || null,
          }).eq("id", id);
          toast.success("O.S. enviada para produção!");
          setInspectOrder(null);
        }}
        onSendToExpedicao={async (id) => {
          await supabase.from("orders").update({
            setor: "expedicao",
            setor_status: "entrada",
            atualizado_por: user?.id || null,
          }).eq("id", id);
          toast.success("O.S. enviada para expedição!");
          setInspectOrder(null);
        }}
      />

      {/* Chat Privado Modal */}
      <ChatDialog
        open={chatDialogOpen}
        onOpenChange={setChatDialogOpen}
      />
    </div>
  );
}
