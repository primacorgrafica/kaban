import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { parseOrderText, ParsedOrderDraft } from "@/lib/aiAssistant";
import { Sparkles, Check, ArrowRight, RefreshCw, Wand2, FileText, User, Tag, Clock } from "lucide-react";
import { toast } from "sonner";

interface AiOrderParserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyParsed: (draft: ParsedOrderDraft) => void;
  knownVendors?: string[];
}

export function AiOrderParserDialog({
  open,
  onOpenChange,
  onApplyParsed,
  knownVendors = [],
}: AiOrderParserDialogProps) {
  const [inputText, setInputText] = useState("");
  const [parsed, setParsed] = useState<ParsedOrderDraft | null>(null);

  const handleAnalyze = () => {
    if (!inputText.trim()) {
      toast.error("Cole ou digite um texto para analisar.");
      return;
    }
    const result = parseOrderText(inputText, knownVendors);
    setParsed(result);
    toast.success("Texto estruturado com sucesso!");
  };

  const handleApply = () => {
    if (!parsed) return;
    onApplyParsed(parsed);
    onOpenChange(false);
    setInputText("");
    setParsed(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-2xl border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                Assistente IA — Parser Rápido de O.S.
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 font-mono-tech">
                  NLP Primacor
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Cole o texto do WhatsApp, e-mail ou briefing para extrair automaticamente cliente, O.S., vendedor e processos.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Exemplo de briefing:\n"OS 73520 - 5.000 Cartuchos para SoftHair, prazo sexta-feira 17:00, urgente, vendedor Deborah, entregar via carro, processos: PANTONE, LAM, CVM"`}
              className="min-h-[110px] text-xs font-mono-tech bg-muted/30 border-border/70 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 rounded-xl"
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAnalyze}
              className="text-xs gap-1.5 border-purple-500/30 hover:bg-purple-500/10 hover:text-purple-300"
            >
              <Wand2 className="h-3.5 w-3.5 text-purple-400" />
              Processar Texto
            </Button>
          </div>

          {parsed && (
            <div className="rounded-xl border border-purple-500/30 bg-purple-950/10 p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between text-xs font-semibold text-purple-300">
                <span>Campos Identificados</span>
                <span className="font-mono-tech text-[11px] text-muted-foreground">
                  Precisão: {parsed.confidence}%
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-background/50 p-2 border border-border/50">
                  <span className="text-[10px] text-muted-foreground block">Número O.S.:</span>
                  <span className="font-mono-tech font-bold text-primary">
                    {parsed.titulo ? `#${parsed.titulo}` : "(Auto ou Vazio)"}
                  </span>
                </div>

                <div className="rounded-lg bg-background/50 p-2 border border-border/50">
                  <span className="text-[10px] text-muted-foreground block">Cliente:</span>
                  <span className="font-semibold text-foreground truncate block">
                    {parsed.cliente}
                  </span>
                </div>

                <div className="col-span-2 rounded-lg bg-background/50 p-2 border border-border/50">
                  <span className="text-[10px] text-muted-foreground block">Descrição / Produto:</span>
                  <span className="font-medium text-foreground">{parsed.descricao}</span>
                </div>

                <div className="rounded-lg bg-background/50 p-2 border border-border/50">
                  <span className="text-[10px] text-muted-foreground block">Vendedor:</span>
                  <span className="text-foreground">{parsed.vendedor || "Não identificado"}</span>
                </div>

                <div className="rounded-lg bg-background/50 p-2 border border-border/50">
                  <span className="text-[10px] text-muted-foreground block">Prioridade:</span>
                  <span className={parsed.urgente ? "text-red-400 font-bold" : "text-muted-foreground"}>
                    {parsed.urgente ? "URGENTE" : "Normal"}
                  </span>
                </div>
              </div>

              {parsed.processos.length > 0 && (
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-1">Processos Gráficos:</span>
                  <div className="flex flex-wrap gap-1">
                    {parsed.processos.map((p) => (
                      <Badge key={p} variant="outline" className="text-[10px] bg-secondary/40 font-mono-tech">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={!parsed}
            className="text-xs gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium shadow-md shadow-purple-500/20"
          >
            <Check className="h-4 w-4" />
            Aplicar no Formulário de O.S.
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
