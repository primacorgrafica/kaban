import { Bike, Car, Lock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { updateDeliveryVehicleType } from "@/lib/deliveryService";
import type { VeiculoCategoria } from "@/types/delivery";

interface DeliveryVehicleTypeCellProps {
  orderId: string;
  tipo?: "carro" | "moto" | string | null;
  onTypeUpdated?: (newType: "carro" | "moto") => void;
  canManage?: boolean;
}

export function DeliveryVehicleTypeCell({
  orderId,
  tipo,
  onTypeUpdated,
  canManage,
}: DeliveryVehicleTypeCellProps) {
  const permissions = usePermissions();
  const allowedToEdit =
    canManage !== undefined
      ? canManage
      : Boolean(permissions.canManageExpedicao || permissions.isAdmin);

  const currentType: "carro" | "moto" =
    tipo === "carro" ? "carro" : "moto";

  const handleSelect = async (newType: "carro" | "moto") => {
    if (!allowedToEdit) {
      toast.error("Apenas o responsável pela Expedição e administradores podem alterar o tipo de veículo.");
      return;
    }
    if (newType === currentType) return;
    const res = await updateDeliveryVehicleType(orderId, newType);
    if (!res.success) {
      toast.error(res.error || "Erro ao atualizar tipo de veículo.");
      return;
    }
    toast.success(`Veículo alterado para ${newType === "carro" ? "Carro" : "Moto"}`);
    onTypeUpdated?.(newType);
  };

  // Se não tiver permissão para editar, renderiza como indicador fixo e protegido
  if (!allowedToEdit) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-border/60 bg-muted/40 text-xs font-medium opacity-80 cursor-not-allowed"
        title="Tipo de veículo definido. Apenas gestores da Expedição ou administradores podem alterar."
      >
        {currentType === "carro" ? (
          <>
            <Car className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-foreground">Carro</span>
          </>
        ) : (
          <>
            <Bike className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-foreground">Moto</span>
          </>
        )}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-border bg-card hover:bg-muted text-xs font-medium cursor-pointer transition-colors"
          title={`Tipo de veículo: ${currentType === "carro" ? "Carro" : "Moto"}. Clique para alterar.`}
        >
          {currentType === "carro" ? (
            <>
              <Car className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-foreground">Carro</span>
            </>
          ) : (
            <>
              <Bike className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-foreground">Moto</span>
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="text-xs w-28">
        <DropdownMenuItem
          onClick={() => handleSelect("moto")}
          className="flex items-center gap-2 cursor-pointer text-xs"
        >
          <Bike className="h-3.5 w-3.5 text-emerald-400" />
          <span>Moto</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSelect("carro")}
          className="flex items-center gap-2 cursor-pointer text-xs"
        >
          <Car className="h-3.5 w-3.5 text-blue-400" />
          <span>Carro</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
