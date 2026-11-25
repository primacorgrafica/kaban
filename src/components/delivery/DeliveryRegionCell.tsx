import { useState } from "react";
import { MapPin, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { SEM_REGIAO_LABEL } from "@/types/delivery";
import {
  RegionalLocalidadeSelector,
  type RegionalLocalidadeSelection,
} from "@/components/regionais/RegionalLocalidadeSelector";
import { updateDeliveryRegion } from "@/lib/deliveryService";
import type { RegionalWithCount } from "@/lib/regionaisService";

interface DeliveryRegionCellProps {
  orderId: string;
  regiao?: string | null;
  regionalId?: string | null;
  localidadeId?: string | null;
  onRegionUpdated?: (selection: RegionalLocalidadeSelection) => void;
  regionaisCache?: RegionalWithCount[];
}

export function DeliveryRegionCell({
  orderId,
  regiao,
  regionalId,
  localidadeId,
  onRegionUpdated,
  regionaisCache,
}: DeliveryRegionCellProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const displayLabel = regiao?.trim() || SEM_REGIAO_LABEL;
  const isSemRegiao = displayLabel === SEM_REGIAO_LABEL;

  const handleChange = async (selection: RegionalLocalidadeSelection) => {
    setSaving(true);
    const finalRegiao = selection.regionalNome || null;

    const res = await updateDeliveryRegion(orderId, {
      regional_id: selection.regionalId,
      localidade_id: selection.localidadeId,
      regiao: finalRegiao,
    });
    setSaving(false);

    if (!res.success) {
      toast.error(res.error || "Erro ao atualizar região da entrega.");
      return;
    }

    toast.success(
      finalRegiao
        ? `Região atualizada para: ${finalRegiao}${selection.localidadeNome ? ` (${selection.localidadeNome})` : ""}`
        : "Região desmarcada (Sem região)."
    );
    onRegionUpdated?.(selection);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group/reg inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-border bg-card hover:bg-muted text-xs font-medium cursor-pointer transition-colors max-w-[140px] text-left"
          title={`Região: ${displayLabel}. Clique para alterar.`}
        >
          <MapPin
            className={`h-3 w-3 shrink-0 ${
              isSemRegiao ? "text-amber-500" : "text-primary"
            }`}
          />
          <span
            className={`truncate ${
              isSemRegiao
                ? "text-amber-500/90 font-normal italic"
                : "text-foreground font-semibold"
            }`}
          >
            {displayLabel}
          </span>
          <Pencil className="h-2.5 w-2.5 opacity-0 group-hover/reg:opacity-70 ml-auto shrink-0 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-3" align="start">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">Definir Região / Localidade</span>
            {saving && <span className="text-[10px] text-muted-foreground animate-pulse">Salvando...</span>}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Selecione a regional e o bairro/cidade correspondente ao endereço desta entrega.
          </p>
          <RegionalLocalidadeSelector
            regionalId={regionalId}
            localidadeId={localidadeId}
            onChange={handleChange}
            regionaisCache={regionaisCache}
            compact
            disabled={saving}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
