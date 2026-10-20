import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Mail, Send, CornerDownLeft, MessageSquare } from "lucide-react";
import { useOrderEmails } from "@/hooks/useOrderEmails";
import type { OrderEmailEvent } from "@/types/email";

interface OrderEmailCardNoticeProps {
  orderId: string;
  osNumber: string;
}

export function OrderEmailCardNotice({ orderId, osNumber }: OrderEmailCardNoticeProps) {
  const { latestReceived, latestSent, loading } = useOrderEmails(orderId);

  if (loading && !latestReceived && !latestSent) {
    return null;
  }

  // Prioriza exibir resposta recebida (mais recente ou mais acionável)
  // Se não houver resposta recebida, exibe o e-mail enviado ao cliente
  const activeEvent: OrderEmailEvent | null = latestReceived || latestSent;

  if (!activeEvent) {
    return null;
  }

  const isReceived = activeEvent.direction === "recebido";

  const formattedDate = (() => {
    try {
      return format(new Date(activeEvent.email_datetime), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return activeEvent.email_datetime;
    }
  })();

  return (
    <div
      onClick={(e) => {
        // Permite que o clique no aviso propague para abrir os detalhes da OS
      }}
      className={`mt-2 p-2.5 rounded-xl border transition-all text-xs space-y-1.5 shadow-2xs ${
        isReceived
          ? "border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 hover:border-emerald-500/60"
          : "border-sky-500/40 bg-sky-500/10 dark:bg-sky-950/40 text-sky-950 dark:text-sky-100 hover:border-sky-500/60"
      }`}
    >
      {/* Cabeçalho do aviso */}
      <div className="flex items-center justify-between gap-1">
        <span
          className={`inline-flex items-center gap-1.5 font-black uppercase text-[10.5px] tracking-wider ${
            isReceived
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-sky-700 dark:text-sky-300"
          }`}
        >
          {isReceived ? (
            <>
              <CornerDownLeft className="h-3.5 w-3.5 stroke-[2.5] text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>📩 RESPOSTA DO CLIENTE RECEBIDA</span>
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5 stroke-[2.5] text-sky-600 dark:text-sky-400 shrink-0" />
              <span>📤 E-MAIL ENVIADO AO CLIENTE</span>
            </>
          )}
        </span>
        <span className="font-mono-tech text-[10px] text-muted-foreground shrink-0">
          {formattedDate}
        </span>
      </div>

      {/* Conteúdo detalhado solicitado nas regras */}
      <div className="space-y-0.5 text-[11px] leading-relaxed">
        <div className="truncate">
          <span className="font-semibold text-muted-foreground">O.S.:</span>{" "}
          <span className="font-mono-tech font-bold text-foreground">#{activeEvent.os_number}</span>
        </div>

        {isReceived ? (
          <div className="truncate">
            <span className="font-semibold text-muted-foreground">Remetente:</span>{" "}
            <span className="font-medium text-foreground">{activeEvent.sender}</span>
          </div>
        ) : (
          <div className="truncate">
            <span className="font-semibold text-muted-foreground">Destinatário:</span>{" "}
            <span className="font-medium text-foreground">{activeEvent.recipients}</span>
          </div>
        )}

        <div className="truncate">
          <span className="font-semibold text-muted-foreground">Assunto:</span>{" "}
          <span className="text-foreground">{activeEvent.subject}</span>
        </div>

        <div className="truncate text-[10px] text-muted-foreground flex items-center gap-1">
          <Mail className="h-3 w-3 inline shrink-0" />
          <span>Caixa: {activeEvent.mailbox}</span>
        </div>

        {/* Prévia da resposta para e-mails recebidos */}
        {isReceived && activeEvent.body_preview && (
          <div className="mt-1 pt-1 border-t border-emerald-500/20 text-[10.5px] italic text-emerald-900/90 dark:text-emerald-200/90 line-clamp-2">
            "{activeEvent.body_preview}"
          </div>
        )}
      </div>
    </div>
  );
}
