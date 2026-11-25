import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Localidade, Regional } from "@/types/delivery";
import {
  fetchLocalidadesByRegional,
  fetchRegionais,
  type RegionalWithCount,
} from "@/lib/regionaisService";

export interface RegionalLocalidadeSelection {
  regionalId: string | null;
  regionalNome: string | null;
  localidadeId: string | null;
  localidadeNome: string | null;
}

interface RegionalLocalidadeSelectorProps {
  regionalId?: string | null;
  localidadeId?: string | null;
  onChange: (selection: RegionalLocalidadeSelection) => void;
  compact?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  regionaisCache?: RegionalWithCount[];
}

export function RegionalLocalidadeSelector({
  regionalId = null,
  localidadeId = null,
  onChange,
  compact = false,
  disabled = false,
  allowClear = true,
  regionaisCache,
}: RegionalLocalidadeSelectorProps) {
  const [regionais, setRegionais] = useState<RegionalWithCount[]>(regionaisCache || []);
  const [loadingRegionais, setLoadingRegionais] = useState(!regionaisCache);
  const [localidades, setLocalidades] = useState<Localidade[]>([]);
  const [loadingLocalidades, setLoadingLocalidades] = useState(false);
  const [localidadeOpen, setLocalidadeOpen] = useState(false);
  const [localidadeSearch, setLocalidadeSearch] = useState("");

  useEffect(() => {
    if (regionaisCache) {
      setRegionais(regionaisCache.filter((r) => r.ativo));
      setLoadingRegionais(false);
      return;
    }
    let mounted = true;
    setLoadingRegionais(true);
    void fetchRegionais(false).then((res) => {
      if (!mounted) return;
      setRegionais(res.data || []);
      setLoadingRegionais(false);
    });
    return () => {
      mounted = false;
    };
  }, [regionaisCache]);

  useEffect(() => {
    if (!regionalId) {
      setLocalidades([]);
      return;
    }
    let mounted = true;
    setLoadingLocalidades(true);
    void fetchLocalidadesByRegional(regionalId, false).then((res) => {
      if (!mounted) return;
      setLocalidades(res.data || []);
      setLoadingLocalidades(false);
    });
    return () => {
      mounted = false;
    };
  }, [regionalId]);

  const selectedRegional: Regional | undefined = useMemo(
    () => regionais.find((r) => r.id === regionalId),
    [regionais, regionalId]
  );

  const selectedLocalidade: Localidade | undefined = useMemo(
    () => localidades.find((l) => l.id === localidadeId),
    [localidades, localidadeId]
  );

  const filteredLocalidades = useMemo(() => {
    const q = localidadeSearch.trim().toLowerCase();
    if (!q) return localidades;
    return localidades.filter((loc) => loc.nome.toLowerCase().includes(q));
  }, [localidades, localidadeSearch]);

  const handleRegionalChange = (value: string) => {
    if (value === "__none__") {
      onChange({
        regionalId: null,
        regionalNome: null,
        localidadeId: null,
        localidadeNome: null,
      });
      return;
    }
    const found = regionais.find((r) => r.id === value);
    // Ao alterar a regional, limpar obrigatoriamente a localidade anteriormente selecionada
    onChange({
      regionalId: value,
      regionalNome: found?.nome || null,
      localidadeId: null,
      localidadeNome: null,
    });
    setLocalidadeSearch("");
  };

  const handleSelectLocalidade = (loc: Localidade | null) => {
    onChange({
      regionalId: regionalId || null,
      regionalNome: selectedRegional?.nome || null,
      localidadeId: loc?.id || null,
      localidadeNome: loc?.nome || null,
    });
    setLocalidadeOpen(false);
  };

  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
      {/* 1. Seletor de Regional */}
      <div className="space-y-1">
        {!compact && <Label className="text-xs font-semibold">Regional</Label>}
        <Select
          value={regionalId || "__none__"}
          onValueChange={handleRegionalChange}
          disabled={disabled || loadingRegionais}
        >
          <SelectTrigger className={cn("text-xs", compact ? "h-8" : "h-9")}>
            <SelectValue placeholder={loadingRegionais ? "Carregando..." : "Selecionar regional"} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {allowClear && <SelectItem value="__none__">Sem região</SelectItem>}
            {regionais.map((reg) => (
              <SelectItem key={reg.id} value={reg.id} className="text-xs">
                <div className="flex items-center justify-between gap-2 w-full">
                  <span>{reg.nome}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 2. Seletor Pesquisável de Bairro / Cidade (somente vinculados à regional) */}
      <div className="space-y-1">
        {!compact && <Label className="text-xs font-semibold">Bairro / Cidade</Label>}
        <Popover open={localidadeOpen} onOpenChange={setLocalidadeOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              disabled={disabled || !regionalId || loadingLocalidades}
              className={cn(
                "w-full justify-between text-xs font-normal px-2.5",
                compact ? "h-8" : "h-9",
                !selectedLocalidade && "text-muted-foreground"
              )}
            >
              <span className="truncate flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" />
                {!regionalId
                  ? "Selecione a regional primeiro"
                  : loadingLocalidades
                  ? "Carregando localidades..."
                  : selectedLocalidade
                  ? selectedLocalidade.nome
                  : "Selecionar bairro ou cidade"}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-2" align="start">
            <div className="space-y-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  value={localidadeSearch}
                  onChange={(e) => setLocalidadeSearch(e.target.value)}
                  placeholder="Buscar bairro ou cidade..."
                  className="h-8 pl-8 pr-7 text-xs"
                />
                {localidadeSearch && (
                  <button
                    type="button"
                    onClick={() => setLocalidadeSearch("")}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <ScrollArea className="h-56">
                <div className="space-y-0.5 pr-2">
                  {allowClear && (
                    <button
                      type="button"
                      onClick={() => handleSelectLocalidade(null)}
                      className={cn(
                        "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left hover:bg-muted transition-colors",
                        !localidadeId && "bg-muted font-medium"
                      )}
                    >
                      <span className="text-muted-foreground">Apenas regional (sem bairro/cidade)</span>
                      {!localidadeId && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  )}

                  {filteredLocalidades.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Nenhuma localidade encontrada.
                    </p>
                  ) : (
                    filteredLocalidades.map((loc) => {
                      const active = loc.id === localidadeId;
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => handleSelectLocalidade(loc)}
                          className={cn(
                            "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-muted transition-colors",
                            active && "bg-primary/10 text-primary font-semibold"
                          )}
                        >
                          <span className="truncate">{loc.nome}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">
                              {loc.tipo}
                            </Badge>
                            {active && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
