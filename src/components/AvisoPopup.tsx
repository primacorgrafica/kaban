import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Info, Clock } from "lucide-react";
import type { Aviso } from "@/hooks/useAvisos";
import { format } from "date-fns";

interface AvisoPopupProps {
  aviso: Aviso | null;
  onDismiss: () => void;
}

const TIPO_CONFIG = {
  info: { icon: Info, color: "text-primary", border: "border-primary/30", bg: "bg-primary/5", label: "Informativo" },
  urgente: { icon: AlertTriangle, color: "text-destructive", border: "border-destructive/30", bg: "bg-destructive/5", label: "Urgente" },
  lembrete: { icon: Clock, color: "text-warning", border: "border-warning/30", bg: "bg-warning/5", label: "Lembrete" },
};

export function AvisoPopup({ aviso, onDismiss }: AvisoPopupProps) {
  if (!aviso) return null;

  const config = TIPO_CONFIG[aviso.tipo] || TIPO_CONFIG.info;
  const Icon = config.icon;

  return (
    <Dialog open={!!aviso} onOpenChange={() => onDismiss()}>
      <DialogContent className={`sm:max-w-md border-2 ${config.border}`}>
        <DialogHeader>
          <div className={`inline-flex items-center gap-2 text-xs font-medium px-2.5 py-1 rounded-full w-fit ${config.bg} ${config.color}`}>
            <Icon className="h-3.5 w-3.5" />
            {config.label}
          </div>
          <DialogTitle className="text-lg mt-2">{aviso.titulo}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {format(new Date(aviso.created_at), "dd/MM/yyyy 'às' HH:mm")}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{aviso.mensagem}</p>
        </div>

        <DialogFooter>
          <Button onClick={onDismiss} className="w-full">Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
