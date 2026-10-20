import React from "react";
import { Mail, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEmailMonitor } from "@/hooks/useEmailMonitor";
import { MONITORED_MAILBOXES } from "@/types/email";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function OutlookStatusIndicator() {
  const {
    isSyncing,
    lastSyncAt,
    lastError,
    processedCount,
    newEventsCount,
    syncNow,
    connectOutlook,
    hasMicrosoftAccount,
  } = useEmailMonitor(true);

  const formattedLastSync = (() => {
    if (!lastSyncAt) return "Ainda não sincronizado";
    try {
      return format(new Date(lastSyncAt), "dd/MM HH:mm", { locale: ptBR });
    } catch {
      return lastSyncAt;
    }
  })();

  if (!hasMicrosoftAccount) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void connectOutlook()}
        disabled={isSyncing}
        className="h-9 px-2.5 text-xs text-muted-foreground hover:text-sky-400 hover:bg-sky-500/10 border border-border rounded-xl flex items-center gap-1.5 font-mono-tech transition-all"
        title="Conectar ao Microsoft 365 / Outlook para monitorar e-mails"
      >
        <Mail className="h-3.5 w-3.5 text-sky-400" />
        <span className="hidden xl:inline text-[11px]">Conectar Outlook</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2.5 text-xs text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 border border-sky-500/30 rounded-xl flex items-center gap-1.5 font-mono-tech transition-all"
          title={`Outlook Conectado. Último sync: ${formattedLastSync}`}
        >
          <div className="relative flex items-center justify-center">
            <Mail className="h-3.5 w-3.5 text-sky-400" />
            <span
              className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                isSyncing
                  ? "bg-amber-400 animate-spin"
                  : lastError
                  ? "bg-rose-500"
                  : "bg-emerald-400 animate-pulse"
              }`}
            />
          </div>
          <span className="hidden lg:inline text-[11px]">
            {isSyncing ? "Sincronizando..." : "Outlook"}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72 p-2">
        <DropdownMenuLabel className="font-semibold text-xs flex items-center gap-2">
          <Mail className="h-4 w-4 text-sky-400" />
          <span>Monitoramento Outlook</span>
        </DropdownMenuLabel>

        <div className="px-2 py-1.5 text-[11px] text-muted-foreground space-y-1">
          <div className="flex items-center justify-between">
            <span>Status:</span>
            <span className="font-medium text-foreground flex items-center gap-1">
              {lastError ? (
                <>
                  <AlertCircle className="h-3 w-3 text-rose-500" /> Erro
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Ativo
                </>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span>Última verificação:</span>
            <span className="font-mono-tech text-foreground">{formattedLastSync}</span>
          </div>

          {lastError && (
            <p className="text-[10px] text-rose-500 bg-rose-500/10 p-1.5 rounded border border-rose-500/20 break-words mt-1">
              {lastError}
            </p>
          )}

          <div className="pt-1.5 border-t border-border/50">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">
              Caixas monitoradas:
            </span>
            <div className="space-y-0.5 mt-0.5 font-mono-tech text-[10px]">
              {MONITORED_MAILBOXES.map((box) => (
                <div key={box} className="truncate text-foreground/80 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                  <span>{box}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={isSyncing}
          onClick={() => void syncNow()}
          className="text-xs cursor-pointer flex items-center gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          <span>Sincronizar e-mails agora</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => void connectOutlook()}
          className="text-xs cursor-pointer text-muted-foreground flex items-center gap-2"
        >
          <Mail className="h-3.5 w-3.5" />
          <span>Renovar permissões de e-mail</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
