import { useState, useEffect } from "react";
import { Order } from "@/types/order";
import {
  CTP_CHECKLIST_ITEMS,
  CtpChecklist,
  getCtpChecklistStatus,
} from "@/types/ctp";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  CheckCheck,
  RotateCcw,
  Layers,
  AlertCircle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cleanOsNumber } from "@/lib/orderRelationsService";

interface CtpChecklistDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, data: Partial<Order>) => void | Promise<any>;
  currentUserName?: string | null;
  readOnly?: boolean;
}

export function CtpChecklistDialog({
  order,
  open,
  onOpenChange,
  onUpdate,
  currentUserName,
  readOnly = false,
}: CtpChecklistDialogProps) {
  const [checklist, setChecklist] = useState<CtpChecklist>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (order && open) {
      setChecklist(order.ctp_checklist || {});
    }
  }, [order, open]);

  if (!order) return null;

  const status = getCtpChecklistStatus(checklist);
  const progressPercent = Math.round((status.checkedCount / status.total) * 100);
  const cleanOs = cleanOsNumber(order.titulo) || order.titulo.replace(/^#+/, "");

  const handleToggleItem = (itemId: string) => {
    if (readOnly) return;
    const isCurrentlyChecked = !!checklist[itemId]?.checked;
    const now = new Date().toISOString();
    const updated: CtpChecklist = {
      ...checklist,
      [itemId]: {
        checked: !isCurrentlyChecked,
        checked_at: !isCurrentlyChecked ? now : null,
        checked_by: !isCurrentlyChecked ? currentUserName || "Operador CTP" : null,
      },
    };
    setChecklist(updated);
  };

  const handleMarkAll = () => {
    if (readOnly) return;
    const now = new Date().toISOString();
    const updated: CtpChecklist = {};
    for (const item of CTP_CHECKLIST_ITEMS) {
      updated[item.id] = {
        checked: true,
        checked_at: now,
        checked_by: currentUserName || "Operador CTP",
      };
    }
    setChecklist(updated);
    toast.success("Todos os 13 itens foram marcados como verificados");
  };

  const handleClearAll = () => {
    if (readOnly) return;
    setChecklist({});
    toast.info("Checklist do CTP foi limpo");
  };

  const handleSave = async () => {
    if (readOnly) {
      onOpenChange(false);
      return;
    }
    setIsSaving(true);
    try {
      await onUpdate(order.id, { ctp_checklist: checklist });
      const currentStatus = getCtpChecklistStatus(checklist);
      if (currentStatus.complete) {
        toast.success("Checklist do CTP 100% verificado! O.S liberada para Produção.");
      } else {
        toast.success(`Checklist do CTP salvo (${currentStatus.checkedCount}/13 verificados).`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error("Erro ao salvar checklist do CTP.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/70 shrink-0 bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  <Layers className="h-4 w-4" />
                </span>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                  Checklist de Conferência CTP — O.S {cleanOs}
                </DialogTitle>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">
                Cliente: <span className="font-semibold text-foreground">{order.cliente}</span> • {order.descricao}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {status.complete ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold px-2.5 py-1 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  13/13 Verificado (Liberado)
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 font-bold px-2.5 py-1 text-xs flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  {status.checkedCount}/13 Verificados
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-1.5 pt-3">
            <div className="flex justify-between text-xs font-semibold text-muted-foreground">
              <span>Progresso da Conferência</span>
              <span className={status.complete ? "text-emerald-400 font-bold" : "text-amber-400"}>
                {status.checkedCount} de 13 itens ({progressPercent}%)
              </span>
            </div>
            <Progress
              value={progressPercent}
              className={`h-2 transition-all ${
                status.complete
                  ? "[&>div]:bg-emerald-500"
                  : "[&>div]:bg-amber-500"
              }`}
            />
          </div>
        </DialogHeader>

        {/* Toolbar de ações rápidas */}
        {!readOnly && (
          <div className="px-6 py-2.5 bg-muted/30 border-b border-border/50 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground text-[11px]">
              Obrigatório marcar todos os 13 itens para avançar para <strong>Produção</strong>.
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleMarkAll}
                className="h-7 px-2.5 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1.5"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar Todos
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                Limpar
              </Button>
            </div>
          </div>
        )}

        {/* Lista de Itens do Checklist */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5 scrollbar-thin">
          {CTP_CHECKLIST_ITEMS.map((item) => {
            const isChecked = !!checklist[item.id]?.checked;
            return (
              <div
                key={item.id}
                onClick={() => handleToggleItem(item.id)}
                className={`group flex items-start gap-3.5 p-3 rounded-xl border transition-all select-none ${
                  readOnly ? "cursor-default" : "cursor-pointer"
                } ${
                  isChecked
                    ? "bg-emerald-500/10 border-emerald-500/40 hover:bg-emerald-500/15"
                    : "bg-card/60 border-border/70 hover:border-border hover:bg-muted/30"
                }`}
              >
                <div className="pt-0.5 shrink-0">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs border transition-all ${
                      isChecked
                        ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                        : "bg-muted/40 text-muted-foreground border-border/80 group-hover:border-foreground/50"
                    }`}
                  >
                    {isChecked ? <CheckCircle2 className="h-4 w-4" /> : item.numero}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs sm:text-sm font-semibold transition-colors ${
                        isChecked ? "text-emerald-300" : "text-foreground"
                      }`}
                    >
                      {item.descricao}
                    </span>
                  </div>
                  {isChecked && checklist[item.id]?.checked_by && (
                    <span className="text-[10px] text-emerald-400/70 block mt-0.5 font-medium">
                      Verificado por {checklist[item.id]?.checked_by}
                    </span>
                  )}
                </div>

                <div className="shrink-0 pt-0.5">
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                      isChecked
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                        : "bg-muted/50 text-muted-foreground border-border/50 group-hover:border-border"
                    }`}
                  >
                    {isChecked ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> Verificado
                      </>
                    ) : (
                      "Pendente"
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="px-6 py-3.5 border-t border-border/70 shrink-0 bg-muted/20 flex flex-row items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className={`font-bold transition-all ${
              status.complete
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
            }`}
          >
            <FileText className="h-4 w-4 mr-1.5" />
            {readOnly ? "Fechar" : isSaving ? "Salvando..." : "Salvar Checklist"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
