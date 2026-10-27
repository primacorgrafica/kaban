import { useState, useEffect } from "react";
import { Bell, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Info, Clock } from "lucide-react";
import { format } from "date-fns";
import type { Aviso } from "@/hooks/useAvisos";

interface NotificationBellProps {
  avisos: Aviso[];
  naoLidos: Aviso[];
  lidos: Set<string>;
  onRead: (avisoId: string) => void;
  onMarkAllRead: () => void;
  onClear: () => void;
  onViewAviso: (aviso: Aviso) => void;
}

const TIPO_CONFIG: Record<string, { icon: typeof Info; color: string; bg: string; label: string }> = {
  info: { icon: Info, color: "text-primary", bg: "bg-primary/10", label: "INFO" },
  urgente: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", label: "URGENTE" },
  lembrete: { icon: Clock, color: "text-warning", bg: "bg-warning/10", label: "LEMBRETE" },
};

export function NotificationBell({ avisos, naoLidos, lidos, onRead, onMarkAllRead, onClear, onViewAviso }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const count = naoLidos.length;

  // When the sheet opens, mark all notifications as read so the badge clears
  useEffect(() => {
    if (open && count > 0) {
      onMarkAllRead();
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[380px] sm:w-[420px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-base">Meus Avisos</SheetTitle>
              <p className="text-xs text-muted-foreground">{count} não lido(s) · {avisos.length} total</p>
            </div>
            {avisos.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="h-8 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg gap-1.5"
                title="Limpar todas as notificações"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar tudo
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {avisos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Nenhum aviso recebido</p>
          ) : (
            <div className="divide-y divide-border/50">
              {avisos.map((aviso) => {
                const isRead = lidos.has(aviso.id);
                const config = TIPO_CONFIG[aviso.tipo] || TIPO_CONFIG.info;
                const Icon = config.icon;

                return (
                  <button
                    key={aviso.id}
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-accent/50 ${
                      !isRead ? "bg-primary/5" : ""
                    }`}
                    onClick={() => {
                      onViewAviso(aviso);
                      if (!isRead) onRead(aviso.id);
                      setOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {!isRead && (
                        <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                        <Icon className="h-3 w-3" />
                        {config.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {format(new Date(aviso.created_at), "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>
                    <p className={`text-sm truncate ${!isRead ? "font-semibold" : "font-medium text-muted-foreground"}`}>
                      {aviso.titulo}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{aviso.mensagem}</p>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
