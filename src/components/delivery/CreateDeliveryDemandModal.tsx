import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Entregador } from "@/types/delivery";
import {
  PackagePlus,
  Truck,
  MapPin,
  Calendar,
  User,
  AlertTriangle,
  Building2,
  FileText,
  Clock,
  Bike,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface CreateDeliveryDemandModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  entregadores?: Entregador[];
}

export function CreateDeliveryDemandModal({
  open,
  onOpenChange,
  onSuccess,
  entregadores = [],
}: CreateDeliveryDemandModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // Form State
  const [tipo, setTipo] = useState<"coleta" | "entrega">("coleta");
  const [titulo, setTitulo] = useState("");
  const [cliente, setCliente] = useState("");
  const [descricao, setDescricao] = useState("");
  const [endereco, setEndereco] = useState("");
  const [responsavelLocal, setResponsavelLocal] = useState("");
  const [dataLimite, setDataLimite] = useState(() => {
    const now = new Date();
    return format(now, "yyyy-MM-dd'T'HH:mm");
  });
  const [entregadorId, setEntregadorId] = useState("none");
  const [ordemParada, setOrdemParada] = useState("");
  const [solicitante, setSolicitante] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [urgente, setUrgente] = useState(false);

  useEffect(() => {
    if (open) {
      const defaultUser =
        user?.user_metadata?.nome ||
        (user?.email ? user.email.split("@")[0] : "");
      if (defaultUser && !solicitante) {
        setSolicitante(defaultUser);
      }
    }
  }, [open, user]);

  const resetForm = () => {
    setTipo("coleta");
    setTitulo("");
    setCliente("");
    setDescricao("");
    setEndereco("");
    setResponsavelLocal("");
    setDataLimite(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setEntregadorId("none");
    setOrdemParada("");
    setObservacoes("");
    setUrgente(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cliente.trim()) {
      toast.error("Informe o Local, Cliente ou Fornecedor.");
      return;
    }

    if (!descricao.trim()) {
      toast.error("Descreva o que deve ser buscado ou entregue.");
      return;
    }

    if (!endereco.trim()) {
      toast.error("Informe o endereço completo para a rota do entregador.");
      return;
    }

    setLoading(true);

    try {
      const isColeta = tipo === "coleta";
      const autoCode = `${isColeta ? "COL" : "ENT"}-${format(new Date(), "ddHHmm")}`;
      const finalTitulo = titulo.trim() || autoCode;

      const hasDriver = entregadorId && entregadorId !== "none";

      const payload: any = {
        titulo: finalTitulo,
        cliente: cliente.trim(),
        descricao: descricao.trim(),
        observacao: observacoes.trim() || null,
        setor: "expedicao",
        setor_status: "aguardando_expedicao",
        status: "arquivo_liberado",
        tipo_entrega: [isColeta ? "coleta" : "entrega", "demanda_manual"],
        entrega_endereco: endereco.trim(),
        endereco_entrega: endereco.trim(),
        entrega_para: responsavelLocal.trim() || null,
        destinatario: responsavelLocal.trim() || null,
        entrega_data_limite: dataLimite ? new Date(dataLimite).toISOString() : null,
        entregador_id: hasDriver ? entregadorId : null,
        status_entrega: hasDriver ? "atribuido" : "pendente",
        ordem_parada: hasDriver && ordemParada.trim() ? Number(ordemParada) : null,
        vendedor: solicitante.trim() || user?.user_metadata?.nome || user?.email?.split("@")[0] || null,
        urgente,
        criado_por: user?.id || null,
        atualizado_por: user?.id || null,
        arquivado: false,
        parent_order_id: null,
        posicao: 0,
        equipamentos: [],
        acabamentos: [],
        processos: [],
        tipo_trabalho: isColeta ? "Coleta / Buscar" : "Entrega Direta",
      };

      const { data, error } = await supabase
        .from("orders")
        .insert(payload)
        .select()
        .single();

      if (error) {
        throw error;
      }

      toast.success(
        isColeta
          ? `Demanda de COLETA #${finalTitulo} cadastrada com sucesso!`
          : `Demanda de ENTREGA #${finalTitulo} cadastrada com sucesso!`
      );

      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("[CreateDeliveryDemandModal] Erro ao cadastrar demanda:", err);
      toast.error(err.message || "Erro ao cadastrar demanda manual de entrega.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!loading) {
          onOpenChange(v);
          if (!v) resetForm();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Bike className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Nova Demanda de Logística & Entregas
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Cadastre uma demanda manual para ir buscar algo (coleta) ou entregar para um cliente/parceiro.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* SELEÇÃO DO TIPO DE DEMANDA (COLETA X ENTREGA) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Tipo de Demanda *</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTipo("coleta")}
                className={cn(
                  "flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all cursor-pointer",
                  tipo === "coleta"
                    ? "border-amber-500 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/50"
                    : "border-border/60 bg-card/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-2 font-bold text-sm text-amber-400">
                  <PackagePlus className="h-4 w-4" />
                  <span>Coleta (Buscar Algo)</span>
                </div>
                <p className="text-[11px] leading-snug opacity-90">
                  Buscar faca, clichê, prova, papel, insumo ou documentos em fornecedor ou cliente.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setTipo("entrega")}
                className={cn(
                  "flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all cursor-pointer",
                  tipo === "entrega"
                    ? "border-blue-500 bg-blue-500/10 text-blue-300 ring-1 ring-blue-500/50"
                    : "border-border/60 bg-card/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-2 font-bold text-sm text-blue-400">
                  <Truck className="h-4 w-4" />
                  <span>Entrega (Levar Algo)</span>
                </div>
                <p className="text-[11px] leading-snug opacity-90">
                  Levar material impresso, amostras, contratos ou provas diretamente ao destino.
                </p>
              </button>
            </div>
          </div>

          {/* CÓDIGO DA DEMANDA & LOCAL/CLIENTE/FORNECEDOR */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="demand-titulo" className="text-xs font-semibold">
                Nº O.S. ou Código
              </Label>
              <Input
                id="demand-titulo"
                placeholder={tipo === "coleta" ? "Ex: COL-101 ou 75120" : "Ex: ENT-202 ou 75120"}
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="h-8 text-xs font-medium"
              />
              <span className="text-[10px] text-muted-foreground">Em branco gera código auto</span>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="demand-cliente" className="text-xs font-semibold">
                {tipo === "coleta" ? "Buscar Onde? (Fornecedor / Local) *" : "Entregar Para Quem? (Cliente / Local) *"}
              </Label>
              <div className="relative">
                <Building2 className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="demand-cliente"
                  required
                  placeholder={tipo === "coleta" ? "Ex: Clicheria Alfa / Fornecedor Papel" : "Ex: Farmácia Central / Cliente Beta"}
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  className="h-8 pl-8 text-xs font-medium"
                />
              </div>
            </div>
          </div>

          {/* DESCRIÇÃO DA DEMANDA */}
          <div className="space-y-1.5">
            <Label htmlFor="demand-descricao" className="text-xs font-semibold">
              {tipo === "coleta" ? "O que deve ser retirado / buscado? *" : "O que deve ser entregue? *"}
            </Label>
            <div className="relative">
              <FileText className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                id="demand-descricao"
                required
                placeholder={
                  tipo === "coleta"
                    ? "Ex: Retirar 2 caixas de clichês para O.S. 74100 com nota fiscal"
                    : "Ex: Entregar 1.000 folhetos laminados e colher assinatura no canhoto"
                }
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          {/* ENDEREÇO COMPLETO */}
          <div className="space-y-1.5">
            <Label htmlFor="demand-endereco" className="text-xs font-semibold">
              Endereço Completo (para Google Maps e Waze do entregador) *
            </Label>
            <div className="relative">
              <MapPin className="absolute left-2.5 top-2 h-4 w-4 text-primary" />
              <Input
                id="demand-endereco"
                required
                placeholder="Rua / Avenida, Número, Bairro, Cidade - CEP"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          {/* AOS CUIDADOS DE (A/C) E DATA PREVISTA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="demand-responsavel" className="text-xs font-semibold">
                Aos Cuidados de / Contato no Local
              </Label>
              <div className="relative">
                <User className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="demand-responsavel"
                  placeholder="Ex: Falar com Marcos (Expedição) - Ramal 204"
                  value={responsavelLocal}
                  onChange={(e) => setResponsavelLocal(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="demand-data" className="text-xs font-semibold">
                Data e Horário Limite / Previsto
              </Label>
              <div className="relative">
                <Input
                  id="demand-data"
                  type="datetime-local"
                  value={dataLimite}
                  onChange={(e) => setDataLimite(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* ATRIBUIR ENTREGADOR (MOTOBOY) E ORDEM DA PARADA */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-muted/20 p-2.5 rounded-lg border border-border/50">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Bike className="h-3.5 w-3.5 text-primary" />
                Atribuir Entregador (Motoboy)
              </Label>
              <Select value={entregadorId} onValueChange={setEntregadorId}>
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="Selecione um entregador..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Nenhum (Deixar na fila pendente)</span>
                  </SelectItem>
                  {entregadores.map((d) => (
                    <SelectItem key={d.user_id} value={d.user_id}>
                      <span className="flex items-center gap-2">
                        {d.nome_completo}
                        {!d.ativo && <span className="text-[10px] text-amber-500">(Inativo)</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="demand-parada" className="text-xs font-semibold">
                Ordem da Parada
              </Label>
              <Input
                id="demand-parada"
                type="number"
                min="1"
                placeholder="Ex: 1, 2..."
                value={ordemParada}
                onChange={(e) => setOrdemParada(e.target.value)}
                disabled={entregadorId === "none"}
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* SOLICITANTE E URGÊNCIA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div className="space-y-1.5">
              <Label htmlFor="demand-solicitante" className="text-xs font-semibold">
                Solicitante / Departamento / Vendedor
              </Label>
              <Input
                id="demand-solicitante"
                placeholder="Ex: Carlos / Pré-Impressão / Comercial"
                value={solicitante}
                onChange={(e) => setSolicitante(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="pt-4">
              <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 cursor-pointer hover:bg-red-500/20 transition-colors">
                <Checkbox
                  checked={urgente}
                  onCheckedChange={(v) => setUrgente(Boolean(v))}
                />
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Marcar Demanda como URGENTE</span>
                </div>
              </label>
            </div>
          </div>

          {/* OBSERVAÇÕES / INSTRUÇÕES */}
          <div className="space-y-1.5">
            <Label htmlFor="demand-observacoes" className="text-xs font-semibold">
              Observações Adicionais / Instruções Especiais
            </Label>
            <Textarea
              id="demand-observacoes"
              rows={2}
              placeholder="Ex: Entrar pelo portão 2 de carga e descarga; apresentar documento com foto; colher carimbo e assinatura..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="text-xs resize-none"
            />
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className={cn(
                "gap-1.5 font-semibold",
                tipo === "coleta"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground"
              )}
            >
              {loading ? (
                "Criando demanda..."
              ) : (
                <>
                  {tipo === "coleta" ? <PackagePlus className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                  {tipo === "coleta" ? "Criar Demanda de Coleta" : "Criar Demanda de Entrega"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
