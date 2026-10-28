import React, { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CrmOpportunity, CrmProposal, formatCurrency } from "@/types/crm";
import {
  Sparkles,
  Building,
  User,
  Calendar,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ConvertToOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: CrmOpportunity | null;
  proposal?: CrmProposal | null;
  onSuccess?: () => void;
}

export function ConvertToOrderDialog({
  open,
  onOpenChange,
  opportunity,
  proposal,
  onSuccess,
}: ConvertToOrderDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([]);

  // Sugere número da OS a partir do código ou sequencial
  const suggestedOsNumber = opportunity?.codigo_identificador
    ? opportunity.codigo_identificador.replace("OPT-", "").replace(/^202\d-/, "")
    : String(opportunity?.numero_sequencial || "");

  const [form, setForm] = useState({
    titulo: suggestedOsNumber,
    cliente: opportunity?.cliente_nome || "",
    vendedor: opportunity?.vendedor_nome || "",
    descricao: "",
    prazo: "",
    observacao: "",
    setor: "pre_impressao",
  });

  // Carregar lista de vendedores
  useEffect(() => {
    async function loadVendedores() {
      const { data } = await supabase.from("vendedores").select("id, nome").order("nome");
      if (data) setVendedores(data);
    }
    if (open) {
      void loadVendedores();
    }
  }, [open]);

  // Compilar dados da oportunidade e proposta aprovada
  useEffect(() => {
    if (opportunity) {
      let descCompilada = opportunity.servico_solicitado;

      if (proposal && proposal.itens && proposal.itens.length > 0) {
        const itensText = proposal.itens
          .map(
            (it, i) =>
              `${i + 1}. ${it.quantidade}x ${it.descricao_item}` +
              (it.papel_substrato ? ` | Papel: ${it.papel_substrato}` : "") +
              (it.formato_fechado || it.formato_aberto ? ` | Formato: ${it.formato_fechado || it.formato_aberto}` : "") +
              (it.cores_impressao ? ` | Cores: ${it.cores_impressao}` : "") +
              (it.acabamentos_especiais ? ` | Acabamento: ${it.acabamentos_especiais}` : "")
          )
          .join("\n");

        descCompilada += `\n\n[ITENS DA PROPOSTA ${proposal.numero_proposta}]:\n${itensText}`;
        if (proposal.condicoes_pagamento) {
          descCompilada += `\nCondições: ${proposal.condicoes_pagamento}`;
        }
      } else if (opportunity.descricao_necessidade) {
        descCompilada += `\n\nEspecificações: ${opportunity.descricao_necessidade}`;
      }

      const osNum = opportunity.codigo_identificador
        ? opportunity.codigo_identificador.replace("OPT-", "").replace(/^202\d-/, "")
        : String(opportunity.numero_sequencial);

      setForm({
        titulo: osNum,
        cliente: opportunity.cliente_nome,
        vendedor: opportunity.vendedor_nome || "",
        descricao: descCompilada,
        prazo: opportunity.prazo_fechamento_previsto
          ? opportunity.prazo_fechamento_previsto.slice(0, 10)
          : "",
        observacao: `Origem: Funil Comercial (${opportunity.codigo_identificador || `OPT-${opportunity.numero_sequencial}`})`,
        setor: "pre_impressao",
      });
    }
  }, [opportunity, proposal, open]);

  if (!opportunity) return null;

  // Se já convertida, avisa e bloqueia nova conversão
  if (opportunity.convertida_os_id) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-6 rounded-2xl border-border bg-card">
          <div className="flex items-center gap-3 text-amber-500 mb-2">
            <ShieldAlert className="h-6 w-6" />
            <DialogTitle className="text-base font-bold text-foreground">
              Oportunidade Já Convertida
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Esta oportunidade já foi convertida com sucesso em uma Ordem de Produção no Kanban.
            Para evitar duplicação acidental de pedidos na fábrica, a criação repetida é bloqueada.
          </p>
          <div className="mt-4 p-3 rounded-xl bg-muted/40 border border-border text-xs font-pcp space-y-1">
            <p><strong>Cliente:</strong> {opportunity.cliente_nome}</p>
            <p><strong>Convertida em:</strong> {opportunity.convertida_em ? new Date(opportunity.convertida_em).toLocaleString("pt-BR") : "Sim"}</p>
          </div>
          <DialogFooter className="mt-4">
            <Button size="sm" onClick={() => onOpenChange(false)} className="rounded-xl text-xs">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.titulo.trim()) {
      toast.error("Informe o número da O.S.");
      return;
    }
    if (!form.cliente.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    if (!form.descricao.trim()) {
      toast.error("Informe a descrição e especificações da O.S.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Verifica se já existe uma OS com esse número
      const { data: existing } = await supabase
        .from("orders")
        .select("id, titulo")
        .eq("titulo", form.titulo.trim())
        .limit(1);

      if (existing && existing.length > 0) {
        toast.error(`O número de O.S. #${form.titulo.trim()} já existe no Kanban.`);
        setSubmitting(false);
        return;
      }

      // 2. Insere a nova ordem de produção na tabela orders
      const orderPayload: any = {
        titulo: form.titulo.trim(),
        cliente: form.cliente.trim(),
        descricao: form.descricao.trim(),
        vendedor: form.vendedor.trim() || null,
        observacao: form.observacao.trim() || null,
        prazo: form.prazo ? new Date(form.prazo).toISOString() : null,
        status: "fila_de_entrada",
      };

      if (form.setor && form.setor !== "pre_impressao") {
        orderPayload.setor = form.setor;
        orderPayload.setor_status = "entrada";
      }

      const { data: createdOrder, error: orderErr } = await supabase
        .from("orders")
        .insert(orderPayload)
        .select()
        .single();

      if (orderErr) throw orderErr;

      // 3. Atualiza a oportunidade com a FK da OS e marca como fechada ganha
      const { error: oppUpdateErr } = await supabase
        .from("crm_oportunidades")
        .update({
          convertida_os_id: createdOrder.id,
          convertida_em: new Date().toISOString(),
          status: "fechada_ganha",
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunity.id);

      if (oppUpdateErr) throw oppUpdateErr;

      // 4. Registra na trilha de auditoria
      await supabase.from("crm_oportunidade_historico").insert({
        oportunidade_id: opportunity.id,
        tipo_evento: "conversao_os",
        descricao: `Convertido em Ordem de Produção OS #${form.titulo.trim()} vinculada ao cliente ${form.cliente.trim()}.`,
        dados_novos: { order_id: createdOrder.id, os_numero: form.titulo.trim() },
      });

      toast.success(`Ordem de Produção #${form.titulo.trim()} gerada com sucesso!`);
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("Erro ao converter oportunidade em OS:", err);
      toast.error(err.message || "Falha ao gerar Ordem de Produção.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden border border-border bg-card text-card-foreground shadow-2xl rounded-2xl flex flex-col max-h-[92vh] font-pcp">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Converter em Ordem de Produção (OS)
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Transfira as informações aprovadas da negociação diretamente para o Kanban de produção da fábrica.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Nº da OS */}
            <div className="md:col-span-4 space-y-1.5">
              <Label className="text-xs font-medium text-foreground">
                Número da O.S. <span className="text-rose-500">*</span>
              </Label>
              <Input
                autoFocus
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                className="h-10 rounded-xl font-pcp text-sm font-bold bg-background border-border"
                required
              />
            </div>

            {/* Cliente */}
            <div className="md:col-span-8 space-y-1.5">
              <Label className="text-xs font-medium text-foreground">
                Cliente / Razão Social <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={form.cliente}
                onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
                className="h-10 rounded-xl text-xs bg-background border-border"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Vendedor */}
            <div className="md:col-span-6 space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Vendedor Responsável</Label>
              <Select
                value={form.vendedor}
                onValueChange={(val) => setForm((f) => ({ ...f, vendedor: val }))}
              >
                <SelectTrigger className="h-9 rounded-xl text-xs bg-background border-border">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.nome}>
                      {v.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Prazo */}
            <div className="md:col-span-6 space-y-1.5">
              <Label className="text-xs font-medium text-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3 text-primary" />
                <span>Prazo de Entrega Solicitado</span>
              </Label>
              <Input
                type="date"
                value={form.prazo}
                onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))}
                className="h-9 rounded-xl text-xs font-pcp bg-background border-border"
              />
            </div>
          </div>

          {/* Descrição e Especificações Técnicas */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">
              Descrição do Serviço & Especificações Técnicas para a Fábrica <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              rows={6}
              className="text-xs rounded-xl bg-background border-border font-pcp leading-relaxed"
              required
            />
          </div>

          {/* Observações da OS */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Observações Internas da O.S.</Label>
            <Input
              value={form.observacao}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              className="h-9 rounded-xl text-xs bg-background border-border"
            />
          </div>

          <DialogFooter className="pt-3 border-t border-border gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="rounded-xl text-xs bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-medium shadow-md shadow-emerald-500/20"
            >
              {submitting ? "Gerando O.S..." : "Confirmar e Gerar Ordem de Produção"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
