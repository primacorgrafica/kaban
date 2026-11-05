import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Order, RelatedOrderSummary } from "@/types/order";
import {
  getRelatedOrdersInfo,
  getSectorRoute,
  getSectorFriendlyLabel,
  highlightOrderCard,
} from "@/lib/orderRelationsService";
import { useAuth } from "@/hooks/useAuth";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Link2, ArrowRight, ExternalLink, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface RelatedOrdersPopoverProps {
  currentOrderId: string;
  currentOrderTitle?: string;
  relatedOrderIds?: string[] | null;
  inMemoryOrders?: Order[];
}

export function RelatedOrdersPopover({
  currentOrderId,
  currentOrderTitle,
  relatedOrderIds = [],
  inMemoryOrders = [],
}: RelatedOrdersPopoverProps) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<RelatedOrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const { canAccessSector, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const count = (relatedOrderIds || []).length;

  useEffect(() => {
    if (!open || count === 0) return;

    let isMounted = true;
    setLoading(true);

    void getRelatedOrdersInfo(relatedOrderIds || [], inMemoryOrders).then((res) => {
      if (isMounted) {
        setDetails(res);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [open, relatedOrderIds, inMemoryOrders, count]);

  if (!relatedOrderIds || count === 0) return null;

  const handleNavigateToRelated = (related: RelatedOrderSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(false);

    // Valida permissão de acesso ao setor da O.S. de destino
    const targetSector = related.setor?.toLowerCase().trim();
    if (targetSector && targetSector !== "pre_impressao" && !isAdmin) {
      if (!canAccessSector(targetSector)) {
        toast.warning(
          `A O.S. #${related.titulo} pertence ao setor ${getSectorFriendlyLabel(
            related.setor,
            related.arquivado
          )}, porém seu perfil não possui permissão para acessar esta área.`
        );
        return;
      }
    }

    const targetRoute = getSectorRoute(related.setor, related.arquivado);
    const isCurrentPage = location.pathname === targetRoute;

    if (isCurrentPage) {
      const highlighted = highlightOrderCard(related.id);
      if (!highlighted) {
        // Dispara evento global caso o card esteja montando ou precise de refiltro
        window.dispatchEvent(
          new CustomEvent("highlight-order", { detail: { orderId: related.id } })
        );
        toast.info(
          `O.S. #${related.titulo} localizada. Verifique se algum filtro de busca ou vendedor está ativo.`,
          { duration: 4000 }
        );
      }
    } else {
      toast.info(`Navegando para O.S. #${related.titulo} (${getSectorFriendlyLabel(related.setor, related.arquivado)})...`);
      navigate(`${targetRoute}?highlight=${related.id}`);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 hover:border-amber-500/50 shadow-xs shrink-0 cursor-pointer transition-all hover:scale-105"
          title={`${count} O.S. relacionada${count > 1 ? "s" : ""} vinculada${count > 1 ? "s" : ""} a este projeto`}
        >
          <Link2 className="h-3 w-3 shrink-0" />
          <span>{count}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        onClick={(e) => e.stopPropagation()}
        className="w-80 p-3 bg-popover/95 backdrop-blur-md border border-border text-popover-foreground rounded-xl shadow-2xl z-50 animate-in fade-in-50 zoom-in-95"
      >
        <div className="space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <div className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded bg-amber-500/20 text-amber-500 flex items-center justify-center">
                <Link2 className="h-3 w-3" />
              </div>
              <h4 className="text-xs font-bold text-foreground tracking-wide">
                O.S. Relacionadas ({count})
              </h4>
            </div>
            {currentOrderTitle && (
              <span className="text-[10px] font-mono-tech text-muted-foreground">
                Ref: #{cleanOsNumber(currentOrderTitle)}
              </span>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground leading-tight">
            Clique em uma O.S. abaixo para navegar diretamente até ela no Kaban:
          </p>

          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-0.5">
            {loading ? (
              <div className="flex items-center justify-center py-4 text-xs text-muted-foreground gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                <span>Carregando ordens vinculadas...</span>
              </div>
            ) : details.length === 0 ? (
              <div className="py-3 text-center text-xs text-muted-foreground">
                Nenhum detalhe disponível para as ordens vinculadas.
              </div>
            ) : (
              details.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleNavigateToRelated(item, e)}
                  className="w-full text-left p-2 rounded-lg bg-background/80 hover:bg-accent border border-border/60 hover:border-amber-500/40 flex items-center justify-between gap-2 transition-all cursor-pointer group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-tech font-bold text-xs text-amber-600 dark:text-amber-400 group-hover:underline">
                        #{item.titulo}
                      </span>
                      <span className="text-xs font-medium text-foreground truncate max-w-[130px]">
                        {item.cliente || "Sem cliente"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1 py-0 bg-muted text-muted-foreground shrink-0"
                      >
                        {getSectorFriendlyLabel(item.setor, item.arquivado)}
                      </Badge>
                      {item.descricao && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {item.descricao}
                        </span>
                      )}
                    </div>
                  </div>

                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
