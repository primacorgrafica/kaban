import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Layers, CheckCircle2, User } from "lucide-react";
import { toast } from "sonner";
import { groupOrdersInStop } from "@/lib/deliveryService";
import type { Order } from "@/types/order";
import { cleanOsNumber } from "@/components/ProductionCard";

interface GroupOrdersModalProps {
  baseOrder: Order | null;
  allOrders: Order[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function GroupOrdersModal({
  baseOrder,
  allOrders,
  open,
  onOpenChange,
  onSuccess,
}: GroupOrdersModalProps) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Filtra outras O.S. do mesmo cliente que ainda não estão entregues
  const candidateOrders = useMemo(() => {
    if (!baseOrder) return [];
    const clientName = baseOrder.cliente.trim().toLowerCase();

    return allOrders.filter(
      (o) =>
        o.id !== baseOrder.id &&
        o.cliente.trim().toLowerCase() === clientName &&
        o.status_entrega !== "entregue"
    );
  }, [baseOrder, allOrders]);

  if (!baseOrder) return null;

  const handleToggle = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const handleGroup = async () => {
    if (selectedOrderIds.size === 0) {
      toast.error("Selecione pelo menos uma outra O.S. para agrupar.");
      return;
    }

    setSubmitting(true);
    try {
      const idsToGroup = [baseOrder.id, ...Array.from(selectedOrderIds)];
      const res = await groupOrdersInStop(idsToGroup);

      if (!res.success) {
        toast.error(`Falha ao agrupar entregas: ${res.error}`);
        return;
      }

      toast.success(
        `${idsToGroup.length} O.S. do cliente ${baseOrder.cliente} agrupadas na mesma parada com sucesso!`
      );
      setSelectedOrderIds(new Set());
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(`Erro ao agrupar: ${err.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Agrupar O.S. na Mesma Parada
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <User className="h-3 w-3" />
                Cliente: <strong>{baseOrder.cliente}</strong>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3 my-2 text-xs">
          <div className="p-2.5 rounded-lg bg-muted/40 border text-xs">
            <span className="font-semibold block text-foreground">
              O.S. Principal de Origem:
            </span>
            <div className="flex items-center justify-between mt-1 text-muted-foreground">
              <span className="font-mono text-primary font-bold">
                OS #{cleanOsNumber(baseOrder.titulo)}
              </span>
              <span className="truncate max-w-[200px]">{baseOrder.descricao}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-semibold text-foreground text-xs">
              Selecione as outras O.S. do cliente para incluir nesta parada:
            </span>

            {candidateOrders.length === 0 ? (
              <div className="text-center py-6 border border-dashed rounded-lg text-muted-foreground text-xs">
                Não foram encontradas outras O.S. ativas para este cliente.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                {candidateOrders.map((cand) => {
                  const isChecked = selectedOrderIds.has(cand.id);
                  return (
                    <label
                      key={cand.id}
                      className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all ${
                        isChecked
                          ? "bg-primary/10 border-primary"
                          : "bg-card border-border hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => handleToggle(cand.id)}
                        />
                        <div className="flex flex-col overflow-hidden">
                          <span className="font-mono font-bold text-foreground">
                            OS #{cleanOsNumber(cand.titulo)}
                          </span>
                          <span className="text-[11px] text-muted-foreground truncate">
                            {cand.descricao}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {cand.rota_numero ? `Rota ${cand.rota_numero}` : "Sem rota"}
                      </Badge>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={submitting || selectedOrderIds.size === 0}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5"
            onClick={handleGroup}
          >
            <CheckCircle2 className="h-4 w-4" />
            {submitting ? "Agrupando..." : `Agrupar (${selectedOrderIds.size + 1} O.S.)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
