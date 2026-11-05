import { useState, useEffect } from "react";
import { Order } from "@/types/order";
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
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cleanOsNumber, cleanObservationRelatedOrders } from "@/lib/orderRelationsService";
import { cleanObservationProductionPriority } from "@/lib/productionPriority";
import { toast } from "sonner";

interface ProducaoBlockageDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, data: Partial<Order>) => void | Promise<any>;
}

export function ProducaoBlockageDialog({
  order,
  open,
  onOpenChange,
  onUpdate,
}: ProducaoBlockageDialogProps) {
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (order) {
      const clean = cleanObservationProductionPriority(
        cleanObservationRelatedOrders(order.observacao || "")
      );
      setMotivo(clean);
    }
  }, [order, open]);

  if (!order) return null;

  const cleanNum = cleanOsNumber(order.titulo) || order.titulo;
  const isCurrentlyBlocked =
    order.status === "paralisado" ||
    order.status === "aguardando_novo_arquivo" ||
    order.setor_status === "pendencia";

  const handleSaveBlockage = async () => {
    if (!motivo.trim()) {
      toast.warning("Informe o motivo da parada ou bloqueio.");
      return;
    }

    await Promise.resolve(
      onUpdate(order.id, {
        status: "paralisado",
        setor_status: "pendencia",
        observacao: `[BLOQUEIO] ${motivo.trim()}`,
      })
    );

    toast.error(`O.S. #${cleanNum} marcada como PARALISADA / BLOQUEADA.`);
    onOpenChange(false);
  };

  const handleClearBlockage = async () => {
    await Promise.resolve(
      onUpdate(order.id, {
        status: "em_producao",
        setor_status: "entrada",
        observacao: motivo.replace(/\[BLOQUEIO\]\s*/gi, "").trim(),
      })
    );

    toast.success(`Bloqueio da O.S. #${cleanNum} resolvido! A O.S. retornou ao fluxo de produção.`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border text-card-foreground shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span>Sinalização de Parada / Bloqueio — O.S. #{cleanNum}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Informe aos operadores e coordenadores o motivo pelo qual esta ordem está parada ou necessita de atenção.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="blockage-reason" className="text-xs font-semibold">
              Motivo da Parada / Pendência Técnica:
            </Label>
            <Textarea
              id="blockage-reason"
              rows={4}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Aguardando aprovação de alteração de faca pelo cliente, falta de tinta pantone, papel com defeito..."
              className="text-xs bg-background border-border resize-none rounded-xl"
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          {isCurrentlyBlocked ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleClearBlockage}
              className="text-xs text-emerald-500 border-emerald-500/40 hover:bg-emerald-500/10 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Resolver Bloqueio (Liberar)
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveBlockage}
              className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 cursor-pointer"
            >
              Salvar Parada
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
