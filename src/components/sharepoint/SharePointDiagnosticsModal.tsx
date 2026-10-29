import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Cloud,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  LogIn,
  Trash2,
  Activity,
  FolderSync,
  ExternalLink,
} from "lucide-react";
import {
  getSharePointLogs,
  subscribeSharePointLogs,
  clearSharePointLogs,
  testSharePointConnection,
  SHAREPOINT_HOSTNAME,
  SHAREPOINT_SITE_PATH,
  SHAREPOINT_LIBRARY_NAME,
  SHAREPOINT_ROOT_FOLDER,
  SHAREPOINT_PROTOCOLOS_FOLDER,
  SHAREPOINT_PROTOCOLOS_URL,
  type SharePointLogEntry,
} from "@/lib/sharepointService";
import {
  getStoredMicrosoftUser,
  loginMicrosoft,
  type StoredMicrosoftUser,
} from "@/lib/msalClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SharePointDiagnosticsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SharePointDiagnosticsModal({
  open,
  onOpenChange,
}: SharePointDiagnosticsModalProps) {
  const [logs, setLogs] = useState<SharePointLogEntry[]>(() => getSharePointLogs());
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);
  const [currentUser, setCurrentUser] = useState<StoredMicrosoftUser | null>(() =>
    getStoredMicrosoftUser()
  );

  useEffect(() => {
    if (!open) return;
    setCurrentUser(getStoredMicrosoftUser());
    const unsubscribe = subscribeSharePointLogs((updatedLogs) => {
      setLogs([...updatedLogs]);
    });
    return () => unsubscribe();
  }, [open]);

  const handleRunTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testSharePointConnection(true);
      setTestResult(res);
      if (res.success) {
        toast.success(`SharePoint conectado e respondendo em ${res.latencyMs}ms!`);
      } else {
        toast.error(`Falha no teste do SharePoint: ${res.error}`);
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err?.message || err });
      toast.error(`Erro: ${err?.message || err}`);
    } finally {
      setTesting(false);
    }
  };

  const handleReconnect = async () => {
    try {
      const acc = await loginMicrosoft();
      if (acc) {
        setCurrentUser({ name: acc.name || acc.username, username: acc.username });
        toast.success(`Conectado ao Microsoft 365 como ${acc.name || acc.username}`);
        void handleRunTest();
      }
    } catch (err: any) {
      toast.error(`Falha ao conectar Microsoft: ${err?.message || err}`);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (filterLevel === "all") return true;
    return log.level === filterLevel;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] bg-[#0B131E] border-[#253745] text-slate-100 p-0 overflow-hidden shadow-2xl rounded-xl">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-sky-950/60 via-[#11212D] to-[#0B131E] px-4 py-3 sm:px-5 sm:py-3.5 border-b border-sky-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.2)] shrink-0">
              <Cloud className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/40 text-[10px] font-semibold px-2 py-0">
                  Diagnóstico & Logs
                </Badge>
                <span className="text-xs text-slate-400 font-mono-tech">
                  SharePoint / Microsoft Graph
                </span>
              </div>
              <h2 className="text-base font-bold tracking-tight text-white mt-0.5">
                Central de Sincronização SharePoint
              </h2>
            </div>
          </div>
        </div>

        {/* CORPO */}
        <div className="p-4 space-y-3 max-h-[72vh] overflow-y-auto scrollbar-thin scrollbar-thumb-[#253745]">
          {/* PAINEL DE STATUS DA SESSÃO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-lg bg-[#11212D]/80 border border-[#253745] text-xs">
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">Conta Microsoft Conectada</span>
              <p className="font-semibold text-white mt-0.5 truncate">
                {currentUser ? currentUser.name || currentUser.username : "Nenhuma conta autenticada"}
              </p>
              {currentUser?.username && (
                <span className="text-[11px] text-sky-300 font-mono-tech truncate block">
                  {currentUser.username}
                </span>
              )}
            </div>

            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">Destino SharePoint</span>
              <p className="font-semibold text-white mt-0.5 truncate" title={SHAREPOINT_HOSTNAME}>
                {SHAREPOINT_HOSTNAME}
              </p>
              <span className="text-[11px] text-slate-400 font-mono-tech truncate block">
                {SHAREPOINT_SITE_PATH} · {SHAREPOINT_LIBRARY_NAME}
              </span>
            </div>
          </div>

          {/* RESULTADO DO TESTE DE CONEXÃO */}
          {testResult && (
            <div
              className={cn(
                "p-3 rounded-lg border text-xs flex items-center justify-between gap-3",
                testResult.success
                  ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                  : "bg-rose-950/40 border-rose-500/40 text-rose-200"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                )}
                <div className="truncate">
                  <span className="font-bold">
                    {testResult.success ? "Conexão 100% Operacional!" : "Falha na Conexão"}
                  </span>
                  <p className="text-[11px] opacity-90 truncate">
                    {testResult.success
                      ? `Latência: ${testResult.latencyMs}ms · Pastas ${SHAREPOINT_ROOT_FOLDER} e ${SHAREPOINT_PROTOCOLOS_FOLDER} validadas.`
                      : testResult.error}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] shrink-0",
                  testResult.success
                    ? "border-emerald-500/50 text-emerald-300"
                    : "border-rose-500/50 text-rose-300"
                )}
              >
                {testResult.success ? "OK" : "ERRO"}
              </Badge>
            </div>
          )}

          {/* BARRA DE AÇÕES RÁPIDAS */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRunTest}
                disabled={testing}
                className="h-8 text-xs border-sky-500/40 text-sky-300 hover:bg-sky-500/20 gap-1.5"
              >
                <Activity className={cn("h-3.5 w-3.5", testing && "animate-spin")} />
                <span>{testing ? "Testando..." : "Testar Conexão Graph"}</span>
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleReconnect}
                className="h-8 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/20 gap-1.5"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>Reconectar Sessão</span>
              </Button>
            </div>

            <div className="flex items-center gap-1">
              {["all", "error", "warn", "success", "info"].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setFilterLevel(level)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono-tech transition-colors",
                    filterLevel === level
                      ? "bg-sky-500/30 text-sky-200 border border-sky-500/50"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                  )}
                >
                  {level.toUpperCase()}
                </button>
              ))}

              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={clearSharePointLogs}
                className="h-7 w-7 text-slate-400 hover:text-rose-400"
                title="Limpar histórico de logs"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* LISTA DE LOGS EM TEMPO REAL */}
          <div className="rounded-lg border border-[#253745] bg-black/50 overflow-hidden">
            <div className="p-2 bg-[#091019] border-b border-[#253745] flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold flex items-center gap-1.5">
                <FolderSync className="h-3.5 w-3.5 text-sky-400" />
                Eventos e Diagnóstico Recentes ({filteredLogs.length})
              </span>
              <span className="text-[10px] font-mono-tech">Ao vivo</span>
            </div>

            <ScrollArea className="h-56 p-2 font-mono-tech text-xs">
              {filteredLogs.length === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-slate-500 text-xs">
                  <span>Nenhum registro de log para o filtro selecionado.</span>
                  <span className="text-[10px] mt-1 text-slate-600">
                    Clique em "Testar Conexão Graph" para verificar o status.
                  </span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className={cn(
                        "p-2 rounded border text-[11px] flex items-start gap-2 transition-colors",
                        log.level === "error" && "bg-rose-950/30 border-rose-800/40 text-rose-200",
                        log.level === "warn" && "bg-amber-950/30 border-amber-800/40 text-amber-200",
                        log.level === "success" && "bg-emerald-950/30 border-emerald-800/40 text-emerald-200",
                        log.level === "info" && "bg-sky-950/20 border-sky-800/30 text-sky-100"
                      )}
                    >
                      <span className="shrink-0 mt-0.5">
                        {log.level === "error" && <AlertCircle className="h-3.5 w-3.5 text-rose-400" />}
                        {log.level === "warn" && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
                        {log.level === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                        {log.level === "info" && <Info className="h-3.5 w-3.5 text-sky-400" />}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[11px]">{log.message}</span>
                          <span className="text-[10px] text-slate-400 shrink-0">{log.timestamp}</span>
                        </div>
                        {log.details && (
                          <pre className="mt-1 text-[10px] text-slate-400 overflow-x-auto p-1 bg-black/40 rounded border border-white/5 whitespace-pre-wrap">
                            {typeof log.details === "object"
                              ? JSON.stringify(log.details, null, 2)
                              : String(log.details)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        {/* FOOTER */}
        <DialogFooter className="px-4 py-2.5 bg-[#091019] border-t border-[#253745] flex items-center justify-between sm:justify-between gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-xs h-8 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 gap-1.5 font-mono-tech"
          >
            <a href={SHAREPOINT_PROTOCOLOS_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Abrir PROTOCOLOS ENTREGAS</span>
            </a>
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 bg-[#253745] hover:bg-[#34495e] text-white text-xs px-4"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
