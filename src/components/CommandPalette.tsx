import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Plus,
  Monitor,
  BarChart3,
  Factory,
  Truck,
  Users,
  Wrench,
  ShoppingCart,
  Receipt,
  FileText,
  Search,
  Sun,
  Moon,
  Clock,
  Briefcase,
  Layers,
  MessageSquare,
  PrinterCheck,
  Megaphone,
} from "lucide-react";
import { Order } from "@/types/order";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders?: Order[];
  onSelectOrder?: (order: Order) => void;
  onOpenCreateOS?: () => void;
  onOpenCreateOM?: () => void;
  onOpenCreateOC?: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  orders = [],
  onSelectOrder,
  onOpenCreateOS,
  onOpenCreateOM,
  onOpenCreateOC,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName))) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const handleSelectNav = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Digite uma ação, setor ou número de O.S. (ex: 71200, Bioclin, Nova O.S.)..." />
      <CommandList className="max-h-[380px] scrollbar-tech">
        <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
          Nenhum resultado encontrado.
        </CommandEmpty>

        {/* Ações Rápidas */}
        <CommandGroup heading="Ações Rápidas">
          {onOpenCreateOS && (
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                onOpenCreateOS();
              }}
              className="flex items-center gap-2 cursor-pointer py-2"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#253745] text-[#CCD0CF]">
                <Plus className="h-3.5 w-3.5" />
              </div>
              <span className="font-medium text-xs">Nova Ordem de Serviço (O.S.)</span>
              <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
                N
              </kbd>
            </CommandItem>
          )}


          {onOpenCreateOC && (
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                onOpenCreateOC();
              }}
              className="flex items-center gap-2 cursor-pointer py-2"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
                <ShoppingCart className="h-3.5 w-3.5" />
              </div>
              <span className="font-medium text-xs">Nova Ordem de Compra (O.C.)</span>
            </CommandItem>
          )}

          {onOpenCreateOM && (
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                onOpenCreateOM();
              }}
              className="flex items-center gap-2 cursor-pointer py-2"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-400">
                <Wrench className="h-3.5 w-3.5" />
              </div>
              <span className="font-medium text-xs">Nova Ordem de Manutenção (O.M.)</span>
            </CommandItem>
          )}

          <CommandItem
            onSelect={() => {
              setTheme(theme === "dark" ? "light" : "dark");
              onOpenChange(false);
            }}
            className="flex items-center gap-2 cursor-pointer py-2"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#253745] text-[#CCD0CF]">
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </div>
            <span className="font-medium text-xs">Alternar Tema Visual (Claro / Escuro)</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Navegação entre Módulos */}
        <CommandGroup heading="Navegação / Módulos">
          <CommandItem onSelect={() => handleSelectNav("/chat")} className="cursor-pointer py-2">
            <MessageSquare className="mr-2 h-4 w-4 text-[#CCD0CF]" />
            <span className="text-xs">Chat Privado entre Colaboradores</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelectNav("/")} className="cursor-pointer py-2">
            <Monitor className="mr-2 h-4 w-4 text-[#CCD0CF]" />
            <span className="text-xs">Pré-Impressão (Quadro Principal)</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelectNav("/dashboard")} className="cursor-pointer py-2">
            <BarChart3 className="mr-2 h-4 w-4 text-emerald-400" />
            <span className="text-xs">Dashboard Analítico & Métricas</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelectNav("/pcp")} className="cursor-pointer py-2">
            <Layers className="mr-2 h-4 w-4 text-[#CCD0CF]" />
            <span className="text-xs">Painel — Emissões e Liberações em Tempo Real</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelectNav("/ctp")} className="cursor-pointer py-2">
            <Layers className="mr-2 h-4 w-4 text-cyan-400" />
            <span className="text-xs">CTP — Gravação de Chapas (Quadro Kanban)</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelectNav("/digital")} className="cursor-pointer py-2">
            <PrinterCheck className="mr-2 h-4 w-4 text-sky-400" />
            <span className="text-xs">Digital — Impressão Digital (Quadro Kanban)</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelectNav("/comercial")} className="cursor-pointer py-2">
            <Briefcase className="mr-2 h-4 w-4 text-amber-400" />
            <span className="text-xs">Comercial & Vendedores</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelectNav("/producao/offset")} className="cursor-pointer py-2">
            <Factory className="mr-2 h-4 w-4 text-indigo-400" />
            <span className="text-xs">Produção — Impressão Off-Set (Komori / Ryobi)</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelectNav("/producao/acabamento")} className="cursor-pointer py-2">
            <Factory className="mr-2 h-4 w-4 text-pink-400" />
            <span className="text-xs">Produção — Acabamento & Encadernação</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelectNav("/expedicao")} className="cursor-pointer py-2">
            <Truck className="mr-2 h-4 w-4 text-orange-400" />
            <span className="text-xs">Expedição & Entregas</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelectNav("/equipamentos")} className="cursor-pointer py-2">
            <Wrench className="mr-2 h-4 w-4 text-teal-400" />
            <span className="text-xs">Parque Gráfico & Equipamentos</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelectNav("/usuarios")} className="cursor-pointer py-2">
            <Users className="mr-2 h-4 w-4 text-violet-400" />
            <span className="text-xs">Gerenciamento de Usuários & Perfis</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelectNav("/mural")} className="cursor-pointer py-2">
            <Megaphone className="mr-2 h-4 w-4 text-rose-400" />
            <span className="text-xs">Mural de Alertas — Comunicados & Avisos do Dia</span>
          </CommandItem>
        </CommandGroup>

        {/* Ordens de Serviço Recentes / Localizadas */}
        {orders.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Ordens de Serviço (${orders.length})`}>
              {orders.slice(0, 15).map((order) => (
                <CommandItem
                  key={order.id}
                  onSelect={() => {
                    onOpenChange(false);
                    if (onSelectOrder) onSelectOrder(order);
                  }}
                  className="flex items-center justify-between cursor-pointer py-2"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="font-mono-tech font-bold text-xs text-primary shrink-0">
                      #{order.titulo}
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate max-w-[140px]">
                      {order.cliente}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate hidden sm:inline max-w-[200px]">
                      {order.descricao}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {order.urgente && (
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0 uppercase font-mono-tech">
                        Urgente
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground font-mono-tech uppercase">
                      {order.setor || "Pré"}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
