import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CrmOpportunity, CrmProposal, formatCurrency } from "@/types/crm";
import {
  Plus,
  Trash2,
  FileSpreadsheet,
  Layers,
  Calculator,
  Calendar,
  AlertCircle,
  Copy,
  Printer,
} from "lucide-react";
import { toast } from "sonner";

interface ItemRow {
  descricao_item: string;
  formato_aberto: string;
  formato_fechado: string;
  papel_substrato: string;
  cores_impressao: string;
  acabamentos_especiais: string;
  quantidade: number;
  preco_unitario: number;
}

interface CreateProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: CrmOpportunity;
  baseProposal?: CrmProposal | null; // Se fornecido, é modo revisão (v1 -> v2)
  onSave: (data: any) => Promise<any>;
}

export function CreateProposalDialog({
  open,
  onOpenChange,
  opportunity,
  baseProposal,
  onSave,
}: CreateProposalDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  const [itens, setItens] = useState<ItemRow[]>([
    {
      descricao_item: opportunity.servico_solicitado || "Impressão Gráfica Personalizada",
      formato_aberto: "",
      formato_fechado: "",
      papel_substrato: "Cartão Triplex 350g",
      cores_impressao: "4x0 Cores",
      acabamentos_especiais: "Corte e Vinco, Laminação Fosca",
      quantidade: 1000,
      preco_unitario: 1.5,
    },
  ]);

  const [condicoesPagamento, setCondicoesPagamento] = useState("Boleto 28 DDL");
  const [prazoProducaoDias, setPrazoProducaoDias] = useState<number>(7);
  const [validadeDias, setValidadeDias] = useState<number>(10);
  const [descontoPercentual, setDescontoPercentual] = useState<number>(0);
  const [descontoValor, setDescontoValor] = useState<number>(0);
  const [observacoes, setObservacoes] = useState("");

  // Se estiver criando uma revisão de proposta existente, pré-carrega os dados
  useEffect(() => {
    if (baseProposal) {
      if (baseProposal.itens && baseProposal.itens.length > 0) {
        setItens(
          baseProposal.itens.map((it) => ({
            descricao_item: it.descricao_item,
            formato_aberto: it.formato_aberto || "",
            formato_fechado: it.formato_fechado || "",
            papel_substrato: it.papel_substrato || "",
            cores_impressao: it.cores_impressao || "",
            acabamentos_especiais: it.acabamentos_especiais || "",
            quantidade: it.quantidade,
            preco_unitario: it.preco_unitario,
          }))
        );
      }
      setCondicoesPagamento(baseProposal.condicoes_pagamento || "Boleto 28 DDL");
      setPrazoProducaoDias(baseProposal.prazo_producao_dias || 7);
      setValidadeDias(baseProposal.validade_dias || 10);
      setDescontoPercentual(baseProposal.desconto_percentual || 0);
      setDescontoValor(baseProposal.desconto_valor || 0);
      setObservacoes(baseProposal.observacoes || "");
    }
  }, [baseProposal, open]);

  // Cálculos dinâmicos em tempo real
  const subtotalTotal = useMemo(() => {
    return itens.reduce((acc, it) => acc + (Number(it.quantidade) || 0) * (Number(it.preco_unitario) || 0), 0);
  }, [itens]);

  const calculatedDiscount = useMemo(() => {
    if (descontoPercentual > 0) {
      return (subtotalTotal * descontoPercentual) / 100;
    }
    return descontoValor;
  }, [subtotalTotal, descontoPercentual, descontoValor]);

  const valorLiquido = useMemo(() => {
    return Math.max(0, subtotalTotal - calculatedDiscount);
  }, [subtotalTotal, calculatedDiscount]);

  // Manipulação de itens
  const handleAddItem = () => {
    setItens((prev) => [
      ...prev,
      {
        descricao_item: "",
        formato_aberto: "",
        formato_fechado: "",
        papel_substrato: "Couchê 150g",
        cores_impressao: "4x4 Cores",
        acabamentos_especiais: "",
        quantidade: 1000,
        preco_unitario: 0.5,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (itens.length === 1) {
      toast.warning("A proposta deve conter ao menos 1 item.");
      return;
    }
    setItens((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, field: keyof ItemRow, value: any) => {
    setItens((prev) =>
      prev.map((it, i) => (i === index ? { ...it, [field]: value } : it))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (itens.some((it) => !it.descricao_item.trim() || it.quantidade <= 0)) {
      toast.error("Preencha a descrição e quantidade válida de todos os itens.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        oportunidade_id: opportunity.id,
        condicoes_pagamento: condicoesPagamento.trim(),
        prazo_producao_dias: Number(prazoProducaoDias) || 7,
        validade_dias: Number(validadeDias) || 10,
        desconto_percentual: Number(descontoPercentual) || 0,
        desconto_valor: calculatedDiscount,
        observacoes: observacoes.trim(),
        itens: itens.map((it) => ({
          ...it,
          quantidade: Number(it.quantidade) || 1,
          preco_unitario: Number(it.preco_unitario) || 0,
        })),
      };

      const res = await onSave(payload);
      if (res) {
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden border border-border bg-card text-card-foreground shadow-2xl rounded-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-500">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  {baseProposal
                    ? `Nova Revisão de Orçamento (v${(baseProposal.versao_numero || 1) + 1})`
                    : "Elaborar Proposta Comercial / Orçamento"}
                </DialogTitle>
                <p className="text-xs text-muted-foreground truncate max-w-xl">
                  Cliente: <span className="font-semibold text-foreground">{opportunity.cliente_nome}</span> • Oportunidade: {opportunity.titulo}
                </p>
              </div>
            </div>

            {baseProposal && (
              <span className="text-xs bg-purple-500/15 text-purple-400 border border-purple-500/30 font-mono-tech px-2.5 py-1 rounded-lg">
                Revisão de: {baseProposal.numero_proposta}
              </span>
            )}
          </div>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* Alerta de versionamento se for revisão */}
          {baseProposal && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-300 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Controle de Versão Ativo:</span> A versão anterior{" "}
                <span className="font-mono-tech font-bold">{baseProposal.numero_proposta}</span> será preservada no histórico e marcada como revisada. Nenhuma informação anterior será perdida.
              </div>
            </div>
          )}

          {/* Tabela Dinâmica de Itens Gráficos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <span>Itens e Serviços Gráficos</span>
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                className="gap-1.5 text-xs rounded-xl border-border hover:border-primary/50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar Item</span>
              </Button>
            </div>

            <div className="space-y-3">
              {itens.map((item, idx) => {
                const sub = (Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0);

                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-3 relative group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono-tech font-bold text-primary">
                        Item #{idx + 1}
                      </span>
                      {itens.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(idx)}
                          className="h-7 w-7 text-muted-foreground hover:text-rose-500 rounded-lg"
                          title="Remover Item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {/* Descrição */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-12 space-y-1">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          Descrição do Produto / Serviço <span className="text-rose-500">*</span>
                        </Label>
                        <Input
                          value={item.descricao_item}
                          onChange={(e) => handleUpdateItem(idx, "descricao_item", e.target.value)}
                          placeholder="Ex: Cartucho Farmacêutico 150ml com Laminação Brilho"
                          className="h-9 rounded-xl text-xs bg-background border-border"
                          required
                        />
                      </div>
                    </div>

                    {/* Especificações Gráficas */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Formato Aberto / Fechado</Label>
                        <Input
                          value={item.formato_aberto}
                          onChange={(e) => handleUpdateItem(idx, "formato_aberto", e.target.value)}
                          placeholder="Ex: 220x310mm"
                          className="h-8 rounded-lg text-xs bg-background border-border"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Papel / Gramatura</Label>
                        <Input
                          value={item.papel_substrato}
                          onChange={(e) => handleUpdateItem(idx, "papel_substrato", e.target.value)}
                          placeholder="Ex: Triplex 350g"
                          className="h-8 rounded-lg text-xs bg-background border-border"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Cores de Impressão</Label>
                        <Input
                          value={item.cores_impressao}
                          onChange={(e) => handleUpdateItem(idx, "cores_impressao", e.target.value)}
                          placeholder="Ex: 4x0 (CMYK)"
                          className="h-8 rounded-lg text-xs bg-background border-border"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Acabamentos Especiais</Label>
                        <Input
                          value={item.acabamentos_especiais}
                          onChange={(e) => handleUpdateItem(idx, "acabamentos_especiais", e.target.value)}
                          placeholder="Ex: Laminação, Hot, Verniz"
                          className="h-8 rounded-lg text-xs bg-background border-border"
                        />
                      </div>
                    </div>

                    {/* Quantidade, Preço Unitário e Subtotal */}
                    <div className="grid grid-cols-3 gap-3 pt-1 border-t border-border/40 items-center">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-foreground">Quantidade</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantidade}
                          onChange={(e) => handleUpdateItem(idx, "quantidade", Number(e.target.value))}
                          className="h-8 rounded-lg font-mono-tech text-xs bg-background border-border"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-foreground">Preço Unitário (R$)</Label>
                        <Input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={item.preco_unitario}
                          onChange={(e) => handleUpdateItem(idx, "preco_unitario", Number(e.target.value))}
                          className="h-8 rounded-lg font-mono-tech text-xs bg-background border-border"
                          required
                        />
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block uppercase">Subtotal</span>
                        <span className="text-sm font-bold font-mono-tech text-foreground">
                          {formatCurrency(sub)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Condições Comerciais & Descontos */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-3 border-t border-border/60">
            {/* Condições de Pagamento */}
            <div className="md:col-span-6 space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Condições de Pagamento</Label>
              <Input
                value={condicoesPagamento}
                onChange={(e) => setCondicoesPagamento(e.target.value)}
                placeholder="Ex: Boleto 28 DDL / 50% Entrada e 50% Entrega"
                className="h-9 rounded-xl text-xs bg-background border-border"
              />
            </div>

            {/* Prazo de Produção */}
            <div className="md:col-span-3 space-y-1.5">
              <Label className="text-xs font-medium text-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Prazo de Produção
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  value={prazoProducaoDias}
                  onChange={(e) => setPrazoProducaoDias(Number(e.target.value))}
                  className="h-9 rounded-xl text-xs font-mono-tech pr-14 bg-background border-border"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                  dias úteis
                </span>
              </div>
            </div>

            {/* Validade da Proposta */}
            <div className="md:col-span-3 space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Validade da Proposta</Label>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  value={validadeDias}
                  onChange={(e) => setValidadeDias(Number(e.target.value))}
                  className="h-9 rounded-xl text-xs font-mono-tech pr-10 bg-background border-border"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                  dias
                </span>
              </div>
            </div>
          </div>

          {/* Desconto & Totais */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/40 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Subtotal Bruto:</span>
              <span className="font-bold font-mono-tech text-foreground text-sm">
                {formatCurrency(subtotalTotal)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/40">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Desconto Autorizado (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={descontoPercentual}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDescontoPercentual(val);
                    setDescontoValor(0);
                  }}
                  className="h-8 rounded-lg font-mono-tech text-xs bg-background border-border"
                />
              </div>

              <div className="space-y-1 text-right">
                <Label className="text-[11px] text-muted-foreground">Valor do Desconto</Label>
                <div className="text-xs font-mono-tech text-rose-500 font-semibold pt-1">
                  - {formatCurrency(calculatedDiscount)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm pt-2 border-t border-border font-bold">
              <span className="text-foreground">VALOR TOTAL LÍQUIDO:</span>
              <span className="font-mono-tech text-lg text-primary">
                {formatCurrency(valorLiquido)}
              </span>
            </div>
          </div>

          {/* Observações da Proposta */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Observações Comerciais ou Técnicas na Proposta
            </Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Informações sobre frete, prova contratual, tolerância gráfica..."
              className="min-h-[70px] rounded-xl text-xs bg-background border-border"
            />
          </div>

          <DialogFooter className="pt-3 border-t border-border gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs text-muted-foreground"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="rounded-xl text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium shadow-md shadow-cyan-500/20"
            >
              {submitting
                ? "Processando..."
                : baseProposal
                ? "Salvar Nova Revisão"
                : "Gerar Proposta Comercial"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
