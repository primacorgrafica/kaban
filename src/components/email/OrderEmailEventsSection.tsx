import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Mail, Send, CornerDownLeft, ChevronDown, ChevronUp, RefreshCw, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOrderEmails } from "@/hooks/useOrderEmails";
import { useUnreadEmailReplies } from "@/hooks/useUnreadEmailReplies";
import { useEmailMonitor } from "@/hooks/useEmailMonitor";
import type { OrderEmailEvent } from "@/types/email";
import { SellerNotificationBadge } from "./SellerNotificationBadge";

interface OrderEmailEventsSectionProps {
  orderId: string;
  orderTitulo: string;
  orderStatus?: string;
  vendedorNome?: string | null;
}

export function OrderEmailEventsSection({
  orderId,
  orderTitulo,
  orderStatus,
  vendedorNome,
}: OrderEmailEventsSectionProps) {
  const { events, loading, refetch } = useOrderEmails(orderId);
  const { hasUnread, hasVerified, markAsRead } = useUnreadEmailReplies();
  const { syncNow, isSyncing } = useEmailMonitor(false);
  const isUnread = hasUnread(orderId);
  const isVerified = hasVerified(orderId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleRefreshAndSync = async () => {
    try {
      await syncNow({ interactive: true, force: true, notifyOnSuccess: true });
    } finally {
      void refetch();
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // Deduplicação inteligente de eventos na visualização
  // Remove eventos duplicados criados quando múltiplas caixas monitoradas registraram a mesma mensagem
  const deduplicatedEvents = useMemo(() => {
    const seen = new Set<string>();
    const result: OrderEmailEvent[] = [];

    for (const evt of events) {
      const isReply =
        evt.direction === "recebido" ||
        /^\s*(re|res|enc|fwd)\s*[:]/i.test(evt.subject || "");

      const normSub = (evt.subject || "").trim().toLowerCase().replace(/^(re|res|fwd|enc)\s*:\s*/i, "");
      const normBody = (evt.body_preview || "").trim().toLowerCase().slice(0, 50).replace(/\s+/g, " ");
      const timeMin = (evt.email_datetime || "").slice(0, 16);

      // Chave única de mensagem
      const key = `${isReply ? "resp" : "env"}|${normSub}|${normBody}|${timeMin}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(evt);
    }

    return result;
  }, [events]);

  return (
    <div className="space-y-3">
      {/* Cabeçalho da seção */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Comunicação por E-mail (Outlook / M365)
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Histórico de mensagens enviadas e recebidas com referência à O.S. #{orderTitulo}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isUnread ? (
            <Button
              size="sm"
              onClick={() => void markAsRead(orderId, orderTitulo)}
              className="h-8 px-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-xs cursor-pointer animate-pulse"
              title="Marcar todas as respostas de e-mail desta O.S. como lidas"
            >
              <Check className="h-3.5 w-3.5 mr-1 stroke-[3]" />
              Marcar como Lido
            </Button>
          ) : isVerified ? (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
              title="E-mail verificado pelo operador"
            >
              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
              Verificado
            </span>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleRefreshAndSync()}
            disabled={loading || isSyncing}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Sincronizar Outlook e atualizar lista de e-mails"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading || isSyncing ? "animate-spin text-amber-400" : ""}`} />
            {isSyncing ? "Sincronizando..." : "Sincronizar Outlook"}
          </Button>
        </div>
      </div>

      {/* Notificação ao vendedor (se aplicável) */}
      <SellerNotificationBadge
        orderId={orderId}
        orderStatus={orderStatus || ""}
        vendedorNome={vendedorNome}
      />

      {/* Lista de eventos de e-mail */}
      {loading && deduplicatedEvents.length === 0 ? (
        <div className="p-4 text-center text-xs text-muted-foreground">
          Carregando histórico de e-mails...
        </div>
      ) : deduplicatedEvents.length === 0 ? (
        <div className="p-4 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground space-y-1">
          <p>Nenhum e-mail registrado para esta O.S. até o momento.</p>
          <p className="text-[10px] opacity-75">
            Mensagens enviadas ou recebidas por <em>embalagens@</em> ou <em>preimpressao@</em> contendo "#{orderTitulo}" serão sincronizadas automaticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {deduplicatedEvents.map((evt) => {
            const isReply =
              evt.direction === "recebido" ||
              /^\s*(re|res|enc|fwd)\s*[:]/i.test(evt.subject || "");

            const isExpanded = expandedId === evt.id;

            const formattedDate = (() => {
              try {
                return format(new Date(evt.email_datetime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
              } catch {
                return evt.email_datetime;
              }
            })();

            return (
              <div
                key={evt.id}
                className={`p-3 rounded-xl border transition-all text-xs space-y-1.5 ${
                  isReply
                    ? "border-teal-500/30 bg-teal-500/5 dark:bg-teal-950/20"
                    : "border-sky-500/30 bg-sky-500/5 dark:bg-sky-950/20"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isReply ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30"
                      >
                        <CornerDownLeft className="h-3 w-3 text-teal-500" /> Resposta do Cliente Recebida
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30"
                      >
                        <Send className="h-3 w-3 text-sky-500" /> E-mail Enviado para Aprovação
                      </Badge>
                    )}

                    <span className="font-semibold text-foreground text-[11px]">
                      {evt.subject}
                    </span>
                  </div>

                  <span className="font-mono-tech text-[10px] text-muted-foreground shrink-0">
                    {formattedDate}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-muted-foreground pt-0.5">
                  <div>
                    <strong>{isReply ? "Remetente:" : "Destinatário:"}</strong>{" "}
                    <span className="text-foreground">{isReply ? evt.sender : evt.recipients}</span>
                  </div>
                  <div>
                    <strong>Caixa:</strong>{" "}
                    <span className="text-foreground">{evt.mailbox}</span>
                  </div>
                </div>

                {evt.body_preview && (
                  <div className="pt-1">
                    <p
                      className={`text-[11px] text-muted-foreground italic rounded bg-background/60 p-2 border border-border/50 ${
                        isExpanded ? "" : "line-clamp-2"
                      }`}
                    >
                      "{evt.body_preview}"
                    </p>
                    {evt.body_preview.length > 120 && (
                      <button
                        onClick={() => toggleExpand(evt.id)}
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5 mt-1"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-3 w-3" /> Ver menos
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3" /> Ver mensagem completa
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
