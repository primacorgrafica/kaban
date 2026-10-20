import React, { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Mail, Send, CornerDownLeft, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOrderEmails } from "@/hooks/useOrderEmails";
import type { OrderEmailEvent } from "@/types/email";

interface OrderEmailEventsSectionProps {
  orderId: string;
  orderTitulo: string;
}

export function OrderEmailEventsSection({ orderId, orderTitulo }: OrderEmailEventsSectionProps) {
  const { events, loading, refetch } = useOrderEmails(orderId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

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

        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refetch()}
          disabled={loading}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          title="Atualizar lista de e-mails"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Lista de eventos de e-mail */}
      {loading && events.length === 0 ? (
        <div className="p-4 text-center text-xs text-muted-foreground">
          Carregando histórico de e-mails...
        </div>
      ) : events.length === 0 ? (
        <div className="p-4 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground space-y-1">
          <p>Nenhum e-mail registrado para esta O.S. até o momento.</p>
          <p className="text-[10px] opacity-75">
            Mensagens enviadas ou recebidas por <em>embalagens@</em> ou <em>preimpressao@</em> contendo "#{orderTitulo}" serão sincronizadas automaticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((evt) => {
            const isReceived = evt.direction === "recebido";
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
                  isReceived
                    ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20"
                    : "border-sky-500/30 bg-sky-500/5 dark:bg-sky-950/20"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        isReceived
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                          : "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30"
                      }`}
                    >
                      {isReceived ? (
                        <>
                          <CornerDownLeft className="h-3 w-3" /> Recebido
                        </>
                      ) : (
                        <>
                          <Send className="h-3 w-3" /> Enviado
                        </>
                      )}
                    </Badge>

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
                    <strong>{isReceived ? "Remetente:" : "Destinatário:"}</strong>{" "}
                    <span className="text-foreground">{isReceived ? evt.sender : evt.recipients}</span>
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
