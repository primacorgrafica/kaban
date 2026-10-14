import React, { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CrmProposal, CrmOpportunity, formatCurrency } from "@/types/crm";
import { Printer, Copy, Check, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ProposalPrintModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: CrmProposal | null;
  opportunity: CrmOpportunity;
}

export function ProposalPrintModal({
  open,
  onOpenChange,
  proposal,
  opportunity,
}: ProposalPrintModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  if (!proposal) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyWhatsApp = () => {
    const itensText = (proposal.itens || [])
      .map(
        (it, i) =>
          `📌 *Item ${i + 1}: ${it.descricao_item}*\n` +
          `   • Qtd: ${it.quantidade.toLocaleString("pt-BR")}\n` +
          (it.papel_substrato ? `   • Papel: ${it.papel_substrato}\n` : "") +
          (it.formato_fechado ? `   • Formato: ${it.formato_fechado}\n` : "") +
          (it.cores_impressao ? `   • Cores: ${it.cores_impressao}\n` : "") +
          (it.acabamentos_especiais ? `   • Acabamento: ${it.acabamentos_especiais}\n` : "") +
          `   • Valor Unit.: ${formatCurrency(it.preco_unitario)}\n` +
          `   • Subtotal: ${formatCurrency(it.subtotal)}`
      )
      .join("\n\n");

    const message =
      `*PROPOSTA COMERCIAL — PRIMACOR GRÁFICA*\n` +
      `Proposta: ${proposal.numero_proposta}\n` +
      `Cliente: ${opportunity.cliente_nome}\n` +
      `Data: ${format(new Date(proposal.created_at), "dd/MM/yyyy")}\n\n` +
      `*ITENS COTADOS:*\n${itensText}\n\n` +
      `💰 *VALOR TOTAL LÍQUIDO:* ${formatCurrency(proposal.valor_liquido)}\n` +
      (proposal.condicoes_pagamento ? `💳 *Pagamento:* ${proposal.condicoes_pagamento}\n` : "") +
      (proposal.prazo_producao_dias ? `⏱ *Prazo de Produção:* ${proposal.prazo_producao_dias} dias úteis\n` : "") +
      (proposal.validade_dias ? `⏳ *Validade da Proposta:* ${proposal.validade_dias} dias\n` : "") +
      `\nPrimacor Gráfica e Editora • Tel / WhatsApp: (31) 3491-1199`;

    navigator.clipboard.writeText(message);
    setCopied(true);
    toast.success("Texto copiado para a área de transferência!");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden border border-border bg-card shadow-2xl rounded-2xl flex flex-col max-h-[92vh]">
        {/* Top Actions */}
        <div className="px-6 py-3.5 border-b border-border bg-muted/40 flex items-center justify-between shrink-0 print:hidden">
          <DialogTitle className="text-sm font-bold text-foreground">
            Visualização de Proposta Comercial
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyWhatsApp}
              className="gap-1.5 text-xs rounded-xl border-border hover:border-emerald-500 hover:text-emerald-500"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <MessageCircle className="h-3.5 w-3.5" />}
              <span>{copied ? "Copiado!" : "Copiar WhatsApp"}</span>
            </Button>
            <Button
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 text-xs rounded-xl bg-primary text-primary-foreground font-medium"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Imprimir / PDF</span>
            </Button>
          </div>
        </div>

        {/* Proposta Layout Oficial (Imprimível) */}
        <div
          ref={printAreaRef}
          className="p-8 flex-1 overflow-y-auto bg-white text-slate-900 font-sans print:p-0 print:m-0"
        >
          {/* Header da Proposta */}
          <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">PRIMACOR GRÁFICA</h1>
              <p className="text-xs text-slate-600 font-medium">Primacor Gráfica e Editora Ltda</p>
              <p className="text-[11px] text-slate-500 font-mono">Belo Horizonte - MG • Tel: (31) 3491-1199</p>
            </div>
            <div className="text-right">
              <span className="inline-block text-xs font-mono font-bold bg-slate-100 text-slate-800 px-3 py-1 rounded border border-slate-300">
                {proposal.numero_proposta}
              </span>
              <p className="text-xs text-slate-600 mt-1">
                Data: {format(new Date(proposal.created_at), "dd/MM/yyyy")}
              </p>
              {proposal.data_validade && (
                <p className="text-[11px] text-slate-500">
                  Válida até: {format(new Date(proposal.data_validade), "dd/MM/yyyy")}
                </p>
              )}
            </div>
          </div>

          {/* Dados do Cliente */}
          <div className="my-5 p-4 rounded-lg bg-slate-50 border border-slate-200">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Dados do Cliente</h2>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-bold text-sm text-slate-900">{opportunity.cliente_nome}</p>
                {opportunity.contato_nome && (
                  <p className="text-slate-600 mt-0.5">A/C: {opportunity.contato_nome}</p>
                )}
              </div>
              <div className="text-right">
                {opportunity.contato_telefone && (
                  <p className="text-slate-600">Telefone: {opportunity.contato_telefone}</p>
                )}
                {opportunity.contato_email && (
                  <p className="text-slate-600">E-mail: {opportunity.contato_email}</p>
                )}
              </div>
            </div>
          </div>

          {/* Tabela de Itens */}
          <div className="my-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Itens e Especificações</h2>
            <table className="w-full text-xs border border-slate-300">
              <thead className="bg-slate-100 border-b border-slate-300 text-slate-700">
                <tr>
                  <th className="py-2 px-3 text-left w-12 font-bold">Item</th>
                  <th className="py-2 px-3 text-left font-bold">Descrição e Especificações Técnicas</th>
                  <th className="py-2 px-3 text-center w-20 font-bold">Qtd</th>
                  <th className="py-2 px-3 text-right w-24 font-bold">Valor Unit.</th>
                  <th className="py-2 px-3 text-right w-28 font-bold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(proposal.itens || []).map((it, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 font-mono font-bold text-center text-slate-700">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <p className="font-bold text-slate-900">{it.descricao_item}</p>
                      <div className="text-[11px] text-slate-600 mt-0.5 space-y-0.5">
                        {it.papel_substrato && <p>• Papel: {it.papel_substrato}</p>}
                        {(it.formato_aberto || it.formato_fechado) && (
                          <p>• Formato: {it.formato_fechado || it.formato_aberto}</p>
                        )}
                        {it.cores_impressao && <p>• Cores: {it.cores_impressao}</p>}
                        {it.acabamentos_especiais && <p>• Acabamentos: {it.acabamentos_especiais}</p>}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                      {it.quantidade.toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {formatCurrency(it.preco_unitario)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(it.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totais */}
          <div className="flex justify-end my-5">
            <div className="w-64 space-y-1.5 text-xs p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal Bruto:</span>
                <span className="font-mono">{formatCurrency(proposal.valor_total)}</span>
              </div>
              {proposal.desconto_valor && proposal.desconto_valor > 0 && (
                <div className="flex justify-between text-rose-600 font-semibold">
                  <span>Desconto Concedido:</span>
                  <span className="font-mono">- {formatCurrency(proposal.desconto_valor)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-300">
                <span>VALOR TOTAL:</span>
                <span className="font-mono text-base">{formatCurrency(proposal.valor_liquido)}</span>
              </div>
            </div>
          </div>

          {/* Condições Comerciais */}
          <div className="my-5 p-4 rounded-lg border border-slate-200 text-xs space-y-2 bg-slate-50">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Condições Comerciais</h3>
            <div className="grid grid-cols-2 gap-4">
              {proposal.condicoes_pagamento && (
                <p>
                  <strong className="text-slate-700">Condições de Pagamento:</strong> {proposal.condicoes_pagamento}
                </p>
              )}
              {proposal.prazo_producao_dias && (
                <p>
                  <strong className="text-slate-700">Prazo de Produção:</strong> {proposal.prazo_producao_dias} dias úteis após liberação de arquivo e aprovação de prova.
                </p>
              )}
            </div>
            {proposal.observacoes && (
              <p className="pt-1 border-t border-slate-200 text-slate-600">
                <strong>Observações:</strong> {proposal.observacoes}
              </p>
            )}
          </div>

          {/* Assinaturas */}
          <div className="grid grid-cols-2 gap-12 mt-12 pt-6 border-t border-slate-300 text-center text-xs">
            <div>
              <div className="border-t border-slate-400 w-48 mx-auto mb-1" />
              <p className="font-bold text-slate-800">Primacor Gráfica</p>
              <p className="text-[11px] text-slate-500">Depto. Comercial / Orçamentos</p>
            </div>
            <div>
              <div className="border-t border-slate-400 w-48 mx-auto mb-1" />
              <p className="font-bold text-slate-800">{opportunity.cliente_nome}</p>
              <p className="text-[11px] text-slate-500">De Acordo / Aceite Comercial</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
