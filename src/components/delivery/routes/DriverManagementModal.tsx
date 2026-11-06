import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  Bike,
  Car,
  UserPlus,
  Edit2,
  Phone,
  CreditCard,
  CheckCircle2,
  XCircle,
  Plus,
  Save,
  RotateCcw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getEntregadoresList,
  saveEntregador,
  toggleEntregadorAtivo,
} from "@/lib/deliveryService";
import type { Entregador, VeiculoCategoria } from "@/types/delivery";

interface DriverManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDriversUpdated?: () => void;
}

interface ProfileItem {
  user_id: string;
  nome: string;
}

export function DriverManagementModal({
  open,
  onOpenChange,
  onDriversUpdated,
}: DriverManagementModalProps) {
  const [drivers, setDrivers] = useState<Entregador[]>([]);
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Form State
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

  // Load drivers & profiles when modal opens
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
    } catch (err: any) {
      console.error("[DriverManagementModal] Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadData();
      resetForm();
    }
  }, [open]);

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
    setIsEditing(true);
    setEditingId(driver.id);
    setFormUserId(driver.user_id);
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome.trim()) {
      toast.error("Informe o nome do entregador.");
      return;
    }

    setSaving(true);
    try {
      // Se não houver formUserId, gera um UUID novo para esse entregador
      const targetUserId = formUserId || crypto.randomUUID();

      const res = await saveEntregador({
        id: editingId || undefined,
        user_id: targetUserId,
        nome_completo: formNome.trim(),
        sobrenome: formSobrenome.trim() || null,
        telefone: formTelefone.trim() || null,
        documento_identificacao: formDocumento.trim() || null,
        categoria_veiculo: formCategoria,
        modelo_veiculo: formModelo.trim() || null,
        placa_veiculo: formPlaca.trim() || null,
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
    const nextStatus = !driver.ativo;
    const res = await toggleEntregadorAtivo(driver.id, nextStatus);
    if (!res.success) {
      toast.error(`Erro ao atualizar status: ${res.error}`);
      return;
    }

    toast.success(
      nextStatus
        ? `Entregador ${driver.nome_completo} agora está ATIVO.`
        : `Entregador ${driver.nome_completo} foi DESATIVADO (histórico preservado).`
    );

    await loadData();
    onDriversUpdated?.();
  };

  const filteredDrivers = drivers.filter((d) => {
    const q = search.toLowerCase();
    return (
      d.nome_completo.toLowerCase().includes(q) ||
      (d.sobrenome || "").toLowerCase().includes(q) ||
      (d.placa_veiculo || "").toLowerCase().includes(q) ||
      (d.telefone || "").includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border shadow-2xl p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Bike className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                Cadastro e Administração de Entregadores
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Cadastre e gerencie a frota de entregadores (Carro ou Moto), documentos e status
                ativo/inativo preservando o histórico de entregas.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4">
          {/* LADO ESQUERDO: LISTA DE ENTREGADORES */}
          <div className="lg:col-span-6 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                Entregadores Cadastrados
                <Badge variant="secondary" className="text-xs font-normal">
                  {drivers.length}
                </Badge>
              </h3>
              {isEditing && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1 text-primary"
                  onClick={resetForm}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Novo Cadastro
                </Button>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, placa ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-muted/40"
              />
            </div>

            <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto pr-1">
              {loading ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  Carregando entregadores...
                </div>
              ) : filteredDrivers.length === 0 ? (
                <div className="text-center py-8 border border-dashed rounded-lg p-4 text-xs text-muted-foreground">
                  Nenhum entregador encontrado. Utilize o formulário ao lado para cadastrar.
                </div>
              ) : (
                filteredDrivers.map((driver) => {
                  const isSelected = editingId === driver.id;
                  const isCar = driver.categoria_veiculo === "carro";

                  return (
                    <div
                      key={driver.id}
                      className={`p-3 rounded-lg border transition-all text-xs flex flex-col gap-2 ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-xs"
                          : driver.ativo
                          ? "border-border bg-card hover:border-border/80"
                          : "border-border/50 bg-muted/30 opacity-70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`p-1.5 rounded-md ${
                              isCar
                                ? "bg-blue-500/10 text-blue-500"
                                : "bg-emerald-500/10 text-emerald-500"
                            }`}
                          >
                            {isCar ? <Car className="h-4 w-4" /> : <Bike className="h-4 w-4" />}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                              {driver.nome_completo} {driver.sobrenome || ""}
                              <Badge
                                variant={driver.ativo ? "default" : "secondary"}
                                className={`text-[10px] px-1.5 py-0 font-normal ${
                                  driver.ativo
                                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                    : "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30"
                                }`}
                              >
                                {driver.ativo ? "Ativo" : "Inativo"}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                              <span>
                                {isCar ? "Carro" : "Moto"}: {driver.modelo_veiculo || "Não inf."}
                              </span>
                              {driver.placa_veiculo && (
                                <span className="font-mono bg-muted px-1 rounded text-[10px] border">
                                  {driver.placa_veiculo}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => startEdit(driver)}
                            title="Editar cadastro"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-border/50 pt-2 text-[11px]">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          {driver.telefone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {driver.telefone}
                            </span>
                          )}
                          {driver.documento_identificacao && (
                            <span className="flex items-center gap-1">
                              <CreditCard className="h-3 w-3" />
                              {driver.documento_identificacao}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">
                            {driver.ativo ? "Desativar" : "Ativar"}
                          </span>
                          <Switch
                            checked={driver.ativo}
                            onCheckedChange={() => handleToggleStatus(driver)}
                            aria-label="Alternar status ativo/inativo"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* LADO DIREITO: FORMULÁRIO DE CADASTRO / EDIÇÃO */}
          <div className="lg:col-span-6 bg-muted/20 border border-border rounded-xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
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

            <form onSubmit={handleSave} className="flex flex-col gap-3.5 text-xs">
              {/* Usuário do Sistema (opcional para vincular login) */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Vincular a Usuário do Kaban (opcional)</Label>
                <Select
                  value={formUserId || "manual"}
                  onValueChange={(val) => {
                    if (val === "manual") {
                      setFormUserId("");
                    } else {
                      handleSelectProfile(val);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs bg-card">
                    <SelectValue placeholder="Selecione um usuário ou crie avulso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Cadastro Avulso (Sem usuário do sistema)</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-muted-foreground">
                  Selecione caso o entregador já possua conta de acesso ao Kaban.
                </span>
              </div>

              {/* Nome e Sobrenome */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-semibold">Nome *</Label>
                  <Input
                    required
                    placeholder="Ex: Carlos"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    className="h-8 text-xs bg-card"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Sobrenome</Label>
                  <Input
                    placeholder="Ex: da Silva"
                    value={formSobrenome}
                    onChange={(e) => setFormSobrenome(e.target.value)}
                    className="h-8 text-xs bg-card"
                  />
                </div>
              </div>

              {/* Telefone e Documento (CNH) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Telefone / WhatsApp</Label>
                  <Input
                    placeholder="(31) 99999-9999"
                    value={formTelefone}
                    onChange={(e) => setFormTelefone(e.target.value)}
                    className="h-8 text-xs bg-card"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">CNH / Documento</Label>
                  <Input
                    placeholder="Ex: CNH 123456789"
                    value={formDocumento}
                    onChange={(e) => setFormDocumento(e.target.value)}
                    className="h-8 text-xs bg-card"
                  />
                </div>
              </div>

              {/* Categoria do Veículo, Modelo e Placa */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-semibold">Categoria *</Label>
                  <Select
                    value={formCategoria}
                    onValueChange={(val: VeiculoCategoria) => setFormCategoria(val)}
                  >
                    <SelectTrigger className="h-8 text-xs bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="moto">🏍️ Moto</SelectItem>
                      <SelectItem value="carro">🚗 Carro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Modelo Veículo</Label>
                  <Input
                    placeholder="Ex: CG 160 / Kangoo"
                    value={formModelo}
                    onChange={(e) => setFormModelo(e.target.value)}
                    className="h-8 text-xs bg-card"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Placa</Label>
                  <Input
                    placeholder="ABC-1234"
                    value={formPlaca}
                    onChange={(e) => setFormPlaca(e.target.value.toUpperCase())}
                    className="h-8 text-xs font-mono bg-card uppercase"
                  />
                </div>
              </div>

              {/* Observações */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Observações Internas</Label>
                <Textarea
                  placeholder="Ex: Disponível no turno da manhã, baú grande..."
                  value={formObservacoes}
                  onChange={(e) => setFormObservacoes(e.target.value)}
                  className="h-16 text-xs bg-card resize-none"
                />
              </div>

              {/* Status Ativo */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-card border">
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">Entregador Ativo</span>
                  <span className="text-[10px] text-muted-foreground">
                    Entregadores inativos não aparecem na seleção de novas rotas.
                  </span>
                </div>
                <Switch checked={formAtivo} onCheckedChange={setFormAtivo} />
              </div>

              {/* Botão de Salvar */}
              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="submit"
                  disabled={saving}
                  className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Salvando..." : isEditing ? "Salvar Alterações" : "Cadastrar Entregador"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
