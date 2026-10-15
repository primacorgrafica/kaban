import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { getMsalInstance } from "./lib/msalClient";

// Detecta se a janela atual é um popup ou iframe de autenticação do Microsoft Entra / MSAL
const isMsalInteraction =
  typeof window !== "undefined" &&
  ((window.opener && window.opener !== window) || window !== window.top) &&
  (window.location.hash.includes("code=") ||
    window.location.search.includes("code=") ||
    window.location.hash.includes("error=") ||
    window.location.search.includes("error=") ||
    window.name.includes("msal"));

if (isMsalInteraction) {
  // Inicializa o MSAL no popup para processar o callback do Entra ID e fechar a janela
  void getMsalInstance();

  const root = document.getElementById("root");
  if (root) {
    createRoot(root).render(
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#070a12] text-white select-none">
        <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-[#0f172a]/80 border border-cyan-500/30 shadow-2xl backdrop-blur-md max-w-sm text-center">
          <div className="relative h-12 w-12 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
            <div className="h-4 w-4 rounded-full bg-cyan-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wider text-cyan-400 uppercase font-mono-tech">
              Autenticação Microsoft 365
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Conectando com segurança ao SharePoint Primacor...
            </p>
          </div>
          <p className="text-[10px] text-slate-500 font-mono-tech">
            Esta janela será fechada automaticamente em instantes.
          </p>
        </div>
      </div>
    );
  }
} else {
  // Inicializa o cliente MSAL no fluxo normal da aplicação
  void getMsalInstance();

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}


