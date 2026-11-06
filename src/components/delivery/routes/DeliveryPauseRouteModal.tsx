import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ShieldAlert,
  Disc,
  Wrench,
  HeartPulse,
  Clock,
  AlertTriangle,
  CloudRain,
  HelpCircle,
  Play,
  Pause,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { toggleRoutePause } from "@/lib/deliveryService";
import {
  MOTIVOS_PAUSA_CONFIG,
  type MotivoPausaRota,
  type RotaId,
} from "@/types/delivery";
import type { Order } from "@/types/order";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DeliveryPauseRouteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rotaId: RotaId;
  orders: Order[];
  isPaused: boolean;
  currentMotivo?: MotivoPausaRota | null;
  currentObs?: string | null;
  pausedAt?: string | null;
  onSuccess?: () => void;
}

const MOTIVO_ICONS: Record<MotivoPausaRota, any> = {
  sinistro: ShieldAlert,
  pneu_furado: Disc,
  defeito_mecanico: Wrench,
  saude: HeartPulse,
  excedeu_jornada: Clock,
  problema_via: AlertTriangle,
  mau_tempo: CloudRain,
  outro: HelpCircle,
};

export function DeliveryPauseRouteModal({
  open,
  onOpenChange,
  rotaId,
  orders,
  isPaused,
  currentMotivo,
  currentObs,
  pausedAt,
  onSuccess,
}: DeliveryPauseRouteModalProps) {
  const [selectedMotivo, setSelectedMotivo] = useState<MotivoPausaRota>("pneu_furado");
  const [observacao, setObservacao] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (isPaused && currentMotivo) {
        setSelectedMotivo(currentMotivo);
        setObservacao(currentObs || "");
      } else {
        setSelectedMotivo("pneu_furado");
        setObservacao("");
      }
    }
  }, [open, isPaused, currentMotivo, currentObs]);

  const activeOrdersInRoute = orders.filter(
    (o) => o.status_entrega !== "entregue"
  );

  const handlePause = async () => {
    if (activeOrdersInRoute.length === 0) {
      toast.error("Não há entregas ativas para pausar nesta rota.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await toggleRoutePause({
        orderIds: activeOrdersInRoute.map((o) => o.id),
        paused: true,
        motivo: selectedMotivo,
        obs: observacao,
      });

      if (!res.success) {
        toast.error(`Falha ao pausar rota: ${res.error || "Erro desconhecido"}`);
        return;
      }

      toast.warning(
        `Rota ${rotaId} foi pausada: ${MOTIVOS_PAUSA_CONFIG[selectedMotivo].label}`
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(`Erro: ${err.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResume = async () => {
    setSubmitting(true);
    try {
      const res = await toggleRoutePause({
        orderIds: orders.map((o) => o.id),
        paused: false,
      });

      if (!res.success) {
        toast.error(`Falha ao retomar rota: ${res.error || "Erro desconhecido"}`);
        return;
      }

      toast.success(`Rota ${rotaId} retomada com sucesso!`);
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(`Erro: ${err.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border shadow-2xl p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div
              className={`p-2 rounded-lg ${
                isPaused
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-red-500/10 text-red-500"
              }`}
            >
              {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {isPaused
                  ? `Retomar Rota ${rotaId}`
                  : `Pausar Rota ${rotaId} — Registro de Imprevisto`}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isPaused
                  ? "A rota está atualmente suspensa. Clique abaixo para restabelecer o fluxo normal de entregas."
                  : "Selecione o motivo padronizado da parada e informe observações complementares."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isPaused ? (
          <div className="flex flex-col gap-4 my-2">
            <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 flex flex-col gap-2">
              <div className="flex items-center gap-2 font-semibold text-amber-500 text-sm">
                <AlertCircle className="h-4 w-4" />
                Motivo da Pausa:{" "}
                {currentMotivo
                  ? MOTIVOS_PAUSA_CONFIG[currentMotivo]?.label || currentMotivo
                  : "Não especificado"}
              </div>
              {currentObs && (
                <div className="text-xs text-foreground bg-background/50 p-2.5 rounded-lg border border-border/50">
                  <span className="font-semibold text-muted-foreground block text-[10px] uppercase">
                    Observação:
                  </span>
                  {currentObs}
                </div>
              )}
              {pausedAt && (
                <div className="text-[11px] text-muted-foreground">
                  Pausada em:{" "}
                  {format(parseISO(pausedAt), "dd/MM/yyyy 'às' HH:mm", {
                    locale: ptBR,
                  })}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              Existem <strong>{activeOrdersInRoute.length}</strong> entregas suspensas nesta rota.
              Ao retomar, o entregador receberá a sinalização no aplicativo mobile.
            </div>

            <DialogFooter className="mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Voltar
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
                onClick={handleResume}
                disabled={submitting}
              >
                <Play className="h-4 w-4" />
                {submitting ? "Retomando..." : "Retomar Rota"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4 my-2">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-semibold text-foreground">
                Selecione o Motivo Padronizado *
              </Label>
              <div className="grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
                {(
                  Object.entries(MOTIVOS_PAUSA_CONFIG) as [
                    MotivoPausaRota,
                    (typeof MOTIVOS_PAUSA_CONFIG)[MotivoPausaRota]
                  ][]
                ).map(([key, config]) => {
                  const Icon = MOTIVO_ICONS[key] || HelpCircle;
                  const isSelected = selectedMotivo === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedMotivo(key)}
                      className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                          : "border-border bg-card hover:bg-muted/40 text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-medium text-xs">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{config.label}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground line-clamp-2">
                        {config.descricao}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-foreground">
                Observação Complementar
              </Label>
              <Textarea
                placeholder="Detalhes adicionais do imprevisto (ex: mecânico acionado, previsão de retorno 15h, etc.)..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="text-xs min-h-[70px] resize-none"
              />
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
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5"
                onClick={handlePause}
                disabled={submitting}
              >
                <Pause className="h-4 w-4" />
                {submitting ? "Pausando..." : "Confirmar Pausa da Rota"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
