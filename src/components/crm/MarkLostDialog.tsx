import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CrmOpportunity, LOSS_REASONS } from "@/types/crm";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface MarkLostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: CrmOpportunity | null;
  onConfirm: (opportunityId: string, motivo: string, detalhes?: string) => Promise<boolean>;
}

export function MarkLostDialog({
  open,
  onOpenChange,
  opportunity,
  onConfirm,
}: MarkLostDialogProps) {
  const [motivo, setMotivo] = useState(LOSS_REASONS[0]);
  const [detalhes, setDetalhes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opportunity) return;
    if (!motivo) {
      toast.error("Selecione o motivo da perda.");
      return;
    }

    setSubmitting(true);
    try {
      const ok = await onConfirm(opportunity.id, motivo, detalhes);
      if (ok) {
        onOpenChange(false);
        setDetalhes("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 rounded-2xl border-border bg-card">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2.5 text-rose-500">
            <AlertCircle className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-foreground">
              Marcar Oportunidade como Perdida
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            O registro do motivo de perda é fundamental para as métricas e indicadores de conversão da Primacor Gráfica.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">
              Motivo Principal da Perda <span className="text-rose-500">*</span>
            </Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger className="h-10 rounded-xl bg-background border-border text-xs">
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {LOSS_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Observações e Feedback do Cliente (opcional)
            </Label>
            <Textarea
              value={detalhes}
              onChange={(e) => setDetalhes(e.target.value)}
              placeholder="Ex: Concorrente ofertou 15% menor ou prazo de 3 dias úteis..."
              className="min-h-[80px] rounded-xl text-xs bg-background border-border"
            />
          </div>

          <DialogFooter className="pt-3 border-t border-border gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="rounded-xl text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium"
            >
              {submitting ? "Registrando..." : "Confirmar Perda"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
