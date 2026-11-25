import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Bike } from "lucide-react";
import { DriverManagementPanel } from "./DriverManagementPanel";

interface DriverManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDriversUpdated?: () => void;
}

export function DriverManagementModal({
  open,
  onOpenChange,
  onDriversUpdated,
}: DriverManagementModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-card border-border shadow-2xl p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Bike className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                Cadastro de Entregadores
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Gerencie a frota de entregadores (Moto ou Carro), documentos e status ativo/inativo preservando o histórico de rotas.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2">
          <DriverManagementPanel
            mode="modal"
            active={open}
            onDriversUpdated={onDriversUpdated}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
