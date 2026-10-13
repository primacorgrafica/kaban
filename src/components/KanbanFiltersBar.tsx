import { useState, useEffect } from "react";
import { OrderStatus, STATUS_CONFIG, STATUS_ORDER } from "@/types/order";
import { DEPARTMENTS, EXPEDICAO_DEPARTMENT, Department } from "@/types/production";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Filter, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface KanbanFilters {
  statuses: OrderStatus[];
  vendedores: string[];
  setores: string[];
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  setoresManut?: string[];
  categoriasManut?: string[];
}

const SETORES_MANUT_LIST = [
  "Acabamento", "Pré-impressão", "Off-set", "Digital", "Expedição", "Predial", "Estoque",
];

const CATEGORIAS_MANUT_LIST = [
  { id: "mecanica", label: "Mecânica" },
  { id: "eletrica", label: "Elétrica" },
  { id: "predial", label: "Predial" },
  { id: "ti", label: "TI" },
  { id: "melhoria", label: "Melhoria" },
];

const ALL_SECTORS: { id: string; label: string; group: string }[] = [
  // Pré-impressão (setor = null)
  { id: "__pre_impressao__", label: "Pré-Impressão", group: "Pré" },
  // Produção
  ...DEPARTMENTS.map(d => ({ id: d.id, label: d.label, group: "Produção" })),
  // Expedição
  { id: EXPEDICAO_DEPARTMENT.id, label: EXPEDICAO_DEPARTMENT.label, group: "Expedição" },
];

interface KanbanFiltersBarProps {
  filters: KanbanFilters;
  onChange: (filters: KanbanFilters) => void;
  showOnly?: ("statuses" | "vendedores" | "setores" | "date" | "setoresManut" | "categoriasManut")[];
}

