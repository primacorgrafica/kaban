import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Mail, CheckCircle2, AlertTriangle, RefreshCw, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSellerNotification } from "@/hooks/useSellerNotification";

interface SellerNotificationBadgeProps {
  orderId: string;
  orderStatus: string;
  vendedorNome?: string | null;
}

export function SellerNotificationBadge({
  orderId,
  orderStatus,
  vendedorNome,
}: SellerNotificationBadgeProps) {
  const { latestNotification, loading, retry, triggerNow } = useSellerNotification(orderId);

  // Exibe se estiver em aguardando_aprovacao OU se tiver registro de notificação
  if (orderStatus !== "aguardando_aprovacao" && !latestNotification) {
    return null;
  }

  if (loading && !latestNotification) {
    return null;
  }

  // Se estiver em aguardando_aprovacao mas ainda não tem notificação gravada
  if (!latestNotification) {
    return (
      <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
          <Clock className="h-3.5 w-3.5" />
          <span>Aguardando Aprovação: Notificação ao vendedor pendente</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
          onClick={() => void triggerNow()}
        >
          <Mail className="h-3 w-3 mr-1" /> Notificar Vendedor
        </Button>
      </div>
    );
  }

  const isSent = latestNotification.sent_status === "sent";
  const isFailed = latestNotification.sent_status === "failed";
  const isPending = latestNotification.sent_status === "pending";

  const formattedSentAt = latestNotification.sent_at
    ? (() => {
        try {
          return format(new Date(latestNotification.sent_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
        } catch {
          return latestNotification.sent_at;
        }
      })()
    : null;

  return (
    <div
      className={`p-3 rounded-xl border transition-all text-xs space-y-1.5 ${
        isSent
          ? "border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-100"
          : isFailed
          ? "border-rose-500/30 bg-rose-500/10 dark:bg-rose-950/20 text-rose-900 dark:text-rose-100"
          : "border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 text-amber-900 dark:text-amber-100"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {isSent ? (
            <Badge
              variant="outline"
              className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 flex items-center gap-1"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Notificação Enviada ao Vendedor
            </Badge>
          ) : isFailed ? (
            <Badge
              variant="outline"
              className="text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 flex items-center gap-1"
            >
              <AlertTriangle className="h-3 w-3 text-rose-500" />
              Falha no Envio ao Vendedor
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 flex items-center gap-1"
            >
              <Clock className="h-3 w-3 text-amber-500 animate-spin" />
              Envio Pendente ao Vendedor
            </Badge>
          )}
        </div>

        {/* Botão de retentativa / disparo */}
        {(isFailed || isPending) && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs border-current hover:bg-background/40"
            onClick={() => void retry(latestNotification.id)}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Tentar Novamente
          </Button>
        )}
      </div>

      <div className="text-[11px] space-y-0.5 leading-relaxed pt-0.5">
        <div>
          <span className="font-semibold text-muted-foreground">Destinatário:</span>{" "}
          <strong className="text-foreground">{latestNotification.vendedor_nome || vendedorNome || "Vendedor"}</strong>{" "}
          <span className="font-mono-tech text-muted-foreground">({latestNotification.vendedor_email})</span>
        </div>

        {isSent && formattedSentAt && (
          <div className="text-[10.5px] text-muted-foreground">
            Disparado com sucesso em {formattedSentAt}.
          </div>
        )}

        {isFailed && latestNotification.error_message && (
          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
            Motivo da falha: {latestNotification.error_message}
          </div>
        )}
      </div>
    </div>
  );
}
