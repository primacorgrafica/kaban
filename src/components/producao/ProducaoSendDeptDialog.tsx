import { useState } from "react";
import { Order } from "@/types/order";
import { Department, DEPARTMENTS } from "@/types/production";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Layers, Printer, Factory, Truck, RotateCcw } from "lucide-react";
import { cleanOsNumber } from "@/lib/orderRelationsService";
import { toast } from "sonner";

interface ProducaoSendDeptDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendToProduction: (id: string, department: Department, machine?: string) => void | Promise<any>;
  onSendBackToPrePress?: (id: string) => void | Promise<any>;
  onSendToExpedicao?: (id: string) => void | Promise<any>;
}

export function ProducaoSendDeptDialog({
  order,
  open,
  onOpenChange,
  onSendToProduction,
  onSendBackToPrePress,
  onSendToExpedicao,
}: ProducaoSendDeptDialogProps) {
  const [selectedDept, setSelectedDept] = useState<string>("");

  if (!order) return null;

  const cleanNum = cleanOsNumber(order.titulo) || order.titulo;

  const handleConfirmSend = async () => {
    if (!selectedDept) {
      toast.warning("Selecione o setor de destino.");
      return;
    }

    if (selectedDept === "pre_impressao") {
      if (onSendBackToPrePress) {
        await Promise.resolve(onSendBackToPrePress(order.id));
      }
    } else if (selectedDept === "expedicao") {
      if (onSendToExpedicao) {
        await Promise.resolve(onSendToExpedicao(order.id));
      } else {
        await Promise.resolve(onSendToProduction(order.id, "expedicao"));
      }
    } else {
      await Promise.resolve(onSendToProduction(order.id, selectedDept as Department));
    }

    onOpenChange(false);
    setSelectedDept("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-card border-border text-card-foreground shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Send className="h-5 w-5 text-sky-400" />
            <span>Mover O.S. #{cleanNum} de Setor</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Selecione para qual setor produtivo deseja encaminhar a O.S. <strong>#{cleanNum}</strong> ({order.cliente}).
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Setor de Destino:</Label>
            <Select value={selectedDept} onValueChange={setSelectedDept}>
              <SelectTrigger className="w-full text-xs bg-background border-border rounded-xl">
                <SelectValue placeholder="Selecione o setor..." />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border text-popover-foreground">
                <SelectItem value="ctp" className="text-xs">
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-sky-400" />
                    <span>CTP (Gravação de Chapas)</span>
                  </div>
                </SelectItem>
                <SelectItem value="digital" className="text-xs">
                  <div className="flex items-center gap-2">
                    <Printer className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Digital (Plotter / Laser)</span>
                  </div>
                </SelectItem>
                <SelectItem value="producao" className="text-xs">
                  <div className="flex items-center gap-2">
                    <Factory className="h-3.5 w-3.5 text-amber-400" />
                    <span>Produção Geral (Offset / Acabamento)</span>
                  </div>
                </SelectItem>
                <SelectItem value="qualidade" className="text-xs">
                  <div className="flex items-center gap-2">
                    <Factory className="h-3.5 w-3.5 text-purple-400" />
                    <span>Qualidade</span>
                  </div>
                </SelectItem>
                <SelectItem value="expedicao" className="text-xs">
                  <div className="flex items-center gap-2">
                    <Truck className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Expedição</span>
                  </div>
                </SelectItem>
                <SelectItem value="pre_impressao" className="text-xs text-amber-500">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                    <span>Devolver para Pré-Impressão</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-end gap-2">
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
            onClick={handleConfirmSend}
            disabled={!selectedDept}
            className="text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 cursor-pointer"
          >
            Mover Agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
