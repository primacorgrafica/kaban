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
import { Textarea } from "@/components/ui/textarea";
import { Printer, Info, Sparkles, Hash } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_ALTURA_ETIQUETA_MM,
  MAX_OBS_CHARS,
  CONFIRM_THRESHOLD_ETIQUETAS,
  EtiquetaInspecaoItem,
  validateSequenciaPacotes,
  generateSequenciaNumeros,
  formatLinhaPacoteManual,
  formatLinhaPacoteSequencial,
  parseOrderInspecaoInitialFields,
  generateEtiquetasInspecaoPrintHtml,
  printEtiquetasInspecaoViaIframe,
} from "@/lib/etiquetasInspecao";

interface EtiquetaInspecaoDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EtiquetaInspecaoDialog({
  order,
  open,
  onOpenChange,
}: EtiquetaInspecaoDialogProps) {
  // Campos editáveis apenas para esta impressão
  const [cliente, setCliente] = useState("");
  const [servico, setServico] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [osNumero, setOsNumero] = useState("");
  const [observacao, setObservacao] = useState("");

  // Modo de numeração: "manual" (padrão inicial) ou "sequencial"
  const [modo, setModo] = useState<"manual" | "sequencial">("manual");

  // Modo Manual: texto livre até 6 caracteres, opcional
  const [numeroPacoteManual, setNumeroPacoteManual] = useState("");

  // Modo Sequencial: De (padrão 1), Até (obrigatório, sem padrão)
  const [deStr, setDeStr] = useState("1");
  const [ateStr, setAteStr] = useState("");

  // Altura da etiqueta (padrão 50mm)
  const [alturaMm, setAlturaMm] = useState<number>(DEFAULT_ALTURA_ETIQUETA_MM);
  const [isPrinting, setIsPrinting] = useState(false);

  // Inicializa os campos sempre que a ordem abrir
  useEffect(() => {
    if (order && open) {
      const initial = parseOrderInspecaoInitialFields(order);
      setCliente(initial.cliente);
      setServico(initial.servico);
      setQuantidade(initial.quantidade);
      setOsNumero(initial.osNumero);
      setObservacao(""); // Começa vazio
      setModo("manual"); // Modo inicial é Manual
      setNumeroPacoteManual("");
      setDeStr("1"); // De padrão 1
      setAteStr(""); // Até sem valor padrão
      setAlturaMm(DEFAULT_ALTURA_ETIQUETA_MM);
      setIsPrinting(false);
    }
  }, [order, open]);

  // Validação do modo sequencial
  const sequencialValidation = useMemo(() => {
    if (modo !== "sequencial") return { isValid: true };
    return validateSequenciaPacotes(deStr, ateStr);
  }, [modo, deStr, ateStr]);

  // Validação geral do formulário
  const isFormValid = useMemo(() => {
    if (modo === "manual") {
      return true; // No modo manual, tudo é válido (número é opcional)
    }
    return sequencialValidation.isValid;
  }, [modo, sequencialValidation]);

  // Dados para a prévia da primeira etiqueta
  const previewItem = useMemo<EtiquetaInspecaoItem>(() => {
    if (modo === "manual") {
      const numTrim = numeroPacoteManual.trim();
      return {
        cliente,
        servico,
        quantidade,
        osNumero,
        observacao,
        numeroPacote: numTrim,
        linhaPacoteHtml: formatLinhaPacoteManual(numTrim),
      };
    } else {
      // Sequencial
      const de = sequencialValidation.de || 1;
      const ate = sequencialValidation.ate || de;
      const sequencia = generateSequenciaNumeros(de, ate);
      const primeiroNum = sequencia.length > 0 ? sequencia[0] : "01";
      return {
        cliente,
        servico,
        quantidade,
        osNumero,
        observacao,
        numeroPacote: primeiroNum,
        linhaPacoteHtml: formatLinhaPacoteSequencial(primeiroNum),
      };
    }
  }, [modo, cliente, servico, quantidade, osNumero, observacao, numeroPacoteManual, sequencialValidation]);

  const handlePrint = async () => {
    if (!order || !isFormValid) {
      toast.warning(sequencialValidation.errorMessage || "Preencha os campos obrigatórios corretamente.");
      return;
    }

    let itensParaImprimir: EtiquetaInspecaoItem[] = [];

    if (modo === "manual") {
      const numTrim = numeroPacoteManual.trim();
      itensParaImprimir = [
        {
          cliente,
          servico,
          quantidade,
          osNumero,
          observacao,
          numeroPacote: numTrim,
          linhaPacoteHtml: formatLinhaPacoteManual(numTrim),
        },
      ];
    } else {
      // Modo Sequencial
      const { de, ate, total } = sequencialValidation;
      if (!de || !ate || !total) {
        toast.warning(sequencialValidation.errorMessage || "Informe o intervalo De e Até.");
        return;
      }

      // Confirmação para volumes maiores que 100 etiquetas
      if (total > CONFIRM_THRESHOLD_ETIQUETAS) {
        const confirmou = window.confirm(
          `Você vai imprimir ${total} etiquetas. Confirmar?`
        );
        if (!confirmou) return;
      }

      const numeros = generateSequenciaNumeros(de, ate);
      itensParaImprimir = numeros.map((num) => ({
        cliente,
        servico,
        quantidade,
        osNumero,
        observacao,
        numeroPacote: num,
        linhaPacoteHtml: formatLinhaPacoteSequencial(num),
      }));
    }

    if (itensParaImprimir.length === 0) {
      toast.error("Nenhuma etiqueta foi gerada.");
      return;
    }

    try {
      setIsPrinting(true);
      const printHtml = generateEtiquetasInspecaoPrintHtml(itensParaImprimir, alturaMm);
      await printEtiquetasInspecaoViaIframe(printHtml);

      // Mantém o diálogo aberto para o operador poder conferir, ajustar ou fechar quando quiser
      toast.info("Janela de impressão aberta no navegador.");
    } catch (err: unknown) {
      console.error("[EtiquetaInspecao] Erro na impressão:", err);
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
            <Printer className="h-5 w-5 text-emerald-400 shrink-0" />
            <span>Imprimir Etiqueta de Embalagem — Inspeção</span>
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

            {/* Campo Obs: multilinha, opcional, max 120 caracteres com contador */}
            <div className="sm:col-span-2 space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Obs. (opcional):
                </Label>
                <span className={`text-[10px] font-mono-tech ${observacao.length > MAX_OBS_CHARS ? "text-rose-500 font-bold" : "text-muted-foreground"}`}>
                  {observacao.length}/{MAX_OBS_CHARS}
                </span>
              </div>
              <Textarea
                value={observacao}
                maxLength={MAX_OBS_CHARS}
                onChange={(e) => setObservacao(e.target.value.slice(0, MAX_OBS_CHARS))}
                placeholder="Observações adicionais para a etiqueta..."
                rows={2}
                className="text-xs max-sm:text-base bg-background resize-none"
              />
            </div>
          </div>

          {/* Seletor "Numeração do pacote" com 2 modos: Manual ou Sequencial */}
          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                <span>Numeração do Pacote</span>
              </Label>

              {/* Toggle de Modos: Manual / Sequencial */}
              <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded-lg border border-border/60">
                <button
                  type="button"
                  onClick={() => setModo("manual")}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    modo === "manual"
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setModo("sequencial")}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    modo === "sequencial"
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sequencial
                </button>
              </div>
            </div>

            {/* Configurações do modo MANUAL */}
            {modo === "manual" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Número do pacote (opcional, máx 6 caracteres):
                </Label>
                <Input
                  value={numeroPacoteManual}
                  maxLength={6}
                  onChange={(e) => setNumeroPacoteManual(e.target.value.slice(0, 6))}
                  placeholder="Ex: 01, 7, 12A (deixe vazio para traço ______)"
                  className="text-base font-bold max-sm:h-11 bg-background"
                />
                <p className="text-[10px] text-muted-foreground">
                  Gera 1 etiqueta. A quantidade de etiquetas iguais deve ser definida no campo &quot;Cópias&quot; da janela de impressão.
                </p>
              </div>
            )}

            {/* Configurações do modo SEQUENCIAL */}
            {modo === "sequencial" && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      De:
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={deStr}
                      onChange={(e) => setDeStr(e.target.value)}
                      placeholder="1"
                      className="text-base font-bold max-sm:h-11 bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                      <span>Até: *</span>
                      <span className="text-[10px] text-emerald-400 font-normal">obrigatório</span>
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={ateStr}
                      onChange={(e) => setAteStr(e.target.value)}
                      placeholder="Ex: 10"
                      className={`text-base font-bold max-sm:h-11 bg-background ${
                        ateStr && !sequencialValidation.isValid
                          ? "border-rose-500 focus-visible:ring-rose-500"
                          : ""
                      }`}
                    />
                  </div>
                </div>

                {!sequencialValidation.isValid && sequencialValidation.errorMessage && (
                  <p className="text-xs text-rose-400 font-medium">
                    {sequencialValidation.errorMessage}
                  </p>
                )}

                {sequencialValidation.isValid && sequencialValidation.total && (
                  <p className="text-xs text-emerald-400 font-semibold">
                    Serão impressas {sequencialValidation.total} etiquetas (de{" "}
                    {generateSequenciaNumeros(sequencialValidation.de!, sequencialValidation.ate!)[0]} até{" "}
                    {generateSequenciaNumeros(sequencialValidation.de!, sequencialValidation.ate!).slice(-1)[0]}).
                  </p>
                )}
              </div>
            )}

            {/* Seletor rápido de altura da etiqueta */}
            <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20 text-xs">
              <span className="text-[11px] text-muted-foreground">
                Tamanho da bobina:
              </span>
              <div className="flex items-center gap-1">
                {[40, 50, 60].map((mm) => (
                  <button
                    key={mm}
                    type="button"
                    onClick={() => setAlturaMm(mm)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                      alturaMm === mm
                        ? "bg-emerald-500 text-white border-emerald-600"
                        : "bg-background text-muted-foreground border-border hover:bg-muted/50"
                    }`}
                  >
                    80x{mm}mm
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Pré-visualização da etiqueta fiel ao layout térmico */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  Pré-visualização ({modo === "sequencial" ? "Primeira Etiqueta" : "Etiqueta"} — 80x{alturaMm}mm):
                </span>
              </Label>
              <span className="text-[10px] text-muted-foreground">Fiel à Zebra ZD230</span>
            </div>

            <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-border/80 flex items-center justify-center overflow-x-auto">
              <div
                style={{
                  width: "100%",
                  maxWidth: "340px",
                  aspectRatio: `80 / ${alturaMm}`,
                }}
                className="bg-white text-black p-3 rounded shadow-md border border-neutral-300 font-sans text-xs flex flex-col justify-between select-none"
              >
                <div className="space-y-1 text-[11px] leading-tight">
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold text-black shrink-0">Cliente:</span>
                    <span className="font-semibold text-black break-words line-clamp-2">
                      {previewItem.cliente.trim() || "—"}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="font-bold text-black shrink-0">Serviço:</span>
                    <span className="text-black break-words line-clamp-2">
                      {previewItem.servico.trim() || "—"}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 pt-0.5">
                    <div className="flex items-baseline gap-1">
                      <span className="font-bold text-black shrink-0">Quantidade:</span>
                      <span className="font-semibold text-black">
                        {previewItem.quantidade.trim() || "—"}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="font-bold text-black shrink-0">O.S.:</span>
                      <span className="font-extrabold text-black">
                        {previewItem.osNumero.trim() || "—"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-1 pt-0.5 min-h-[18px]">
                    <span className="font-bold text-black shrink-0">Obs.:</span>
                    <span className="text-[10px] text-black break-words line-clamp-3">
                      {previewItem.observacao?.trim() || <span className="inline-block w-32 border-b border-dotted border-black/60">&nbsp;</span>}
                    </span>
                  </div>
                </div>

                <div className="text-center font-black text-base pt-1.5 mt-auto border-t-2 border-dashed border-black tracking-wide text-black leading-none">
                  Pacote{" "}
                  <u className="underline underline-offset-4">
                    {previewItem.numeroPacote || "______"}
                  </u>
                </div>
              </div>
            </div>
          </div>

          {/* Aviso obrigatório de configuração da Zebra ZD230 */}
          <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-[11px] text-muted-foreground flex items-start gap-2">
            <Info className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Selecione a impressora Zebra ZD230, margens: nenhuma, escala: 100%. No modo Manual, defina a quantidade de etiquetas no campo Cópias da janela de impressão. No modo Sequencial, mantenha Cópias = 1.
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
            Cancelar
          </Button>

          <Button
            type="button"
            onClick={handlePrint}
            disabled={!isFormValid || isPrinting}
            className="w-full sm:w-auto max-sm:min-h-[40px] gap-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            <Printer className="h-4 w-4" />
            <span>
              {isPrinting
                ? "Preparando..."
                : modo === "sequencial" && sequencialValidation.total
                ? `Imprimir (${sequencialValidation.total} ${
                    sequencialValidation.total === 1 ? "etiqueta" : "etiquetas"
                  })`
                : "Imprimir Etiqueta"}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
