import React, { useState, useEffect } from "react";
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
import { AlertCircle, XCircle } from "lucide-react";
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
  const [motivo, setMotivo] = useState("");
  const [detalhes, setDetalhes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMotivo("");
      setDetalhes("");
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opportunity) return;
    if (!motivo) {
      toast.error("É obrigatório selecionar o motivo da perda.");
      return;
    }
    if (motivo === "Outro motivo" && !detalhes.trim()) {
      toast.error("Por favor, descreva o motivo específico nas observações.");
      return;
    }

    setSubmitting(true);
    try {
      const ok = await onConfirm(opportunity.id, motivo, detalhes.trim());
      if (ok) {
        onOpenChange(false);
        setMotivo("");
        setDetalhes("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 rounded-2xl border-border bg-card shadow-2xl font-pcp">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2.5 text-rose-500">
            <XCircle className="h-5 w-5 shrink-0" />
            <DialogTitle className="text-base font-bold text-foreground">
              Registrar Motivo da Perda
            </DialogTitle>
          </div>
          {opportunity && (
            <div className="p-2.5 rounded-xl bg-muted/40 border border-border/70 text-xs">
              <span className="font-semibold text-foreground block truncate">
                {opportunity.titulo}
              </span>
              <span className="text-muted-foreground block truncate mt-0.5">
                Cliente: <strong className="text-foreground">{opportunity.cliente_nome}</strong>
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            O preenchimento do motivo é obrigatório para registrar a venda como perdida e alimentar as métricas comerciais.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Motivo Principal da Perda <span className="text-rose-500">*</span></span>
              {!motivo && (
                <span className="text-[10px] text-rose-400 font-normal">Obrigatório</span>
              )}
            </Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger className="h-10 rounded-xl bg-background border-border text-xs focus:ring-1 focus:ring-rose-500">
                <SelectValue placeholder="Selecione o motivo da perda..." />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {LOSS_REASONS.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs cursor-pointer">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {motivo === "Outro motivo" ? (
                <span className="text-foreground font-semibold">
                  Especifique o motivo da perda <span className="text-rose-500">*</span>
                </span>
              ) : (
                "Observações e Feedback do Cliente (opcional)"
              )}
            </Label>
            <Textarea
              value={detalhes}
              onChange={(e) => setDetalhes(e.target.value)}
              placeholder={
                motivo === "Outro motivo"
                  ? "Descreva com detalhes o motivo pelo qual o cliente não fechou..."
                  : "Ex: Concorrente ofertou 15% menor ou prazo de entrega em 3 dias úteis..."
              }
              className={`min-h-[85px] rounded-xl text-xs bg-background border-border ${
                motivo === "Outro motivo" && !detalhes.trim()
                  ? "border-rose-500/60 focus:ring-rose-500"
                  : ""
              }`}
            />
          </div>

          <DialogFooter className="pt-3 border-t border-border gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !motivo || (motivo === "Outro motivo" && !detalhes.trim())}
              className="rounded-xl text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Registrando..." : "Confirmar Perda"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
