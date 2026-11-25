import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Layers,
  MapPin,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Bike,
  Car,
  User,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { mergeOrdersForDelivery } from "@/lib/deliveryService";
import {
  detectMergeConflicts,
  validateSameClientForMerge,
  type VeiculoCategoria,
} from "@/types/delivery";
import type { Order } from "@/types/order";
import { cleanOsNumber } from "@/components/ProductionCard";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MergeOrdersModalProps {
  baseOrder: Order | null;
  allOrders: Order[];
  initialSelectedOrderIds?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (paradaId: string) => void;
}

export function MergeOrdersModal({
  baseOrder,
  allOrders,
  initialSelectedOrderIds = [],
  open,
  onOpenChange,
  onSuccess,
}: MergeOrdersModalProps) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [chosenAddress, setChosenAddress] = useState<string>("");
  const [chosenDate, setChosenDate] = useState<string>("");
  const [chosenVehicle, setChosenVehicle] = useState<VeiculoCategoria>("carro");
  const [submitting, setSubmitting] = useState(false);

  // Cliente de referência (a partir da baseOrder ou da primeira selecionada)
  const clientName = useMemo(() => {
    if (baseOrder?.cliente) return baseOrder.cliente.trim();
    if (initialSelectedOrderIds.length > 0) {
      const first = allOrders.find((o) => o.id === initialSelectedOrderIds[0]);
      return first?.cliente?.trim() || "";
    }
    return "";
  }, [baseOrder, allOrders, initialSelectedOrderIds]);

  // Candidatas à fusão: Todas as O.S. ativas do MESMO cliente (incluindo Provas Digitais 'P')
  const candidateOrders = useMemo(() => {
    if (!clientName) return [];
    const normClient = clientName.toLowerCase();

    return allOrders.filter((o) => {
      const c = (o.cliente || "").trim().toLowerCase();
      if (c !== normClient) return false;
      if (o.arquivado) return false;
      if (o.status_entrega === "entregue") return false;
      return true;
    });
  }, [clientName, allOrders]);

  // Inicializa a seleção quando o modal abre
  useEffect(() => {
    if (open) {
      const set = new Set<string>();
      if (baseOrder) set.add(baseOrder.id);
      initialSelectedOrderIds.forEach((id) => set.add(id));
      setSelectedOrderIds(set);
    }
  }, [open, baseOrder, initialSelectedOrderIds]);

  // O.S. atualmente selecionadas na interface
  const selectedOrdersList = useMemo(() => {
    return candidateOrders.filter((o) => selectedOrderIds.has(o.id));
  }, [candidateOrders, selectedOrderIds]);

  // Detecção de conflitos de endereço e data entre as selecionadas
  const conflicts = useMemo(() => {
    if (selectedOrdersList.length === 0) {
      return {
        hasAddressConflict: false,
        distinctAddresses: [],
        hasDateConflict: false,
        distinctDates: [],
        clientName: "",
      };
    }
    return detectMergeConflicts(selectedOrdersList);
  }, [selectedOrdersList]);

  // Sincroniza valores padrão de endereço e data conforme a seleção muda
  useEffect(() => {
    if (selectedOrdersList.length > 0) {
      // 1. Endereço: se ainda não definido ou valor anterior não pertence a nenhuma, escolhe o primeiro disponível
      const currentAddrInList = selectedOrdersList.some(
        (o) => (o.entrega_endereco || o.endereco_entrega || "") === chosenAddress
      );
      if (!chosenAddress || !currentAddrInList) {
        const firstAddr =
          selectedOrdersList.find((o) => o.entrega_endereco || o.endereco_entrega)
            ?.entrega_endereco ||
          selectedOrdersList.find((o) => o.endereco_entrega)?.endereco_entrega ||
          "";
        setChosenAddress(firstAddr);
      }

      // 2. Data: se ainda não definida ou valor não pertence a nenhuma, escolhe a primeira disponível
      const currentDateInList = selectedOrdersList.some(
        (o) => (o.entrega_data_limite || "") === chosenDate
      );
      if (!chosenDate || !currentDateInList) {
        const firstDate =
          selectedOrdersList.find((o) => o.entrega_data_limite)?.entrega_data_limite || "";
        setChosenDate(firstDate);
      }

      // 3. Veículo: Se alguma das selecionadas é 'carro' ou há 3+ O.S., sugere 'carro' por volume
      const anyCarro = selectedOrdersList.some((o) => o.tipo_veiculo_entrega === "carro");
      if (anyCarro || selectedOrdersList.length >= 3) {
        setChosenVehicle("carro");
      }
    }
  }, [selectedOrdersList]);

  const handleToggle = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        if (next.size <= 1) {
          toast.warning("A fusão requer ao menos 2 O.S. selecionadas.");
          return prev;
        }
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const handleConfirmMerge = async () => {
    const ordersToMerge = Array.from(selectedOrderIds);
    if (ordersToMerge.length < 2) {
      toast.error("Selecione pelo menos 2 Ordens de Serviço para realizar a fusão.");
      return;
    }

    // Validação estrita de cliente
    const validation = validateSameClientForMerge(selectedOrdersList);
    if (!validation.valid) {
      toast.error(validation.error || "Todas as O.S. devem pertencer ao mesmo cliente.");
      return;
    }

    if (!chosenAddress.trim()) {
      toast.warning("Informe ou selecione o endereço de entrega para a parada unificada.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await mergeOrdersForDelivery({
        orderIds: ordersToMerge,
        chosenAddress: chosenAddress.trim(),
        chosenDate: chosenDate || null,
        chosenVehicle,
      });

      if (!res.success) {
        toast.error(`Falha ao fundir entregas: ${res.error}`);
        return;
      }

      toast.success(
        `${ordersToMerge.length} O.S. do cliente ${clientName} fundidas em uma única entrega com sucesso!`
      );
      onOpenChange(false);
      if (res.paradaId) {
        onSuccess?.(res.paradaId);
      }
    } catch (err: any) {
      toast.error(`Erro ao fundir entregas: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border shadow-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                Fusão de Entregas (Mesmo Cliente)
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <User className="h-3.5 w-3.5 text-primary" />
                Cliente: <strong className="text-foreground">{clientName || "—"}</strong>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 my-2 text-xs">
          {/* 1. SELEÇÃO DE ORDENS DO MESMO CLIENTE */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">
                1. Selecione as O.S. a serem unificadas ({selectedOrderIds.size} de{" "}
                {candidateOrders.length} ativas):
              </Label>
              <span className="text-[11px] text-muted-foreground">
                Permitido apenas O.S. do mesmo cliente
              </span>
            </div>

            {candidateOrders.length <= 1 ? (
              <div className="p-4 rounded-lg border border-dashed text-center text-muted-foreground text-xs">
                Este cliente possui apenas 1 Ordem de Serviço ativa no momento. São necessárias pelo
                menos duas O.S. para realizar uma fusão.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[170px] overflow-y-auto pr-1">
                {candidateOrders.map((ord) => {
                  const isChecked = selectedOrderIds.has(ord.id);
                  const isProof =
                    ord.titulo.toUpperCase().startsWith("P") ||
                    ord.is_prova_entrega ||
                    ord.tipo_entrega?.includes("prova_digital");

                  return (
                    <label
                      key={ord.id}
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                        isChecked
                          ? "bg-primary/10 border-primary shadow-xs"
                          : "bg-card border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => handleToggle(ord.id)}
                        />
                        <div className="flex flex-col overflow-hidden">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-foreground">
                              OS #{ord.titulo}
                            </span>
                            {isProof && (
                              <Badge className="bg-purple-900/40 text-purple-300 border-purple-600/40 text-[9px] px-1 py-0 font-bold">
                                Prova Digital
                              </Badge>
                            )}
                            {ord.rota_prioridade && (
                              <Badge className="bg-amber-900/40 text-amber-300 border-amber-600/40 text-[9px] px-1 py-0 font-bold">
                                Prioridade
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground truncate">
                            {ord.descricao || "Sem descrição"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-right">
                        <div className="flex flex-col text-[10px] text-muted-foreground">
                          <span>
                            {ord.entrega_data_limite
                              ? format(parseISO(ord.entrega_data_limite), "dd/MM HH:mm", {
                                  locale: ptBR,
                                })
                              : "Sem data"}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {ord.tipo_veiculo_entrega === "carro" ? "Carro" : "Moto"}
                        </Badge>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. RESOLUÇÃO DE CONFLITO DE ENDEREÇO */}
          <div className="p-3 rounded-xl border bg-muted/20 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                <span>2. Endereço da Entrega Unificada</span>
              </div>
              {conflicts.hasAddressConflict && (
                <Badge className="bg-amber-500/20 text-amber-500 dark:text-amber-400 border-amber-500/40 gap-1 text-[10px] font-bold">
                  <AlertTriangle className="h-3 w-3" />
                  Conflito Detectado
                </Badge>
              )}
            </div>

            {conflicts.hasAddressConflict ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] text-muted-foreground">
                  As Ordens de Serviço selecionadas possuem endereços diferentes. Escolha qual deve
                  prevalecer:
                </p>
                <div className="flex flex-col gap-1.5">
                  {conflicts.distinctAddresses.map((item, idx) => {
                    const isSelected = chosenAddress === item.address;
                    return (
                      <label
                        key={`addr-${idx}`}
                        className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-primary/10 border-primary"
                            : "bg-card border-border hover:bg-muted/30"
                        }`}
                      >
                        <input
                          type="radio"
                          name="merge_address_option"
                          className="mt-0.5"
                          checked={isSelected}
                          onChange={() => setChosenAddress(item.address)}
                        />
                        <div className="flex flex-col text-xs">
                          <span className="font-medium text-foreground">{item.address}</span>
                          <span className="text-[10px] text-muted-foreground">
                            Utilizado por: {item.orderTitles.map((t) => `OS #${t}`).join(", ")}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div>
              <Label className="text-[11px] text-muted-foreground block mb-1">
                Endereço Final que valerá para a parada unificada:
              </Label>
              <Input
                value={chosenAddress}
                onChange={(e) => setChosenAddress(e.target.value)}
                placeholder="Informe ou confirme o endereço da entrega unificada..."
                className="h-8 text-xs bg-card"
              />
            </div>
          </div>

          {/* 3. RESOLUÇÃO DE CONFLITO DE DATA DE ENTREGA */}
          <div className="p-3 rounded-xl border bg-muted/20 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Calendar className="h-4 w-4 text-primary" />
                <span>3. Data e Horário Limite da Entrega</span>
              </div>
              {conflicts.hasDateConflict && (
                <Badge className="bg-amber-500/20 text-amber-500 dark:text-amber-400 border-amber-500/40 gap-1 text-[10px] font-bold">
                  <AlertTriangle className="h-3 w-3" />
                  Datas Diferentes
                </Badge>
              )}
            </div>

            {conflicts.hasDateConflict ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] text-muted-foreground">
                  As Ordens de Serviço possuem datas limites divergentes. Escolha qual prazo deve
                  valer:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {conflicts.distinctDates.map((item, idx) => {
                    const isSelected = chosenDate === item.rawDate;
                    return (
                      <label
                        key={`dt-${idx}`}
                        className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-primary/10 border-primary"
                            : "bg-card border-border hover:bg-muted/30"
                        }`}
                      >
                        <input
                          type="radio"
                          name="merge_date_option"
                          className="mt-0.5"
                          checked={isSelected}
                          onChange={() => setChosenDate(item.rawDate)}
                        />
                        <div className="flex flex-col text-xs">
                          <span className="font-semibold text-foreground">{item.formatted}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {item.orderTitles.map((t) => `OS #${t}`).join(", ")}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div>
              <Label className="text-[11px] text-muted-foreground block mb-1">
                Data/Hora Limite da Entrega Fundida:
              </Label>
              <Input
                type="datetime-local"
                value={
                  chosenDate
                    ? format(parseISO(chosenDate), "yyyy-MM-dd'T'HH:mm")
                    : ""
                }
                onChange={(e) => {
                  setChosenDate(e.target.value ? new Date(e.target.value).toISOString() : "");
                }}
                className="h-8 text-xs bg-card max-w-xs"
              />
            </div>
          </div>

          {/* 4. TIPO DE VEÍCULO DA PARADA FUNDIDA */}
          <div className="p-3 rounded-xl border bg-muted/20 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-semibold text-foreground text-xs">
                4. Tipo de Veículo Recomendado
              </span>
              <span className="text-[11px] text-muted-foreground">
                Entregas fundidas geralmente agrupam volumes maiores.
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-card border rounded-lg p-1">
              <Button
                type="button"
                size="sm"
                variant={chosenVehicle === "moto" ? "secondary" : "ghost"}
                className="h-7 text-xs px-2.5 gap-1"
                onClick={() => setChosenVehicle("moto")}
              >
                <Bike className="h-3.5 w-3.5 text-emerald-400" />
                Moto
              </Button>
              <Button
                type="button"
                size="sm"
                variant={chosenVehicle === "carro" ? "secondary" : "ghost"}
                className="h-7 text-xs px-2.5 gap-1"
                onClick={() => setChosenVehicle("carro")}
              >
                <Car className="h-3.5 w-3.5 text-blue-400" />
                Carro
              </Button>
            </div>
          </div>

          {/* Dica informativa */}
          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0 text-blue-400" />
            <span>
              A entrega fundida será tratada como uma única parada física nas rotas e nos status. Ela
              pode ser desfeita a qualquer momento antes de ser atribuída a uma rota.
            </span>
          </div>
        </div>

        <DialogFooter className="mt-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={submitting || selectedOrderIds.size < 2 || !chosenAddress.trim()}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5"
            onClick={handleConfirmMerge}
          >
            <CheckCircle2 className="h-4 w-4" />
            {submitting
              ? "Fundindo..."
              : `Confirmar Fusão (${selectedOrderIds.size} O.S.)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
