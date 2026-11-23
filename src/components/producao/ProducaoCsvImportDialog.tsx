import { useState, useRef } from "react";
import { Order } from "@/types/order";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileCheck,
  AlertTriangle,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import {
  readFileWithEncoding,
  parsePosicaoCsv,
  importPosicaoCsv,
  CsvPosicaoRow,
  CsvImportResult,
} from "@/lib/csvPosicaoImporter";
import { cleanOsNumber } from "@/lib/orderRelationsService";

interface ProducaoCsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: Order[];
  onBatchUpdateOrders: (updatedMap: Map<string, Partial<Order>>) => void;
}

export function ProducaoCsvImportDialog({
  open,
  onOpenChange,
  orders,
  onBatchUpdateOrders,
}: ProducaoCsvImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<CsvPosicaoRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Calcula correspondência prévia
  const matchStats = parsedRows.length > 0 ? (() => {
    const orderSet = new Set<string>();
    orders.forEach((o) => {
      const num = cleanOsNumber(o.titulo);
      if (num) orderSet.add(num);
    });

    let matched = 0;
    let notMatched = 0;
    parsedRows.forEach((r) => {
      if (orderSet.has(r.nroOs)) matched++;
      else notMatched++;
    });

    return { matched, notMatched };
  })() : null;

  const handleFileSelected = async (selectedFile: File) => {
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith(".csv") && !selectedFile.name.toLowerCase().endsWith(".txt")) {
      toast.error("Por favor, selecione um arquivo no formato .CSV do Excel.");
      return;
    }

    setFile(selectedFile);
    setImportResult(null);
    setIsParsing(true);

    try {
      const text = await readFileWithEncoding(selectedFile);
      const rows = parsePosicaoCsv(text);

      if (rows.length === 0) {
        toast.warning("Nenhuma linha válida de O.S. foi encontrada no arquivo.");
        setParsedRows([]);
      } else {
        setParsedRows(rows);
        toast.info(`${rows.length} linhas lidas do arquivo .CSV.`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao ler e processar o arquivo CSV.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedRows.length === 0) return;

    setIsImporting(true);
    setImportProgress({ current: 0, total: parsedRows.length });

    try {
      const { result, updatedOrdersMap } = await importPosicaoCsv(
        parsedRows,
        orders,
        (current, total) => {
          setImportProgress({ current, total });
        }
      );

      // Atualiza o estado local imediatamente
      onBatchUpdateOrders(updatedOrdersMap);
      setImportResult(result);

      toast.success(
        `${result.updatedCount} O.S. atualizadas com sucesso! (${result.skippedCount} ignoradas por não estarem no Kanban).`,
        { duration: 6000 }
      );
    } catch (err) {
      console.error(err);
      toast.error("Falha ao salvar atualizações no banco de dados.");
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsedRows([]);
    setImportResult(null);
    setImportProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!isImporting) {
      if (!nextOpen) {
        handleReset();
      }
      onOpenChange(nextOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-sm:w-[94vw] max-sm:max-w-full sm:max-w-lg bg-card border-border text-card-foreground shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
            <span>Importar CSV do Excel — Posição e Previsão</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Instruções */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Selecione o arquivo <strong>.CSV</strong> do Excel contendo as colunas:{" "}
            <span className="font-mono-tech text-foreground font-semibold">
              Nro OS; Posição atual; Dt.posição; Previsão Cliente
            </span>
            . Apenas as O.S. existentes no Kaban serão atualizadas.
          </p>

          {/* Área de Seleção do Arquivo */}
          {!importResult && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                file
                  ? "border-emerald-500/50 bg-emerald-500/5 hover:bg-emerald-500/10"
                  : "border-border hover:border-emerald-500/50 hover:bg-accent/40"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelected(f);
                }}
              />

              {isParsing ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground py-2">
                  <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
                  <span className="text-xs">Lendo arquivo CSV...</span>
                </div>
              ) : file ? (
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <FileCheck className="h-8 w-8 text-emerald-500" />
                  <span className="text-xs font-bold font-mono-tech text-foreground">
                    {file.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB — Clique para trocar de arquivo
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">
                    Clique para selecionar o arquivo .CSV do Excel
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Compatível com separador ";" e codificação Windows-1252 / ANSI
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Prévia da Análise */}
          {matchStats && !importResult && (
            <div className="p-3 rounded-xl bg-accent/40 border border-border space-y-2 text-xs">
              <div className="flex items-center justify-between font-mono-tech">
                <span className="text-muted-foreground">Total de linhas no CSV:</span>
                <Badge variant="outline" className="font-bold">
                  {parsedRows.length} O.S.
                </Badge>
              </div>

              <div className="flex items-center justify-between font-mono-tech">
                <span className="text-emerald-500 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Existentes no Kaban (serão atualizadas):
                </span>
                <Badge className="bg-emerald-600 text-white font-bold">
                  {matchStats.matched}
                </Badge>
              </div>

              <div className="flex items-center justify-between font-mono-tech">
                <span className="text-amber-500 font-semibold flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Não encontradas (serão ignoradas):
                </span>
                <Badge variant="secondary" className="text-amber-500 font-bold">
                  {matchStats.notMatched}
                </Badge>
              </div>

              {/* Amostra das primeiras 3 O.S. */}
              {parsedRows.length > 0 && (
                <div className="pt-2 border-t border-border/60">
                  <span className="text-[10px] text-muted-foreground uppercase font-mono-tech">
                    Exemplo de dados lidos:
                  </span>
                  <div className="mt-1 space-y-1 font-mono-tech text-[11px] text-muted-foreground">
                    {parsedRows.slice(0, 3).map((r, i) => (
                      <div key={i} className="truncate">
                        #{r.nroOs} → Posição: <strong>{r.posicaoAtual || "—"}</strong> | Dt:{" "}
                        {r.dataPosicao || "—"} | Prev: {r.previsaoCliente || "—"}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Progresso de Importação */}
          {isImporting && (
            <div className="p-4 rounded-xl bg-accent/50 border border-emerald-500/40 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono-tech">
                <span className="text-foreground font-semibold flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-emerald-500" />
                  Atualizando ordens no banco de dados...
                </span>
                {importProgress && (
                  <span className="text-muted-foreground font-bold">
                    {importProgress.current} / {importProgress.total}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Resultado Pós-Importação */}
          {importResult && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/40 space-y-3">
                <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Importação Concluída com Sucesso!</span>
                </div>
                <div className="text-xs space-y-1 text-foreground font-mono-tech">
                  <p>
                    • <strong>{importResult.updatedCount}</strong> O.S. atualizadas no Kaban.
                  </p>
                  <p className="text-muted-foreground">
                    • <strong>{importResult.skippedCount}</strong> O.S. ignoradas por não existirem no Kaban.
                  </p>
                </div>
              </div>

              {importResult.databaseColumnsMissing && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-xs">
                  <div className="flex items-start gap-2 text-amber-500">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">Salvo com Segurança no Navegador</p>
                      <p className="text-muted-foreground mt-0.5 leading-relaxed">
                        Os dados foram salvos no armazenamento local deste navegador e <strong>não vão sumir ao atualizar a página</strong>.
                        Para que todos os outros computadores da gráfica também vejam as colunas no Supabase, execute o script SQL abaixo no Supabase SQL Editor:
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-black/40 p-2 rounded border border-border/60">
                    <span className="font-mono-tech text-[11px] text-muted-foreground truncate max-w-[280px]">
                      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS posicao_atual...
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 shrink-0 ml-2"
                      onClick={() => {
                        const sql = `ALTER TABLE public.orders\n  ADD COLUMN IF NOT EXISTS posicao_atual TEXT,\n  ADD COLUMN IF NOT EXISTS data_posicao TEXT,\n  ADD COLUMN IF NOT EXISTS previsao_cliente TEXT;\n\nCREATE INDEX IF NOT EXISTS idx_orders_posicao_atual ON public.orders(posicao_atual);\nCREATE INDEX IF NOT EXISTS idx_orders_data_posicao ON public.orders(data_posicao);\nCREATE INDEX IF NOT EXISTS idx_orders_previsao_cliente ON public.orders(previsao_cliente);\n\nNOTIFY pgrst, 'reload schema';`;
                        void navigator.clipboard.writeText(sql);
                        toast.success("Script SQL copiado com sucesso!");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copiar SQL</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          {importResult ? (
            <Button
              type="button"
              className="w-full font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              onClick={() => handleClose(false)}
            >
              Fechar
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleClose(false)}
                disabled={isImporting}
              >
                Cancelar
              </Button>

              <Button
                type="button"
                size="sm"
                disabled={!file || parsedRows.length === 0 || isImporting || isParsing}
                onClick={handleConfirmImport}
                className="font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer gap-2"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Importando...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    <span>Atualizar {matchStats?.matched || 0} O.S.</span>
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
