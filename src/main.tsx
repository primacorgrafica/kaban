import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { getMsalInstance } from "./lib/msalClient";
import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge";

// Trata atualizações em produção: se houver novo deploy e o navegador tentar baixar um chunk antigo, recarrega automaticamente
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    console.warn("[Vite] Nova versão detectada após deploy, atualizando a página...");
    window.location.reload();
  });
}

// Detecta se esta janela é um retorno de popup de autenticação do Microsoft Entra ID
const isMsalPopup =
  typeof window !== "undefined" &&
  (window.location.hash.includes("code=") ||
    window.location.search.includes("code=") ||
    window.location.hash.includes("error=") ||
    window.location.search.includes("error=") ||
    window.name.includes("msal"));

if (isMsalPopup) {
  // Transmite a resposta OAuth diretamente para a janela principal via redirect-bridge oficial do MSAL
  void (async () => {
    try {
      await broadcastResponseToMainFrame();
    } catch (err) {
      console.warn("[MSAL Popup Bridge Error]", err);
      try {
        window.close();
      } catch (_) {}
    }
  })();

  const root = document.getElementById("root");
  if (root) {
    createRoot(root).render(
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#06141B] text-white select-none">
        <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-[#11212D]/95 border border-[#4A5C6A] shadow-2xl backdrop-blur-md max-w-sm text-center">
          <div className="relative h-12 w-12 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
            <div className="h-4 w-4 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wider text-emerald-400 uppercase font-mono-tech">
              Microsoft 365
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Conectado ao SharePoint corporativo com sucesso!
            </p>
          </div>
          <p className="text-[11px] text-slate-400 font-mono-tech">
            Esta janela será fechada automaticamente...
          </p>
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-2 text-xs px-4 py-2 rounded-xl bg-[#CCD0CF] hover:bg-white text-[#06141B] font-bold transition-all shadow-md cursor-pointer"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    );
  }
} else {
  // Inicialização padrão do Kaban no navegador
  void getMsalInstance();

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );

  // Registro do Service Worker do PWA
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[PWA] Service Worker registrado com sucesso:", reg.scope);
        })
        .catch((err) => {
          console.warn("[PWA] Falha ao registrar Service Worker:", err);
        });
    });
  }
}
