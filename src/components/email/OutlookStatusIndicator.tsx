import React from "react";
import { Mail, RefreshCw, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";
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

  const isAuthError = Boolean(
    lastError &&
      (lastError.includes("não autenticada") ||
        lastError.includes("interaction_required") ||
        lastError.includes("interaction_in_progress") ||
        lastError.includes("Acesso negado (401)") ||
        lastError.includes("401"))
  );

  const isSecondaryMailboxWarning = Boolean(
    lastError &&
      !isAuthError &&
      (lastError.includes("404") ||
        lastError.includes("not found in the store") ||
        lastError.includes("Default folder"))
  );

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
                  : isAuthError
                  ? "bg-rose-500"
                  : isSecondaryMailboxWarning
                  ? "bg-emerald-400"
                  : "bg-emerald-400 animate-pulse"
              }`}
            />
          </div>
          <span className="hidden lg:inline text-[11px]">
            {isSyncing ? "Sincronizando..." : "Outlook"}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-2">
        <DropdownMenuLabel className="font-semibold text-xs flex items-center gap-2">
          <Mail className="h-4 w-4 text-sky-400" />
          <span>Monitoramento Outlook</span>
        </DropdownMenuLabel>

        <div className="px-2 py-1.5 text-[11px] text-muted-foreground space-y-1.5">
          <div className="flex items-center justify-between">
            <span>Status:</span>
            <span className="font-medium text-foreground flex items-center gap-1">
              {isAuthError ? (
                <>
                  <AlertCircle className="h-3 w-3 text-rose-500" /> Erro de Autenticação
                </>
              ) : isSecondaryMailboxWarning ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Ativo (preimpressao)
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

          {/* Card de erro de autenticação real */}
          {isAuthError && (
            <div className="mt-2 p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Autorização Necessária</span>
              </div>
              <p className="text-[10.5px] text-muted-foreground leading-snug">
                A sessão Microsoft precisa de autorização nesta conta. Clique no botão abaixo para conectar.
              </p>
              <Button
                size="sm"
                onClick={() => void connectOutlook()}
                className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs h-7 rounded-lg flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Autorizar Outlook Agora</span>
              </Button>
            </div>
          )}

          {/* Card informativo de caixa compartilhada 404 */}
          {isSecondaryMailboxWarning && (
            <div className="mt-2 p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-foreground space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span>Sincronização Ativa em Pré-Impressão</span>
              </div>
              <p className="text-[10.5px] text-muted-foreground leading-snug">
                A conta principal <strong className="text-foreground">preimpressao@primacorgrafica.com.br</strong> está conectada e sincronizando normalmente.
              </p>
              <div className="text-[10px] text-amber-300/90 bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20 mt-1 flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                <span>
                  <strong>embalagens@</strong> não possui caixa Exchange ativa ou precisa de permissão de Caixa Compartilhada no admin.microsoft.com.
                </span>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-border/50">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">
              Caixas monitoradas:
            </span>
            <div className="space-y-1 mt-1 font-mono-tech text-[10px]">
              {MONITORED_MAILBOXES.map((box) => {
                const isBoxWarning =
                  Boolean(lastError?.includes(box)) &&
                  (lastError!.includes("404") || lastError!.includes("not found"));

                return (
                  <div key={box} className="flex items-center justify-between text-foreground/80">
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isBoxWarning ? "bg-amber-400" : "bg-emerald-400"
                        }`}
                      />
                      <span className="truncate">{box}</span>
                    </div>
                    {isBoxWarning ? (
                      <span className="text-[9px] text-amber-400 font-sans ml-1 shrink-0">
                        Aviso (404)
                      </span>
                    ) : (
                      <span className="text-[9px] text-emerald-400 font-sans ml-1 shrink-0">
                        Ativa
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={isSyncing}
          onClick={() => void syncNow(true)}
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
