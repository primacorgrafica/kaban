import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MuralAlerta } from "@/types/mural";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Megaphone, AlertTriangle, Info, Calendar, User, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

interface MuralDetailDialogProps {
  alerta: MuralAlerta | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (alerta: MuralAlerta) => void;
  canManage?: boolean;
}

export function MuralDetailDialog({
  alerta,
  open,
  onOpenChange,
  onEdit,
  canManage,
}: MuralDetailDialogProps) {
  if (!alerta) return null;

  const tipoConfig = {
    urgente: {
      badge: "Urgente",
      badgeClass: "bg-red-500/20 text-red-400 border-red-500/40",
      icon: AlertTriangle,
      iconColor: "text-red-500",
      bannerBorder: "border-red-500/40",
    },
    importante: {
      badge: "Importante",
      badgeClass: "bg-amber-500/20 text-amber-400 border-amber-500/40",
      icon: Megaphone,
      iconColor: "text-amber-500",
      bannerBorder: "border-amber-500/40",
    },
    info: {
      badge: "Informativo",
      badgeClass: "bg-sky-500/20 text-sky-400 border-sky-500/40",
      icon: Info,
      iconColor: "text-sky-400",
      bannerBorder: "border-sky-500/40",
    },
  }[alerta.tipo] || {
    badge: "Alerta",
    badgeClass: "bg-red-500/20 text-red-400 border-red-500/40",
    icon: Megaphone,
    iconColor: "text-red-500",
    bannerBorder: "border-red-500/40",
  };

  const Icon = tipoConfig.icon;
  const formattedDate = format(new Date(alerta.created_at), "dd/MM/yyyy 'às' HH:mm", {
    locale: ptBR,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border shadow-2xl text-foreground">
        <DialogHeader className="space-y-2 pb-2 border-b border-border/60">
          <div className="flex items-center justify-between gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wide flex items-center gap-1.5 ${tipoConfig.badgeClass}`}>
              <Icon className="h-3 w-3" />
              <span>{tipoConfig.badge}</span>
            </span>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono-tech">
              <Calendar className="h-3 w-3" />
              <span>{formattedDate}</span>
            </div>
          </div>
          <DialogTitle className="text-base font-bold text-foreground leading-snug pt-1">
            {alerta.titulo}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap bg-muted/30 p-3.5 rounded-xl border border-border/50">
            {alerta.mensagem}
          </div>

          {alerta.autor_nome && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono-tech pt-1">
              <User className="h-3 w-3" />
              <span>Publicado por: <strong className="text-foreground">{alerta.autor_nome}</strong></span>
            </div>
          )}
        </div>

        <DialogFooter className="flex sm:justify-between items-center gap-2 pt-2 border-t border-border/60">
          <Link
            to="/mural"
            onClick={() => onOpenChange(false)}
            className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold"
          >
            <ExternalLink className="h-3 w-3" />
            <span>Ver Mural Completo</span>
          </Link>

          <div className="flex items-center gap-2">
            {canManage && onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(alerta);
                }}
                className="text-xs"
              >
                Editar
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs bg-[#253745] hover:bg-[#324859] text-white"
            >
              Fechar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