export function KanbanFiltersBar({ filters, onChange, showOnly }: KanbanFiltersBarProps) {
  const [open, setOpen] = useState(false);
  const [vendedoresList, setVendedoresList] = useState<string[]>([]);
  const show = (section: "statuses" | "vendedores" | "setores" | "date" | "setoresManut" | "categoriasManut") => !showOnly || showOnly.includes(section as any);
  const hasFilters = filters.statuses.length > 0 || filters.vendedores.length > 0 || filters.setores.length > 0 || filters.dateFrom || filters.dateTo || (filters.setoresManut?.length || 0) > 0 || (filters.categoriasManut?.length || 0) > 0;

  useEffect(() => {
    supabase.from("vendedores").select("nome").order("nome").then(({ data }) => {
      if (data) setVendedoresList(data.map(v => v.nome));
    });
  }, []);

  const toggleStatus = (status: OrderStatus) => {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ ...filters, statuses: next });
  };

  const toggleVendedor = (v: string) => {
    const next = filters.vendedores.includes(v)
      ? filters.vendedores.filter(x => x !== v)
      : [...filters.vendedores, v];
    onChange({ ...filters, vendedores: next });
  };

  const toggleSetor = (s: string) => {
    const next = filters.setores.includes(s)
      ? filters.setores.filter(x => x !== s)
      : [...filters.setores, s];
    onChange({ ...filters, setores: next });
  };

  const toggleSetorManut = (s: string) => {
    const current = filters.setoresManut || [];
    const next = current.includes(s) ? current.filter(x => x !== s) : [...current, s];
    onChange({ ...filters, setoresManut: next });
  };

  const toggleCategoriaManut = (c: string) => {
    const current = filters.categoriasManut || [];
    const next = current.includes(c) ? current.filter(x => x !== c) : [...current, c];
    onChange({ ...filters, categoriasManut: next });
  };

  const clearFilters = () => {
    onChange({ statuses: [], vendedores: [], setores: [], dateFrom: undefined, dateTo: undefined, setoresManut: [], categoriasManut: [] });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("gap-1.5 h-8", hasFilters && "border-primary text-primary")}>
            <Filter className="h-3.5 w-3.5" />
            Filtros
            {hasFilters && (
              <span className="bg-primary text-primary-foreground rounded-full text-[10px] w-4 h-4 flex items-center justify-center">
                {(filters.statuses.length > 0 ? 1 : 0) + (filters.vendedores.length > 0 ? 1 : 0) + (filters.setores.length > 0 ? 1 : 0) + (filters.dateFrom || filters.dateTo ? 1 : 0)}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-4 max-h-[70vh] overflow-y-auto" align="start">
          <div className="space-y-4">
            {/* Status filter */}
            {show("statuses") && (
            <div>
              <p className="text-sm font-medium mb-2">Status</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_ORDER.map((status) => {
                  const config = STATUS_CONFIG[status];
                  const active = filters.statuses.includes(status);
                  return (
                    <button
                      key={status}
                      onClick={() => toggleStatus(status)}
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-full border transition-colors",
                        active
                          ? "border-transparent font-medium"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                      style={active ? {
                        backgroundColor: `hsl(var(--status-${config.colorKey}-bg))`,
                        color: `hsl(var(--status-${config.colorKey}))`,
                        borderColor: `hsl(var(--status-${config.colorKey}) / 0.3)`,
                      } : undefined}
                    >
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </div>
            )}

            {/* Vendedor filter */}
            {show("vendedores") && (
            <div>
              <p className="text-sm font-medium mb-2">Vendedor</p>
              <div className="flex flex-wrap gap-1.5">
                {vendedoresList.map((v) => {
                  const active = filters.vendedores.includes(v);
                  return (
                    <button
                      key={v}
                      onClick={() => toggleVendedor(v)}
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-full border transition-colors",
                        active
                          ? "bg-primary text-primary-foreground border-primary font-medium"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
            )}

            {/* Setor filter */}
            {show("setores") && (
            <div>
              <p className="text-sm font-medium mb-2">Setor</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_SECTORS.map((s) => {
                  const active = filters.setores.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSetor(s.id)}
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-full border transition-colors",
                        active
                          ? "bg-primary text-primary-foreground border-primary font-medium"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            )}

            {/* Date from */}
            {show("date") && (
            <div>
              <p className="text-sm font-medium mb-2">Data de criação</p>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("flex-1 justify-start text-left font-normal h-8 text-xs", !filters.dateFrom && "text-muted-foreground")}>
                      <CalendarIcon className="h-3 w-3 mr-1.5" />
                      {filters.dateFrom ? format(filters.dateFrom, "dd/MM/yyyy", { locale: ptBR }) : "De"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.dateFrom}
                      onSelect={(d) => onChange({ ...filters, dateFrom: d })}
                      initialFocus
                      className="p-3 pointer-events-auto"
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("flex-1 justify-start text-left font-normal h-8 text-xs", !filters.dateTo && "text-muted-foreground")}>
                      <CalendarIcon className="h-3 w-3 mr-1.5" />
                      {filters.dateTo ? format(filters.dateTo, "dd/MM/yyyy", { locale: ptBR }) : "Até"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.dateTo}
                      onSelect={(d) => onChange({ ...filters, dateTo: d })}
                      initialFocus
                      className="p-3 pointer-events-auto"
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            )}

            {/* Setor Manutenção filter */}
            {show("setoresManut") && (
            <div>
              <p className="text-sm font-medium mb-2">Setor</p>
              <div className="flex flex-wrap gap-1.5">
                {SETORES_MANUT_LIST.map((s) => {
                  const active = (filters.setoresManut || []).includes(s);
                  return (
                    <button key={s} onClick={() => toggleSetorManut(s)}
                      className={cn("text-xs px-2.5 py-1 rounded-full border transition-colors",
                        active ? "bg-primary text-primary-foreground border-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"
                      )}>{s}</button>
                  );
                })}
              </div>
            </div>
            )}

            {/* Categoria Manutenção filter */}
            {show("categoriasManut") && (
            <div>
              <p className="text-sm font-medium mb-2">Categoria</p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIAS_MANUT_LIST.map((c) => {
                  const active = (filters.categoriasManut || []).includes(c.id);
                  return (
                    <button key={c.id} onClick={() => toggleCategoriaManut(c.id)}
                      className={cn("text-xs px-2.5 py-1 rounded-full border transition-colors",
                        active ? "bg-primary text-primary-foreground border-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"
                      )}>{c.label}</button>
                  );
                })}
              </div>
            </div>
            )}

            {hasFilters && (
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={clearFilters}>
                <X className="h-3 w-3 mr-1" /> Limpar filtros
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Active filter chips */}
      {filters.statuses.map((status) => {
        const config = STATUS_CONFIG[status];
        return (
          <span
            key={status}
            className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 cursor-pointer"
            style={{
              backgroundColor: `hsl(var(--status-${config.colorKey}-bg))`,
              color: `hsl(var(--status-${config.colorKey}))`,
            }}
            onClick={() => toggleStatus(status)}
          >
            {config.label}
            <X className="h-2.5 w-2.5" />
          </span>
        );
      })}
      {filters.vendedores.map((v) => (
        <span
          key={`v-${v}`}
          className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1 cursor-pointer"
          onClick={() => toggleVendedor(v)}
        >
          {v}
          <X className="h-2.5 w-2.5" />
        </span>
      ))}
      {filters.setores.map((s) => {
        const sector = ALL_SECTORS.find(x => x.id === s);
        return (
          <span
            key={`s-${s}`}
            className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground flex items-center gap-1 cursor-pointer"
            onClick={() => toggleSetor(s)}
          >
            {sector?.label || s}
            <X className="h-2.5 w-2.5" />
          </span>
        );
      })}
      {(filters.dateFrom || filters.dateTo) && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1 cursor-pointer"
          onClick={() => onChange({ ...filters, dateFrom: undefined, dateTo: undefined })}
        >
          {filters.dateFrom ? format(filters.dateFrom, "dd/MM", { locale: ptBR }) : "..."} — {filters.dateTo ? format(filters.dateTo, "dd/MM", { locale: ptBR }) : "..."}
          <X className="h-2.5 w-2.5" />
        </span>
      )}
      {(filters.setoresManut || []).map((s) => (
        <span key={`sm-${s}`} className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground flex items-center gap-1 cursor-pointer" onClick={() => toggleSetorManut(s)}>
          {s} <X className="h-2.5 w-2.5" />
        </span>
      ))}
      {(filters.categoriasManut || []).map((c) => {
        const cat = CATEGORIAS_MANUT_LIST.find(x => x.id === c);
        return (
          <span key={`cm-${c}`} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1 cursor-pointer" onClick={() => toggleCategoriaManut(c)}>
            {cat?.label || c} <X className="h-2.5 w-2.5" />
          </span>
        );
      })}
    </div>
  );
}
