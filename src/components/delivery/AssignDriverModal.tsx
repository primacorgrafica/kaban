import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getEntregadoresList, assignDriverToOrder } from "@/lib/deliveryService";
import type { Entregador, DeliveryStatus } from "@/types/delivery";
import type { Order } from "@/types/order";
import { Bike, UserX, AlertCircle } from "lucide-react";

interface AssignDriverModalProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AssignDriverModal({ order, open, onOpenChange, onSuccess }: AssignDriverModalProps) {
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("none");
  const [ordemParada, setOrdemParada] = useState<string>("");

  useEffect(() => {
    if (!open) return;

    // Sincroniza estado inicial com a ordem
    setSelectedDriverId(order?.entregador_id || "none");
    setOrdemParada(order?.ordem_parada ? String(order.ordem_parada) : "");

    const loadDrivers = async () => {
      setLoading(true);
      const res = await getEntregadoresList();
      if (res.data) {
        // Exibe ativos primeiro
        const sorted = [...res.data].sort((a, b) => {
          if (a.ativo && !b.ativo) return -1;
          if (!a.ativo && b.ativo) return 1;
          return a.nome_completo.localeCompare(b.nome_completo);
        });
        setEntregadores(sorted);
      }
      setLoading(false);
    };

    void loadDrivers();
  }, [open, order]);

  if (!order) return null;

  const currentStatus = (order.status_entrega || "pendente") as DeliveryStatus;
  const isInTransit = currentStatus === "em_rota" || currentStatus === "no_local";
  const isDelivered = currentStatus === "entregue";

  const handleSave = async () => {
    if (isDelivered) {
      toast.error("Não é possível alterar uma ordem já entregue.");
      return;
    }

    const newDriverId = selectedDriverId === "none" ? null : selectedDriverId;
    const paradaNum = ordemParada.trim() ? parseInt(ordemParada.trim(), 10) : null;

    if (newDriverId === null && isInTransit) {
      toast.error(
        `Não é possível desatribuir uma entrega que já está em trânsito (${currentStatus}). Registre a ocorrência de insucesso ou reatribua a outro motoboy ativo.`
      );
      return;
    }

    setSubmitting(true);
    const res = await assignDriverToOrder(order.id, newDriverId, paradaNum);
    setSubmitting(false);

    if (res.success) {
      toast.success(
        newDriverId
          ? "Entregador atribuído com sucesso à O.S.!"
          : "Entrega desatribuída e retornada à fila pendente."
      );
      onOpenChange(false);
      onSuccess?.();
    } else {
      toast.error(res.error || "Erro ao atualizar atribuição da O.S.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-semibold">
            <Bike className="h-5 w-5 text-primary" />
            Atribuir Entregador — {order.titulo}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Informações da O.S. */}
          <div className="bg-muted/40 p-3 rounded-md text-xs flex flex-col gap-1 border border-border">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente:</span>
              <span className="font-medium text-foreground">{order.cliente}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status Atual:</span>
              <span className="font-semibold uppercase tracking-wider text-primary">
                {order.status_entrega || "pendente"}
              </span>
            </div>
            {order.entrega_endereco && (
              <div className="text-muted-foreground mt-1 pt-1 border-t border-border/50">
                <span className="font-medium text-foreground">Destino: </span>
                {order.entrega_endereco}
              </div>
            )}
          </div>

          {isInTransit && (
            <div className="flex items-start gap-2 bg-amber-950/40 border border-amber-800 p-2.5 rounded-md text-xs text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <span>
                Esta mercadoria já está em trânsito com o motoboy. A desatribuição sem destino está bloqueada por segurança de custódia.
              </span>
            </div>
          )}

          {/* Seleção do Entregador */}
          <div className="space-y-1.5">
            <Label htmlFor="entregador-select" className="text-xs font-medium">
              Selecione o Motoboy / Entregador
            </Label>
            <Select
              value={selectedDriverId}
              onValueChange={setSelectedDriverId}
              disabled={loading || isDelivered}
            >
              <SelectTrigger id="entregador-select" className="bg-background">
                <SelectValue placeholder="Selecione um entregador..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-muted-foreground">
                  (Nenhum / Desatribuído)
                </SelectItem>
                {entregadores.map((d) => (
                  <SelectItem
                    key={d.user_id}
                    value={d.user_id}
                    disabled={!d.ativo}
                    className={!d.ativo ? "opacity-50" : ""}
                  >
                    {d.nome_completo} {!d.ativo && "(Inativo)"} {d.placa_veiculo ? `• ${d.placa_veiculo}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {entregadores.length === 0 && !loading && (
              <p className="text-[11px] text-muted-foreground">
                Nenhum entregador cadastrado. Acesse a gestão de usuários para cadastrar motoboys.
              </p>
            )}
          </div>

          {/* Ordem da parada */}
          <div className="space-y-1.5">
            <Label htmlFor="ordem-parada" className="text-xs font-medium">
              Ordem da Parada na Rota (Opcional)
            </Label>
            <Input
              id="ordem-parada"
              type="number"
              min={1}
              max={99}
              placeholder="Ex: 1 para primeira entrega, 2 para segunda..."
              value={ordemParada}
              onChange={(e) => setOrdemParada(e.target.value)}
              disabled={isDelivered}
              className="bg-background"
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 border-t border-border pt-3">
          {order.entregador_id && !isInTransit && !isDelivered ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                setSelectedDriverId("none");
                setOrdemParada("");
              }}
              disabled={submitting}
              className="gap-1.5 text-xs"
            >
              <UserX className="h-3.5 w-3.5" />
              Remover Atribuição
            </Button>
          ) : <div />}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={submitting || isDelivered}
            >
              {submitting ? "Gravando..." : "Salvar Atribuição"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
