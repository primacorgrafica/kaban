import { ReactNode, useEffect, useState, useCallback, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Monitor, Archive, Search, Menu, X, LogOut, BarChart3, Users, Maximize, Minimize, Truck, Megaphone, Lightbulb, Handshake, Square, PrinterCheck, Layers, ChevronDown, ShoppingCart, CircleDollarSign, AlertTriangle, Wrench, Briefcase, ShieldCheck, LucideIcon, Factory, ClipboardList, Settings, Package, KeyRound, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
import { OutlookStatusIndicator } from "./email/OutlookStatusIndicator";
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("primacor_sidebar_collapsed") === "true";
  });

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("primacor_sidebar_collapsed", String(next));
      return next;
    });
  };
  const { unreadChatCount } = useChatNotification();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [viewingAviso, setViewingAviso] = useState<Aviso | null>(null);
  const [deptCounts, setDeptCounts] = useState<Record<string, number>>(() => cachedDeptCounts || {});
  const [deptCountsLoaded, setDeptCountsLoaded] = useState(() => !!cachedDeptCounts);
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
        .neq("setor", "desenvolvimento")
        .eq("arquivado", false)
        .neq("setor_status", "saida"),
      supabase
        .from("orders")
        .select("status, titulo, setor")
        .or("setor.is.null,setor.eq.desenvolvimento")
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

  const canAccessGestaoEntregas = isAdmin || role === "coordenador" || permissions.canAccessDashboard;

  // Novo Fluxo Unificado Primacor:
  // 1. CHAT
  // 2. COMERCIAL
  // 3. PCP
  // 4. PRÉ-IMPRESSÃO
  // 5. QUALIDADE
  // 6. EXPEDIÇÃO
  // 7. GESTÃO ENTREGAS
  // 8. TRABALHOS CONCLUIDOS
  // 9. COMPRAS
  // 10. MANUTENÇÃO
  // 11. DASHBOARD
  // 12. CADASTROS
  // 13. UTILIDADES
  const navItems = [
    // 1. CHAT
    { to: "/chat", label: "Chat", icon: MessageSquare, count: unreadChatCount > 0 ? unreadChatCount : undefined },
    // 2. COMERCIAL
    ...(permissions.canAccessComercial && hasModule("comercial") ? [{ to: "/comercial", label: "Comercial", icon: Briefcase }] : []),
    // 3. PCP
    ...(hasModule("pcp") ? [{ to: "/pcp", label: "PCP", icon: ClipboardList }] : []),
    // 4. PRÉ-IMPRESSÃO
    ...(canAccessSector("pre_impressao") ? [{ to: "/", label: "Pré-Impressão", icon: Monitor, count: deptCountsLoaded ? (deptCounts["pre_impressao"] ?? 0) : undefined }] : []),
    // 5. QUALIDADE
    ...(canAccessSector("qualidade") ? [{ to: "/qualidade", label: "Qualidade", icon: Search, count: deptCountsLoaded ? (deptCounts["qualidade"] ?? 0) : undefined }] : []),
    // 6. EXPEDIÇÃO
    ...(hasModule("expedicao") && canAccessSector("expedicao") ? [{ to: "/expedicao", label: "Expedição", icon: Truck, count: deptCountsLoaded ? (deptCounts["expedicao"] ?? 0) : undefined }] : []),
    // 7. GESTÃO ENTREGAS
    ...(canAccessGestaoEntregas && hasModule("expedicao") ? [{ to: "/entregas", label: "Gestão Entregas", icon: Package }] : []),
    // 8. TRABALHOS CONCLUIDOS
    ...(permissions.canArchive && hasModule("trabalhos_concluidos") ? [{ to: "/arquivados", label: "Trabalhos Concluídos", icon: Archive, count: countsLoading ? undefined : archivedCount }] : []),
    // 9. COMPRAS
    ...(hasModule("compras") ? [{ to: "/compras", label: "Compras", icon: ShoppingCart, count: deptCountsLoaded ? (deptCounts["compras"] ?? 0) : undefined }] : []),
    // 10. MANUTENÇÃO
    ...(hasModule("manutencao") ? [{ to: "/manutencao", label: "Manutenção", icon: Wrench, count: deptCountsLoaded ? (deptCounts["manutencao"] ?? 0) : undefined }] : []),
    // 11. DASHBOARD
    ...(permissions.canAccessDashboard && hasModule("dashboard") ? [{ to: "/dashboard", label: "Dashboard", icon: BarChart3 }] : []),
  ];

  const cadastrosItems = [
    { to: "/usuarios", label: "Usuários", icon: Users },
    { to: "/equipamentos", label: "Equipamentos", icon: Settings },
  ];

  const isCadastrosActive = cadastrosItems.some(i => location.pathname === i.to);

  const handleCadastrosClick = () => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
      localStorage.setItem("primacor_sidebar_collapsed", "false");
      setCadastrosOpen(true);
    } else {
      setCadastrosOpen(!cadastrosOpen);
    }
  };

  const handleUtilidadesClick = () => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
      localStorage.setItem("primacor_sidebar_collapsed", "false");
      setUtilidadesOpen(true);
    } else {
      setUtilidadesOpen(!utilidadesOpen);
    }
  };

  const renderNavLink = (item: { to: string; label: string; icon: any; count?: number }) => {
    const isActive = location.pathname === item.to || (item.to === "/qualidade" && location.pathname === "/producao/qualidade");
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={() => setSidebarOpen(false)}
        title={sidebarCollapsed ? `${item.label}${item.count !== undefined ? ` (${item.count})` : ""}` : undefined}
        className={`relative flex items-center ${
          sidebarCollapsed ? "justify-center px-2" : "gap-2.5 px-3"
        } py-2 rounded-xl text-sm transition-all duration-150 group ${
          isActive
            ? "text-sidebar-primary font-semibold"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        }`}
      >
        {isActive && (
          <motion.div
            layoutId="sidebar-active-pill"
            className="absolute inset-0 rounded-xl bg-sidebar-primary/15 border border-sidebar-primary/25 shadow-xs"
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          />
        )}
        <item.icon className="h-4 w-4 shrink-0 relative z-10 transition-transform group-hover:scale-110" />
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
              className="relative z-10 truncate font-medium flex-1 overflow-hidden ml-0.5"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
        {item.count !== undefined && (
          <span
            className={`relative z-10 font-mono-tech ${
              sidebarCollapsed
                ? "absolute top-1 right-1 text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold"
                : "ml-auto text-xs px-2 py-0.5 rounded-full"
            } ${isActive ? "bg-sidebar-primary text-sidebar-primary-foreground font-bold shadow-xs" : "bg-sidebar-accent/80 text-sidebar-foreground/75"}`}
          >
            {item.count}
          </span>
        )}
      </Link>
    );
  };

  useEffect(() => {
    if (isCadastrosActive) setCadastrosOpen(true);
  }, [isCadastrosActive]);

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <motion.aside
        initial={false}
        animate={{
          width: isFullscreen ? 0 : sidebarCollapsed ? 72 : 256,
        }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className={`fixed lg:static inset-y-0 left-0 z-50 flex-col text-sidebar-foreground border-r border-sidebar-border/60 shrink-0 select-none overflow-hidden ${
          isFullscreen ? "hidden" : "flex"
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ background: "var(--gradient-sidebar)" }}
      >
        <div className={`py-3.5 border-b border-sidebar-border/60 relative flex items-center ${sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"}`}>
          <button className="lg:hidden absolute top-3 right-3 text-sidebar-foreground hover:text-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
          
          <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2.5"} overflow-hidden`}>
            {sidebarCollapsed ? (
              <button
                type="button"
                onClick={toggleSidebarCollapse}
                className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center font-extrabold font-mono-tech text-cyan-400 cursor-pointer shadow-xs hover:scale-105 hover:bg-cyan-500/20 transition-all"
                title="Expandir barra lateral"
              >
                P
              </button>
            ) : (
              <div className="flex flex-col items-start gap-1">
                <img src={logoImg} alt="Primacor Gráfica" className="w-36 h-auto max-h-11 object-contain" />
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-400 font-mono-tech border border-cyan-500/25 font-bold tracking-wider">
                  2.0 SAAS
                </span>
              </div>
            )}
          </div>

          {!sidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebarCollapse}
              className="hidden lg:flex h-7 w-7 text-sidebar-foreground/50 hover:text-cyan-400 hover:bg-sidebar-accent/50 rounded-lg transition-colors"
              title="Recolher menu lateral"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          )}
        </div>

        <nav className={`flex-1 ${sidebarCollapsed ? "px-2" : "px-3"} py-2 space-y-1 overflow-y-auto scrollbar-none`}>
          {navItems.map(renderNavLink)}

          {/* Cadastros - collapsible group, admin only */}
          {permissions.canManageUsers && (
            <div>
              <button
                onClick={handleCadastrosClick}
                title={sidebarCollapsed ? "Cadastros" : undefined}
                className={`relative flex items-center ${
                  sidebarCollapsed ? "justify-center px-2" : "gap-2.5 px-3"
                } py-2 rounded-xl text-sm transition-all duration-150 w-full ${
                  isCadastrosActive && !cadastrosOpen
                    ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <ClipboardList className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="truncate flex-1 text-left font-medium">Cadastros</span>
                    <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform duration-200 ${cadastrosOpen ? "rotate-180" : ""}`} />
                  </>
                )}
              </button>
              {cadastrosOpen && !sidebarCollapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="pl-3 space-y-1 mt-1"
                >
                  {cadastrosItems.map(renderNavLink)}
                </motion.div>
              )}
            </div>
          )}

          {/* Utilidades - Menu com sub-menus e botões para links externos */}
          <div>
            <button
              onClick={handleUtilidadesClick}
              title={sidebarCollapsed ? "Utilidades" : undefined}
              className={`relative flex items-center ${
                sidebarCollapsed ? "justify-center px-2" : "gap-2.5 px-3"
              } py-2 rounded-xl text-sm transition-all duration-150 w-full ${
                utilidadesOpen
                  ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <Compass className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && (
                <>
                  <span className="truncate flex-1 text-left font-medium">Utilidades</span>
                  <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform duration-200 ${utilidadesOpen ? "rotate-180" : ""}`} />
                </>
              )}
            </button>
            {utilidadesOpen && !sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="pl-3 space-y-2 mt-1 py-1"
              >
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
              </motion.div>
            )}
          </div>
        </nav>

        <div className={`p-3 border-t border-sidebar-border/60 bg-sidebar-background/60 ${sidebarCollapsed ? "flex flex-col items-center gap-2" : ""}`}>
          {sidebarCollapsed ? (
            <>
              <button
                type="button"
                className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-xs font-bold text-primary cursor-pointer hover:border-cyan-500/40 shadow-xs transition-colors"
                title={`${user?.email} (${isAdmin ? "Admin" : "Operador"})`}
                onClick={toggleSidebarCollapse}
              >
                {user?.email?.charAt(0).toUpperCase() || "U"}
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-rose-500 hover:bg-rose-500/10 rounded-xl"
                onClick={signOut}
                title="Sair do sistema"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
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
            </>
          )}
          <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col min-w-0 bg-background text-foreground relative">
        {/* Ambient background refraction glow for deep glassmorphism across the entire app */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
          <div className="absolute -top-32 left-1/4 h-[460px] w-[460px] rounded-full bg-[#253745]/25 dark:bg-[#11212D]/80 blur-[130px] opacity-70" />
          <div className="absolute top-1/3 right-6 h-[420px] w-[420px] rounded-full bg-[#4A5C6A]/20 dark:bg-[#253745]/35 blur-[120px] opacity-65" />
          <div className="absolute -bottom-24 left-10 h-[400px] w-[400px] rounded-full bg-[#9BA8AB]/15 dark:bg-[#06141B]/70 blur-[110px] opacity-50" />
        </div>

        <header className="h-14 border-b border-border/80 bg-card/80 backdrop-blur-2xl flex flex-wrap items-center gap-3 px-4 flex-shrink-0 z-10 shadow-xs dark:shadow-[0_4px_24px_rgba(6,20,27,0.4)]">
          <button className="lg:hidden p-1.5 rounded-lg bg-card border border-border text-foreground hover:bg-muted" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-4 w-4" />
          </button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebarCollapse}
            className="hidden lg:flex h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all border border-border/60"
            title={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
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
              "Qualidade": Search,
              "Expedição": Truck,
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
            {(isAdmin || role === "coordenador") && <OutlookStatusIndicator />}
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
