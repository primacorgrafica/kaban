import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";

// Code-splitting em rotas pesadas para carregamento ultra rápido do bundle inicial
const ProductionPage = lazy(() => import("./pages/ProductionPage"));
const ExpedicaoPage = lazy(() => import("./pages/ExpedicaoPage"));
const UserManagementPage = lazy(() => import("./pages/UserManagementPage"));
const EquipamentosPage = lazy(() => import("./pages/EquipamentosPage"));
const ApresentacaoPage = lazy(() => import("./pages/ApresentacaoPage"));
const InstitucionalPage = lazy(() => import("./pages/InstitucionalPage"));
const EmConstrucaoPage = lazy(() => import("./pages/EmConstrucaoPage"));
const EntregasPage = lazy(() => import("./pages/EntregasPage"));
const ComercialPage = lazy(() => import("./pages/ComercialPage"));
const PcpPage = lazy(() => import("./pages/PcpPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));

import { GlobalChatNotifier } from "@/components/chat/GlobalChatNotifier";
import { ThemeProvider } from "@/components/theme-provider";
import { AutonomousEngineMonitor } from "@/components/AutonomousEngineMonitor";
import { securityLogger, checkDomainIntegrity } from "@/lib/securityGuardian";

// Executa verificação de integridade de ambiente no carregamento
if (typeof window !== "undefined") {
  checkDomainIntegrity();
}

// Configuração de alto desempenho para o React Query: evita refetches desnecessários ao trocar de aba
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutos de cache ativo
      gcTime: 1000 * 60 * 10,   // 10 minutos de retenção em memória
      refetchOnWindowFocus: false, // Evita travamentos por refetch ao alternar janelas
      retry: 1,
    },
  },
});

function PageLoadingFallback() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center bg-transparent">
      <div className="flex flex-col items-center gap-3">
        <div className="h-7 w-7 rounded-full border-2 border-[#4A5C6A]/30 border-t-[#CCD0CF] animate-spin" />
        <span className="text-[11px] font-mono-tech text-muted-foreground tracking-wider uppercase">
          Carregando...
        </span>
      </div>
    </div>
  );
}

function ProtectedRoute({
  children,
  module,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  module?: string;
  requireAdmin?: boolean;
}) {
  const { session, loading, hasModule, isAdmin } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (requireAdmin && !isAdmin) {
    void securityLogger.log({
      event_type: "UNAUTHORIZED_ROUTE_ACCESS",
      severity: "warning",
      details: { attempted_route: typeof window !== "undefined" ? window.location.pathname : "" },
      target_resource: "UserManagement",
    });
    return <Navigate to="/" replace />;
  }
  if (module && !hasModule(module)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ProducaoRedirect() {
  const { setorVinculado } = useAuth();
  if (setorVinculado === "qualidade") {
    return <Navigate to="/qualidade" replace />;
  }
  return <Navigate to="/" replace />;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} themes={["light", "dark"]} storageKey="primacor-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AutonomousEngineMonitor />
            <GlobalChatNotifier>
              <Suspense fallback={<PageLoadingFallback />}>
                <Routes>
                  <Route path="/login" element={<PublicRoute><AuthPage /></PublicRoute>} />
                  <Route path="/apresentacao" element={<ApresentacaoPage />} />
                  <Route path="/institucional" element={<InstitucionalPage />} />
                  <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                  <Route path="/dashboard" element={<ProtectedRoute module="dashboard"><DashboardPage /></ProtectedRoute>} />
                  <Route path="/arquivados" element={<ProtectedRoute module="trabalhos_concluidos"><Index /></ProtectedRoute>} />
                  <Route path="/qualidade" element={<ProtectedRoute module="producao"><ProductionPage /></ProtectedRoute>} />
                  <Route path="/producao/:departamento" element={<ProtectedRoute module="producao"><ProductionPage /></ProtectedRoute>} />
                  <Route path="/producao" element={<ProtectedRoute module="producao"><ProducaoRedirect /></ProtectedRoute>} />
                  <Route path="/expedicao" element={<ProtectedRoute module="expedicao"><ExpedicaoPage /></ProtectedRoute>} />
                  <Route path="/usuarios" element={<ProtectedRoute requireAdmin><UserManagementPage /></ProtectedRoute>} />
                  <Route path="/equipamentos" element={<ProtectedRoute module="cadastro"><EquipamentosPage /></ProtectedRoute>} />
                  <Route path="/comercial" element={<ProtectedRoute module="comercial"><ComercialPage /></ProtectedRoute>} />
                  <Route path="/pcp" element={<ProtectedRoute module="pcp"><PcpPage /></ProtectedRoute>} />
                  
                  <Route path="/compras" element={<ProtectedRoute module="compras"><ProductionPage /></ProtectedRoute>} />
                  <Route path="/manutencao" element={<ProtectedRoute module="manutencao"><ProductionPage /></ProtectedRoute>} />
                  <Route path="/entregas" element={<ProtectedRoute module="expedicao"><EntregasPage /></ProtectedRoute>} />
                  <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </GlobalChatNotifier>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
