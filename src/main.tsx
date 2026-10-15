import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { getMsalInstance } from "./lib/msalClient";

// Detecta se esta janela é estritamente um popup de autenticação do MSAL retornando do Microsoft Entra ID
const isMsalPopup =
  typeof window !== "undefined" &&
  Boolean(window.opener && window.opener !== window) &&
  (window.name.includes("msal") ||
    window.location.hash.includes("code=") ||
    window.location.search.includes("code=") ||
    window.location.hash.includes("error=") ||
    window.location.search.includes("error="));

if (isMsalPopup) {
  // Inicializa o MSAL no popup para que processe o token retornado e notifique o window.opener
  void (async () => {
    try {
      const pca = await getMsalInstance();
      await pca.handleRedirectPromise();
    } catch (err) {
      console.warn("[MSAL Popup Callback]", err);
    }
  })();

  const root = document.getElementById("root");
  if (root) {
    createRoot(root).render(
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#070a12] text-white select-none">
        <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-[#0f172a]/95 border border-cyan-500/30 shadow-2xl backdrop-blur-md max-w-sm text-center">
          <div className="relative h-12 w-12 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
            <div className="h-4 w-4 rounded-full bg-cyan-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wider text-cyan-400 uppercase font-mono-tech">
              Microsoft 365
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Conectando com segurança ao SharePoint corporativo...
            </p>
          </div>
          <p className="text-[11px] text-slate-400 font-mono-tech">
            Esta janela será fechada automaticamente...
          </p>
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-2 text-xs px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-all shadow-md cursor-pointer"
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
}
