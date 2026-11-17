import React, { useState, useEffect, useMemo } from "react";
import { Order } from "@/types/order";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, AlertCircle, Info, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  validateTotalPacotes,
  formatDoisDigitos,
  generateEtiquetasList,
  generateEtiquetasPrintHtml,
  printEtiquetasViaIframe,
  parseOrderInitialFields,
  DEFAULT_ALTURA_ETIQUETA_MM,
} from "@/lib/etiquetasExpedicao";

interface EtiquetaExpedicaoDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EtiquetaExpedicaoDialog({
  order,
  open,
  onOpenChange,
}: EtiquetaExpedicaoDialogProps) {
  const [cliente, setCliente] = useState("");
  const [servico, setServico] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [osNumero, setOsNumero] = useState("");
  const [totalPacotesStr, setTotalPacotesStr] = useState("");
  const [alturaMm, setAlturaMm] = useState<number>(DEFAULT_ALTURA_ETIQUETA_MM);
  const [isPrinting, setIsPrinting] = useState(false);

  // Inicializa os campos toda vez que a ordem abrir
  useEffect(() => {
    if (order && open) {
      const initial = parseOrderInitialFields(order);
      setCliente(initial.cliente);
      setServico(initial.servico);
      setQuantidade(initial.quantidade);
      setOsNumero(initial.osNumero);
      setTotalPacotesStr(""); // Sem valor padrão, preenchimento manual pelo operador
      setAlturaMm(DEFAULT_ALTURA_ETIQUETA_MM);
      setIsPrinting(false);
    }
  }, [order, open]);

  // Validação em tempo real do total de pacotes
  const validation = useMemo(() => {
    return validateTotalPacotes(totalPacotesStr);
  }, [totalPacotesStr]);

  const totalPacotes = validation.value;
  const isFormValid = validation.isValid && !!totalPacotes;

  const handlePrint = async () => {
    if (!order || !isFormValid || !totalPacotes) {
      toast.warning("Informe um total de pacotes válido entre 1 e 99.");
      return;
    }

    try {
      setIsPrinting(true);
      const etiquetas = generateEtiquetasList({
        cliente,
        servico,
        quantidade,
        osNumero,
        totalPacotes,
      });

      if (etiquetas.length === 0) {
        toast.error("Erro ao gerar a lista de etiquetas.");
        return;
      }

      const printHtml = generateEtiquetasPrintHtml(etiquetas, alturaMm);
      await printEtiquetasViaIframe(printHtml);

      // Mantém o diálogo aberto para o operador poder conferir, ajustar dados ou fechar quando quiser
      toast.info("Janela de impressão aberta no navegador.");
    } catch (err: unknown) {
      console.error("[EtiquetaExpedicao] Erro na impressão:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Não foi possível abrir a janela de impressão. Verifique se o navegador bloqueou pop-ups ou a impressora.";
      toast.error(errorMessage);
    } finally {
      setIsPrinting(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-sm:w-[96vw] max-sm:max-w-full max-sm:p-4 max-sm:rounded-xl sm:max-w-lg bg-card border-border text-card-foreground shadow-2xl rounded-2xl max-h-[92dvh] overflow-y-auto z-[70]"
        onClick={(e) => e.stopPropagation()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <Printer className="h-5 w-5 text-sky-400 shrink-0" />
            <span>Imprimir Etiquetas de Embalagem</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Informações da O.S. editáveis apenas para esta impressão */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">
                Cliente:
              </Label>
              <Input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Nome do cliente"
                className="text-xs max-sm:text-base max-sm:h-11 bg-background"
              />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">
                Serviço / Produto:
              </Label>
              <Input
                value={servico}
                onChange={(e) => setServico(e.target.value)}
                placeholder="Descrição do serviço"
                className="text-xs max-sm:text-base max-sm:h-11 bg-background"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">
                Quantidade:
              </Label>
              <Input
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                placeholder="Ex: 5.000 un"
                className="text-xs max-sm:text-base max-sm:h-11 bg-background"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">
                Número da O.S.:
              </Label>
              <Input
                value={osNumero}
                onChange={(e) => setOsNumero(e.target.value)}
                placeholder="Ex: 73210"
                className="text-xs max-sm:text-base max-sm:h-11 bg-background"
              />
            </div>
          </div>

          {/* Campo obrigatório: Total de pacotes (XX) */}
          <div className="p-3.5 rounded-xl border border-sky-500/30 bg-sky-500/5 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                <span>Total de Pacotes (XX) *</span>
              </Label>
              <span className="text-[10px] text-muted-foreground">
                Número inteiro de 1 a 99
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="1"
                max="99"
                step="1"
                placeholder="Digite o total (ex: 5)"
                value={totalPacotesStr}
                onChange={(e) => setTotalPacotesStr(e.target.value)}
                className={`text-base font-bold max-sm:h-11 bg-background ${
                  totalPacotesStr && !isFormValid
                    ? "border-rose-500 focus-visible:ring-rose-500"
                    : isFormValid
                    ? "border-emerald-500/70 focus-visible:ring-emerald-500"
                    : "border-sky-500/40"
                }`}
                autoFocus
              />

              {/* Seletor rápido de altura da etiqueta */}
              <div className="flex items-center gap-1 shrink-0 bg-background/80 p-1 rounded-lg border border-border/60">
                <span className="text-[10px] text-muted-foreground px-1 font-mono-tech">
                  Altura:
                </span>
                {[40, 50, 60].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setAlturaMm(h)}
                    className={`px-2 py-1 text-[10px] font-bold rounded transition-all cursor-pointer ${
                      alturaMm === h
                        ? "bg-sky-500 text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={`Altura do papel: ${h}mm`}
                  >
                    {h}mm
                  </button>
                ))}
              </div>
            </div>

            {/* Mensagens de validação claras */}
            {!totalPacotesStr ? (
              <p className="text-[11px] text-amber-500/90 flex items-center gap-1 font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Campo obrigatório: digite a quantidade total de pacotes desta O.S.
              </p>
            ) : !isFormValid ? (
              <p className="text-[11px] text-rose-500 flex items-center gap-1 font-semibold">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {validation.error}
              </p>
            ) : (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                Serão impressas {totalPacotes} {totalPacotes === 1 ? "etiqueta" : "etiquetas"}: de Pacote 01 de {formatDoisDigitos(totalPacotes)} até Pacote {formatDoisDigitos(totalPacotes)} de {formatDoisDigitos(totalPacotes)}.
              </p>
            )}
          </div>

          {/* Pré-visualização da primeira etiqueta fiel ao layout */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider text-[10px]">
                Pré-visualização (Etiqueta 01 — 80x{alturaMm}mm):
              </span>
              <span className="text-[10px] opacity-75">Layout real da impressora</span>
            </div>

            <div className="w-full flex justify-center py-2 bg-muted/30 rounded-xl border border-border/40">
              <div
                className="w-full max-w-[340px] bg-white text-black p-3 rounded-lg border-2 border-slate-400 shadow-md flex flex-col justify-between font-sans select-none"
                style={{ minHeight: alturaMm >= 50 ? "130px" : "110px" }}
              >
                <div className="space-y-1 text-xs">
                  <div className="flex items-baseline gap-1.5 leading-snug">
                    <span className="font-semibold text-black shrink-0">Cliente:</span>
                    <span className="font-bold text-black break-words line-clamp-2">
                      {cliente.trim() || "NOME DO CLIENTE"}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1.5 leading-snug">
                    <span className="font-semibold text-black shrink-0">Serviço:</span>
                    <span className="font-medium text-black break-words line-clamp-2">
                      {servico.trim() || "Descrição do serviço"}
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline text-xs pt-0.5">
                    <div className="flex items-baseline gap-1">
                      <span className="font-semibold text-black">Quantidade:</span>
                      <span className="font-bold text-black">
                        {quantidade.trim() || "—"}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="font-semibold text-black">O.S.:</span>
                      <span className="font-bold text-black">
                        {osNumero.trim() || "—"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-center font-black text-lg pt-2 mt-1 border-t border-dashed border-black tracking-wide text-black leading-none">
                  Pacote{" "}
                  <u className="underline underline-offset-2">01</u> de{" "}
                  <u className="underline underline-offset-2">
                    {isFormValid && totalPacotes ? formatDoisDigitos(totalPacotes) : "XX"}
                  </u>
                </div>
              </div>
            </div>
          </div>

          {/* Aviso obrigatório de configuração da Zebra ZD230 */}
          <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-[11px] text-muted-foreground flex items-start gap-2">
            <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
            <span>
              Selecione a impressora Zebra ZD230, margens: nenhuma e escala: 100%.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 pt-2 border-t border-border/60 flex-col-reverse sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPrinting}
            className="w-full sm:w-auto max-sm:min-h-[40px] text-xs font-semibold"
          >
            Fechar
          </Button>

          <Button
            type="button"
            onClick={handlePrint}
            disabled={!isFormValid || isPrinting}
            className="w-full sm:w-auto max-sm:min-h-[40px] gap-2 font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-sm"
          >
            <Printer className="h-4 w-4" />
            <span>
              {isPrinting
                ? "Enviando..."
                : isFormValid && totalPacotes
                ? `Imprimir (${totalPacotes} ${
                    totalPacotes === 1 ? "etiqueta" : "etiquetas"
                  })`
                : "Imprimir Etiquetas"}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
