import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import ProductionPage from "./pages/ProductionPage";
import ExpedicaoPage from "./pages/ExpedicaoPage";
import UserManagementPage from "./pages/UserManagementPage";
import EquipamentosPage from "./pages/EquipamentosPage";
import ApresentacaoPage from "./pages/ApresentacaoPage";
import InstitucionalPage from "./pages/InstitucionalPage";
import EmConstrucaoPage from "./pages/EmConstrucaoPage";
import EntregasPage from "./pages/EntregasPage";
import ComercialPage from "./pages/ComercialPage";
import PcpPage from "./pages/PcpPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, module }: { children: React.ReactNode; module?: string }) {
  const { session, loading, hasModule } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (module && !hasModule(module)) return <Navigate to="/" replace />;
  return <>{children}</>;
}


function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<PublicRoute><AuthPage /></PublicRoute>} />
            <Route path="/apresentacao" element={<ApresentacaoPage />} />
            <Route path="/institucional" element={<InstitucionalPage />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute module="dashboard"><Index /></ProtectedRoute>} />
            <Route path="/arquivados" element={<ProtectedRoute module="trabalhos_concluidos"><Index /></ProtectedRoute>} />
            <Route path="/producao/:departamento" element={<ProtectedRoute module="producao"><ProductionPage /></ProtectedRoute>} />
            <Route path="/producao" element={<Navigate to="/producao/desenvolvimento" replace />} />
            <Route path="/expedicao" element={<ProtectedRoute module="expedicao"><ExpedicaoPage /></ProtectedRoute>} />
            <Route path="/usuarios" element={<ProtectedRoute module="cadastro"><UserManagementPage /></ProtectedRoute>} />
            <Route path="/equipamentos" element={<ProtectedRoute module="cadastro"><EquipamentosPage /></ProtectedRoute>} />
            <Route path="/comercial" element={<ProtectedRoute module="comercial"><ComercialPage /></ProtectedRoute>} />
            <Route path="/pcp" element={<ProtectedRoute module="pcp"><PcpPage /></ProtectedRoute>} />
            
            
            <Route path="/compras" element={<ProtectedRoute module="compras"><ProductionPage /></ProtectedRoute>} />
            <Route path="/manutencao" element={<ProtectedRoute module="manutencao"><ProductionPage /></ProtectedRoute>} />
            <Route path="/entregas" element={<ProtectedRoute module="expedicao"><EntregasPage /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
