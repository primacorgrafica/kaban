import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in React component tree:", error, errorInfo);

    // Se a aplicação foi atualizada no servidor (deploy recente) e o navegador tentou buscar um arquivo JS antigo
    const isChunkError =
      error?.message?.includes("Failed to fetch dynamically imported module") ||
      error?.message?.includes("Importing a module script failed") ||
      error?.message?.includes("loading dynamically imported module");

    if (isChunkError && typeof window !== "undefined") {
      const storageKey = "primacor_chunk_reload_retry";
      const lastRetry = sessionStorage.getItem(storageKey);
      const now = Date.now();
      // Evita loop infinito: só recarrega automaticamente uma vez a cada 15 segundos
      if (!lastRetry || now - parseInt(lastRetry, 10) > 15000) {
        sessionStorage.setItem(storageKey, String(now));
        window.location.reload();
      }
    }
  }

  public handleReload = () => {
    window.location.reload();
  };

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[#070a12] text-white">
          <div className="max-w-md w-full p-6 rounded-2xl bg-slate-900/90 border border-red-500/30 shadow-2xl backdrop-blur-xl text-center">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 text-red-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-white mb-2">
              Ocorreu uma falha na interface
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              {this.state.error?.message || "Erro inesperado ao renderizar este componente."}
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleReset}
                className="text-xs border-slate-700 hover:bg-slate-800"
              >
                Tentar Novamente
              </Button>
              <Button
                size="sm"
                onClick={this.handleReload}
                className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Recarregar Página
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
