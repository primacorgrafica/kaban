import { useState, useEffect, useRef } from "react";
import { Order, RelatedOrderSummary } from "@/types/order";
import {
  searchOrdersForRelation,
  getRelatedOrdersInfo,
  getSectorFriendlyLabel,
} from "@/lib/orderRelationsService";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Search, X, Check, Loader2, Layers } from "lucide-react";

interface RelatedOrdersFieldProps {
  currentOrderId?: string;
  selectedOrderIds: string[];
  onChange: (newIds: string[]) => void;
  existingOrders?: Order[];
}

export function RelatedOrdersField({
  currentOrderId,
  selectedOrderIds,
  onChange,
  existingOrders = [],
}: RelatedOrdersFieldProps) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<RelatedOrderSummary[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<RelatedOrderSummary[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Carrega os detalhes completos das O.S. selecionadas
  useEffect(() => {
    let isMounted = true;
    if (selectedOrderIds.length === 0) {
      setSelectedDetails([]);
      return;
    }

    void getRelatedOrdersInfo(selectedOrderIds, existingOrders).then((details) => {
      if (isMounted) {
        setSelectedDetails(details);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedOrderIds, existingOrders]);

  // Busca debounced ao digitar no campo de busca
  useEffect(() => {
    let isMounted = true;
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchOrdersForRelation(query, currentOrderId, existingOrders);
      if (isMounted) {
        setSearchResults(results);
        setIsSearching(false);
        setShowDropdown(true);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query, currentOrderId, existingOrders]);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectOrder = (order: RelatedOrderSummary) => {
    if (order.id === currentOrderId) return;
    if (selectedOrderIds.includes(order.id)) return;

    const nextIds = [...selectedOrderIds, order.id];
    onChange(nextIds);
    setQuery("");
    setShowDropdown(false);
  };

  const handleRemoveOrder = (idToRemove: string) => {
    const nextIds = selectedOrderIds.filter((id) => id !== idToRemove);
    onChange(nextIds);
  };

  return (
    <div className="p-3.5 rounded-xl border border-border bg-card/60 dark:bg-[#11212D]/60 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Link2 className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />
          <span>O.S. Relacionadas (Mesmo Projeto / Serviço)</span>
        </Label>
        {selectedOrderIds.length > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] font-mono-tech border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5"
          >
            {selectedOrderIds.length} {selectedOrderIds.length === 1 ? "vinculada" : "vinculadas"}
          </Badge>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Vincule ordens que fazem parte do mesmo trabalho dividido em múltiplos cards. O vínculo é{" "}
        <strong className="text-foreground">bidirecional</strong> e facilitará a navegação direta entre elas.
      </p>

      {/* Campo de Busca com Autocomplete */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => {
              if (searchResults.length > 0) setShowDropdown(true);
            }}
            placeholder="Buscar por N.º da O.S., Cliente ou Descrição para vincular..."
            className="h-9 pl-9 pr-8 bg-background border-input text-foreground text-xs rounded-xl focus:border-[#4A5C6A] focus:ring-1 focus:ring-[#9BA8AB]/40"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
          )}
        </div>

        {/* Dropdown de Resultados da Pesquisa */}
        {showDropdown && query.trim().length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-popover border border-border text-popover-foreground rounded-xl shadow-2xl z-50 p-1 divide-y divide-border/40">
            {searchResults.length === 0 && !isSearching ? (
              <div className="py-3 px-4 text-center text-xs text-muted-foreground">
                Nenhuma O.S. encontrada para "{query}".
              </div>
            ) : (
              searchResults.map((res) => {
                const isSelected = selectedOrderIds.includes(res.id);
                return (
                  <button
                    key={res.id}
                    type="button"
                    disabled={isSelected}
                    onClick={() => handleSelectOrder(res)}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-2 transition-all ${
                      isSelected
                        ? "opacity-50 cursor-not-allowed bg-muted/40"
                        : "hover:bg-accent hover:text-accent-foreground cursor-pointer"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tech font-bold text-xs text-amber-600 dark:text-amber-400">
                          #{res.titulo}
                        </span>
                        <span className="text-xs font-medium text-foreground truncate max-w-[200px]">
                          {res.cliente || "Sem cliente"}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[9px] px-1.5 py-0 bg-muted/80 text-muted-foreground shrink-0"
                        >
                          {getSectorFriendlyLabel(res.setor, res.arquivado)}
                        </Badge>
                      </div>
                      {res.descricao && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {res.descricao}
                        </p>
                      )}
                    </div>
                    {isSelected ? (
                      <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1 shrink-0">
                        <Check className="h-3 w-3 text-emerald-500" /> Já vinculada
                      </span>
                    ) : (
                      <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30 hover:bg-primary/30 shrink-0">
                        + Vincular
                      </Badge>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Lista de O.S. Vinculadas */}
      <div className="space-y-1.5">
        {selectedDetails.length === 0 ? (
          <div className="text-center py-2 px-3 rounded-lg border border-dashed border-border/70 bg-background/40 text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
            <Layers className="h-3.5 w-3.5 opacity-60" />
            <span>Nenhuma O.S. relacionada vinculada até o momento.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {selectedDetails.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-background border border-amber-500/25 dark:border-amber-500/20 shadow-xs group hover:border-amber-500/40 transition-all"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Link2 className="h-3 w-3" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-tech font-bold text-xs text-amber-600 dark:text-amber-400">
                        #{item.titulo}
                      </span>
                      <span className="text-[11px] font-medium text-foreground truncate max-w-[120px]">
                        {item.cliente || "Sem cliente"}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[170px]">
                      {getSectorFriendlyLabel(item.setor, item.arquivado)}
                      {item.descricao ? ` • ${item.descricao}` : ""}
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveOrder(item.id)}
                  title={`Remover vínculo com a O.S. #${item.titulo}`}
                  className="h-6 w-6 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-md shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
