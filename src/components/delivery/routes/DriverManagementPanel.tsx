import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Bike,
  Car,
  UserPlus,
  Edit2,
  Trash2,
  Phone,
  CreditCard,
  Plus,
  Save,
  RotateCcw,
  Search,
  ShieldAlert,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import {
  getEntregadoresList,
  saveEntregador,
  toggleEntregadorAtivo,
  inactivateEntregador,
} from "@/lib/deliveryService";
import {
  VEICULO_CATEGORIAS,
  isValidBrazilianPlate,
  normalizeBrazilianPlate,
  type Entregador,
  type VeiculoCategoria,
} from "@/types/delivery";

interface DriverManagementPanelProps {
  mode?: "page" | "modal";
  active?: boolean;
  onDriversUpdated?: () => void;
}

interface ProfileItem {
  user_id: string;
  nome: string;
}

export function DriverManagementPanel({
  mode = "page",
  active = true,
  onDriversUpdated,
}: DriverManagementPanelProps) {
  const permissions = usePermissions();
  const canManage = permissions.canManageEntregadores;
  const canViewDocs = permissions.canViewDriverDocuments;

  const [drivers, setDrivers] = useState<Entregador[]>([]);
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filtros da lista
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"todos" | VeiculoCategoria>("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativos" | "inativos">("ativos");

  // Confirmação de inativação ("exclusão lógica")
  const [driverToInactivate, setDriverToInactivate] = useState<Entregador | null>(null);
  const [inactivating, setInactivating] = useState(false);

  // Estado do formulário
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formUserId, setFormUserId] = useState<string>("");
  const [formNome, setFormNome] = useState("");
  const [formSobrenome, setFormSobrenome] = useState("");
  const [formTelefone, setFormTelefone] = useState("");
  const [formDocumento, setFormDocumento] = useState("");
  const [formCategoria, setFormCategoria] = useState<VeiculoCategoria>("moto");
  const [formModelo, setFormModelo] = useState("");
  const [formPlaca, setFormPlaca] = useState("");
  const [formObservacoes, setFormObservacoes] = useState("");
  const [formAtivo, setFormAtivo] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [driversRes, profilesRes] = await Promise.all([
        getEntregadoresList(),
        supabase.from("profiles").select("user_id, nome").order("nome", { ascending: true }),
      ]);

      if (driversRes.data) {
        setDrivers(driversRes.data);
      }
      if (profilesRes.data) {
        setProfiles(profilesRes.data as ProfileItem[]);
      }
    } catch (err) {
      console.error("[DriverManagementPanel] Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (active) {
      void loadData();
      resetForm();
    }
  }, [active]);

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormUserId("");
    setFormNome("");
    setFormSobrenome("");
    setFormTelefone("");
    setFormDocumento("");
    setFormCategoria("moto");
    setFormModelo("");
    setFormPlaca("");
    setFormObservacoes("");
    setFormAtivo(true);
  };

  const startEdit = (driver: Entregador) => {
    if (!canManage) return;
    setIsEditing(true);
    setEditingId(driver.id);
    setFormUserId(driver.user_id || "");
    setFormNome(driver.nome_completo);
    setFormSobrenome(driver.sobrenome || "");
    setFormTelefone(driver.telefone || "");
    setFormDocumento(driver.documento_identificacao || "");
    setFormCategoria(driver.categoria_veiculo || "moto");
    setFormModelo(driver.modelo_veiculo || "");
    setFormPlaca(driver.placa_veiculo || "");
    setFormObservacoes(driver.observacoes || "");
    setFormAtivo(driver.ativo);
  };

  const handleSelectProfile = (userId: string) => {
    setFormUserId(userId);
    const selectedProfile = profiles.find((p) => p.user_id === userId);
    if (selectedProfile && !formNome) {
      const parts = selectedProfile.nome.trim().split(" ");
      setFormNome(parts[0] || "");
      if (parts.length > 1) {
        setFormSobrenome(parts.slice(1).join(" "));
      }
    }
  };

  const plateTrimmed = formPlaca.trim();
  const isPlateInvalid = plateTrimmed.length > 0 && !isValidBrazilianPlate(plateTrimmed);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) {
      toast.error("Sem permissão para gerenciar entregadores.");
      return;
    }

    if (!formNome.trim()) {
      toast.error("Informe o nome do entregador.");
      return;
    }
    if (!formSobrenome.trim()) {
      toast.error("Informe o sobrenome do entregador.");
      return;
    }
    if (!formCategoria) {
      toast.error("Selecione a categoria do veículo (Moto ou Carro).");
      return;
    }
    if (!formDocumento.trim()) {
      toast.error("Informe o documento de identificação do entregador.");
      return;
    }
    if (plateTrimmed && !isValidBrazilianPlate(plateTrimmed)) {
      toast.error("Placa inválida. Utilize o padrão brasileiro antigo (ABC-1234) ou Mercosul (ABC1D23).");
      return;
    }

    setSaving(true);
    try {
      const res = await saveEntregador({
        id: editingId || undefined,
        user_id: formUserId || null,
        nome_completo: formNome.trim(),
        sobrenome: formSobrenome.trim(),
        telefone: formTelefone.trim() || null,
        documento_identificacao: formDocumento.trim(),
        categoria_veiculo: formCategoria,
        modelo_veiculo: formModelo.trim() || null,
        placa_veiculo: plateTrimmed ? normalizeBrazilianPlate(plateTrimmed) : null,
        observacoes: formObservacoes.trim() || null,
        ativo: formAtivo,
      });

      if (!res.success) {
        toast.error(`Falha ao salvar entregador: ${res.error || "Erro desconhecido"}`);
        return;
      }

      toast.success(
        isEditing
          ? "Cadastro do entregador atualizado com sucesso!"
          : "Novo entregador cadastrado com sucesso!"
      );

      resetForm();
      await loadData();
      onDriversUpdated?.();
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (driver: Entregador) => {
    if (!canManage) return;
    const nextStatus = !driver.ativo;
    const res = await toggleEntregadorAtivo(driver.id, nextStatus);
    if (!res.success) {
      toast.error(`Erro ao atualizar status: ${res.error}`);
      return;
    }

    toast.success(
      nextStatus
        ? `Entregador ${driver.nome_completo} reativado com sucesso.`
        : `Entregador ${driver.nome_completo} foi inativado (histórico preservado).`
    );

    await loadData();
    onDriversUpdated?.();
  };

  const handleConfirmInactivate = async () => {
    if (!driverToInactivate || !canManage) return;
    setInactivating(true);
    try {
      const res = await inactivateEntregador(driverToInactivate.id);
      if (!res.success) {
        toast.error(`Falha ao inativar entregador: ${res.error}`);
        return;
      }
      toast.success(
        `Entregador ${driverToInactivate.nome_completo} inativado! Ele não aparecerá em novas seleções e o histórico foi preservado.`
      );
      if (editingId === driverToInactivate.id) {
        resetForm();
      }
      setDriverToInactivate(null);
      await loadData();
      onDriversUpdated?.();
    } catch (err: any) {
      toast.error(err.message || "Erro ao inativar entregador.");
    } finally {
      setInactivating(false);
    }
  };

  const counts = useMemo(() => {
    const ativos = drivers.filter((d) => d.ativo).length;
    const inativos = drivers.filter((d) => !d.ativo).length;
    return { total: drivers.length, ativos, inativos };
  }, [drivers]);

  const filteredDrivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter((d) => {
      if (categoryFilter !== "todos" && (d.categoria_veiculo || "moto") !== categoryFilter) {
        return false;
      }
      if (statusFilter === "ativos" && !d.ativo) return false;
      if (statusFilter === "inativos" && d.ativo) return false;

      if (!q) return true;
      return (
        d.nome_completo.toLowerCase().includes(q) ||
        (d.sobrenome || "").toLowerCase().includes(q) ||
        (d.modelo_veiculo || "").toLowerCase().includes(q) ||
        (d.placa_veiculo || "").toLowerCase().includes(q) ||
        (d.telefone || "").toLowerCase().includes(q) ||
        (canViewDocs && (d.documento_identificacao || "").toLowerCase().includes(q))
      );
    });
  }, [drivers, search, categoryFilter, statusFilter, canViewDocs]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {!canManage && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-center gap-2.5 text-xs text-amber-300">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            Apenas o responsável pela Expedição e administradores podem incluir, editar, inativar ou visualizar documentos pessoais de entregadores.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUNA ESQUERDA: LISTA E FILTROS */}
        <div className="lg:col-span-7 flex flex-col gap-3 bg-card/60 border border-border rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              Entregadores da Frota
              <Badge variant="secondary" className="text-xs font-mono">
                {counts.ativos} ativo{counts.ativos === 1 ? "" : "s"}
              </Badge>
              {counts.inativos > 0 && (
                <Badge variant="outline" className="text-[11px] text-muted-foreground font-normal">
                  {counts.inativos} inativo{counts.inativos === 1 ? "" : "s"}
                </Badge>
              )}
            </h3>

            {isEditing && canManage && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-primary/40 text-primary"
                onClick={resetForm}
              >
                <Plus className="h-3.5 w-3.5" />
                Novo Entregador
              </Button>
            )}
          </div>

          {/* Busca + Filtros por Categoria e Status */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, sobrenome, veículo, placa ou documento..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Select
                value={categoryFilter}
                onValueChange={(v: "todos" | VeiculoCategoria) => setCategoryFilter(v)}
              >
                <SelectTrigger className="h-8 w-[125px] text-xs bg-background">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas Categ.</SelectItem>
                  {VEICULO_CATEGORIAS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.id === "moto" ? "🏍️ Moto" : "🚗 Carro"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(v: "todos" | "ativos" | "inativos") => setStatusFilter(v)}
              >
                <SelectTrigger className="h-8 w-[110px] text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativos">Ativos</SelectItem>
                  <SelectItem value="inativos">Inativos</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Lista */}
          <div
            className={`flex flex-col gap-2 overflow-y-auto pr-1 ${
              mode === "modal" ? "max-h-[430px]" : "max-h-[calc(100vh-300px)] min-h-[300px]"
            }`}
          >
            {loading ? (
              <div className="text-center py-10 text-xs text-muted-foreground">
                Carregando entregadores...
              </div>
            ) : filteredDrivers.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-lg p-4 text-xs text-muted-foreground">
                Nenhum entregador encontrado para os filtros aplicados.
              </div>
            ) : (
              filteredDrivers.map((driver) => {
                const isSelected = editingId === driver.id;
                const isCar = driver.categoria_veiculo === "carro";
                const hasLinkedUser = Boolean(
                  driver.user_id && profiles.some((p) => p.user_id === driver.user_id)
                );

                return (
                  <div
                    key={driver.id}
                    className={`p-3 rounded-lg border transition-all text-xs flex flex-col gap-2 ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-xs"
                        : driver.ativo
                        ? "border-border bg-card hover:border-border/80"
                        : "border-border/50 bg-muted/30 opacity-75"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`p-2 rounded-lg shrink-0 ${
                            isCar
                              ? "bg-blue-500/15 text-blue-400"
                              : "bg-emerald-500/15 text-emerald-400"
                          }`}
                        >
                          {isCar ? <Car className="h-4 w-4" /> : <Bike className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                            <span>
                              {driver.nome_completo} {driver.sobrenome || ""}
                            </span>
                            <Badge
                              variant={driver.ativo ? "default" : "secondary"}
                              className={`text-[10px] px-1.5 py-0 font-medium ${
                                driver.ativo
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30"
                              }`}
                            >
                              {driver.ativo ? "Ativo" : "Inativo"}
                            </Badge>
                            {hasLinkedUser ? (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 bg-sky-500/10 text-sky-400 border-sky-500/30"
                                title="Usuário vinculado para acesso ao app do entregador"
                              >
                                Login vinculado
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 text-muted-foreground border-border"
                                title="Login do app será vinculado na Fase 5"
                              >
                                Sem login no app
                              </Badge>
                            )}
                          </div>

                          <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="font-medium text-foreground/80">
                              {isCar ? "Carro" : "Moto"}
                            </span>
                            <span>• {driver.modelo_veiculo || "Veículo não informado"}</span>
                            {driver.placa_veiculo && (
                              <span className="font-mono bg-muted px-1.5 py-0.2 rounded text-[10px] border text-foreground">
                                {driver.placa_veiculo}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => startEdit(driver)}
                            title="Editar entregador"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          {driver.ativo ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setDriverToInactivate(driver)}
                              title="Excluir (inativar) entregador preservando histórico"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[10px] text-emerald-400 hover:text-emerald-300"
                              onClick={() => handleToggleStatus(driver)}
                              title="Reativar entregador"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Reativar
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t border-border/50 pt-2 text-[11px] gap-2 flex-wrap">
                      <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
                        {driver.telefone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {driver.telefone}
                          </span>
                        )}
                        {canViewDocs && driver.documento_identificacao && (
                          <span
                            className="flex items-center gap-1 text-foreground/80"
                            title="Documento de identificação (acesso restrito à Expedição/Admin)"
                          >
                            <CreditCard className="h-3 w-3 text-primary" />
                            Doc: {driver.documento_identificacao}
                          </span>
                        )}
                        {driver.observacoes && (
                          <span className="text-[10px] italic truncate max-w-[260px]" title={driver.observacoes}>
                            OBS: {driver.observacoes}
                          </span>
                        )}
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-1.5 ml-auto">
                          <span className="text-[10px] text-muted-foreground">
                            {driver.ativo ? "Ativo" : "Inativo"}
                          </span>
                          <Switch
                            checked={driver.ativo}
                            onCheckedChange={() => handleToggleStatus(driver)}
                            aria-label="Alternar status ativo/inativo"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUNA DIREITA: FORMULÁRIO DE INCLUSÃO / EDIÇÃO */}
        <div className="lg:col-span-5 bg-card/80 border border-border rounded-xl p-4 flex flex-col gap-3.5">
          <div className="flex items-center justify-between border-b pb-2.5">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              {isEditing ? (
                <>
                  <Edit2 className="h-4 w-4 text-primary" />
                  Editar Entregador
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 text-primary" />
                  Novo Entregador
                </>
              )}
            </h3>
            {isEditing && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground gap-1"
                onClick={resetForm}
              >
                <RotateCcw className="h-3 w-3" />
                Cancelar
              </Button>
            )}
          </div>

          <form onSubmit={handleSave} className="flex flex-col gap-3 text-xs">
            {/* Nome e Sobrenome */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold">Nome *</Label>
                <Input
                  required
                  disabled={!canManage}
                  placeholder="Ex: Carlos"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold">Sobrenome *</Label>
                <Input
                  required
                  disabled={!canManage}
                  placeholder="Ex: da Silva"
                  value={formSobrenome}
                  onChange={(e) => setFormSobrenome(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>

            {/* Documento e Telefone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold">Documento de Identificação *</Label>
                <Input
                  required
                  disabled={!canManage}
                  placeholder="Ex: CNH 123456789 / RG / CPF"
                  value={formDocumento}
                  onChange={(e) => setFormDocumento(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Telefone / WhatsApp</Label>
                <Input
                  disabled={!canManage}
                  placeholder="(31) 99999-9999"
                  value={formTelefone}
                  onChange={(e) => setFormTelefone(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>

            {/* Categoria, Veículo e Placa */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-semibold">Categoria *</Label>
                <Select
                  disabled={!canManage}
                  value={formCategoria}
                  onValueChange={(val: VeiculoCategoria) => setFormCategoria(val)}
                >
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEICULO_CATEGORIAS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.id === "moto" ? "🏍️ Moto" : "🚗 Carro"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs">Veículo</Label>
                <Input
                  disabled={!canManage}
                  placeholder="Ex: CG 160 / Kangoo"
                  value={formModelo}
                  onChange={(e) => setFormModelo(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs">Placa</Label>
                <Input
                  disabled={!canManage}
                  placeholder="ABC-1234 / ABC1D23"
                  value={formPlaca}
                  onChange={(e) => setFormPlaca(e.target.value.toUpperCase())}
                  onBlur={() => {
                    if (formPlaca.trim() && isValidBrazilianPlate(formPlaca)) {
                      setFormPlaca(normalizeBrazilianPlate(formPlaca));
                    }
                  }}
                  maxLength={8}
                  className={`h-8 text-xs font-mono bg-background uppercase ${
                    isPlateInvalid ? "border-red-500 focus-visible:ring-red-500" : ""
                  }`}
                />
              </div>
            </div>

            {isPlateInvalid && (
              <p className="text-[11px] text-red-400 flex items-center gap-1 -mt-1">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                Formato de placa inválido. Aceito: antigo (ABC-1234) ou Mercosul (ABC1D23).
              </p>
            )}

            {/* OBS */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs">OBS</Label>
              <Textarea
                disabled={!canManage}
                placeholder="Observações sobre turno, baú, restrições ou contato..."
                value={formObservacoes}
                onChange={(e) => setFormObservacoes(e.target.value)}
                className="h-16 text-xs bg-background resize-none"
              />
            </div>

            {/* Vínculo opcional com usuário (preparado para login na Fase 5) */}
            <div className="flex flex-col gap-1 pt-1 border-t border-border/50">
              <Label className="text-xs">Vincular Login do Sistema (opcional · Fase 5)</Label>
              <Select
                disabled={!canManage}
                value={formUserId || "manual"}
                onValueChange={(val) => {
                  if (val === "manual") {
                    setFormUserId("");
                  } else {
                    handleSelectProfile(val);
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="Sem vínculo de login no momento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Sem login vinculado (criar acesso depois)</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Ativo */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border">
              <div className="flex flex-col">
                <span className="font-semibold text-foreground">Entregador Ativo</span>
                <span className="text-[10px] text-muted-foreground">
                  Inativos ficam ocultos das seleções de rota, preservando o histórico.
                </span>
              </div>
              <Switch
                disabled={!canManage}
                checked={formAtivo}
                onCheckedChange={setFormAtivo}
              />
            </div>

            {canManage && (
              <div className="pt-1 flex justify-end gap-2">
                <Button
                  type="submit"
                  disabled={saving || isPlateInvalid}
                  className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Salvando..." : isEditing ? "Salvar Alterações" : "Cadastrar Entregador"}
                </Button>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* CONFIRMAÇÃO DE EXCLUSÃO LÓGICA (INATIVAÇÃO) */}
      <AlertDialog
        open={!!driverToInactivate}
        onOpenChange={(open) => !open && setDriverToInactivate(null)}
      >
        <AlertDialogContent className="bg-card border-border shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Trash2 className="h-4 w-4 text-destructive" />
              Excluir (Inativar) Entregador?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Tem certeza que deseja excluir{" "}
              <strong className="text-foreground">
                {driverToInactivate?.nome_completo} {driverToInactivate?.sobrenome || ""}
              </strong>{" "}
              das listas ativas?
              <br />
              O entregador será <strong>inativado</strong> (não aparecerá mais nas seleções de novas rotas), mas o histórico de entregas e rotas antigas continuará exibindo o nome dele normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={inactivating} className="text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmInactivate}
              disabled={inactivating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs"
            >
              {inactivating ? "Inativando..." : "Sim, Inativar Entregador"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
