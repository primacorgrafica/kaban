import { useCallback, useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { useOrders } from "@/hooks/useOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MapPin,
  MapPinned,
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LocalidadeComRegional, LocalidadeTipo, Regional } from "@/types/delivery";
import {
  createLocalidade,
  createRegional,
  deleteLocalidade,
  deleteRegional,
  fetchLocalidadesPaginated,
  fetchRegionais,
  updateLocalidade,
  updateRegional,
  type RegionalWithCount,
} from "@/lib/regionaisService";
import {
  RegionalLocalidadeSelector,
  type RegionalLocalidadeSelection,
} from "@/components/regionais/RegionalLocalidadeSelector";

const PAGE_SIZE = 25;

export default function RegionaisLocalidadesPage() {
  const { authReady, user } = useAuth();
  const permissions = usePermissions();
  const { activeOrders, archivedOrders, loading: ordersLoading } = useOrders();

  const [regionais, setRegionais] = useState<RegionalWithCount[]>([]);
  const [selectedRegionalId, setSelectedRegionalId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [localidades, setLocalidades] = useState<LocalidadeComRegional[]>([]);
  const [totalLocalidades, setTotalLocalidades] = useState(0);
  const [loadingRegionais, setLoadingRegionais] = useState(true);
  const [loadingLocalidades, setLoadingLocalidades] = useState(true);
  const [missingTable, setMissingTable] = useState(false);

  // Preview do seletor inteligente
  const [selectorPreview, setSelectorPreview] = useState<RegionalLocalidadeSelection>({
    regionalId: null,
    regionalNome: null,
    localidadeId: null,
    localidadeNome: null,
  });

  // Modais Regional
  const [regionalDialogOpen, setRegionalDialogOpen] = useState(false);
  const [editingRegional, setEditingRegional] = useState<Regional | null>(null);
  const [regionalNome, setRegionalNome] = useState("");
  const [regionalOrdem, setRegionalOrdem] = useState("19");
  const [regionalAtivo, setRegionalAtivo] = useState(true);
  const [savingRegional, setSavingRegional] = useState(false);

  // Modais Localidade
  const [localidadeDialogOpen, setLocalidadeDialogOpen] = useState(false);
  const [editingLocalidade, setEditingLocalidade] = useState<LocalidadeComRegional | null>(null);
  const [locRegionalId, setLocRegionalId] = useState("");
  const [locNome, setLocNome] = useState("");
  const [locTipo, setLocTipo] = useState<LocalidadeTipo>("bairro");
  const [locAtivo, setLocAtivo] = useState(true);
  const [savingLocalidade, setSavingLocalidade] = useState(false);

  // Confirmação de exclusão
  const [confirmDelete, setConfirmDelete] = useState<{
    type: "regional" | "localidade";
    id: string;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Debounce na busca de localidades
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadRegionais = useCallback(async () => {
    setLoadingRegionais(true);
    const res = await fetchRegionais(true);
    if (res.missingTable) {
      setMissingTable(true);
    } else if (res.error) {
      toast.error(res.error);
    } else {
      setMissingTable(false);
    }
    setRegionais(res.data || []);
    setLoadingRegionais(false);
  }, []);

  const loadLocalidades = useCallback(async () => {
    setLoadingLocalidades(true);
    const res = await fetchLocalidadesPaginated({
      regionalId: selectedRegionalId === "ALL" ? null : selectedRegionalId,
      search: debouncedSearch,
      includeInactive: true,
      page,
      pageSize: PAGE_SIZE,
    });
    if (res.error) {
      if (!missingTable) toast.error(res.error);
    }
    setLocalidades(res.data);
    setTotalLocalidades(res.total);
    setLoadingLocalidades(false);
  }, [selectedRegionalId, debouncedSearch, page, missingTable]);

  useEffect(() => {
    if (!authReady || !user) return;
    void loadRegionais();
  }, [authReady, user, loadRegionais]);

  useEffect(() => {
    if (!authReady || !user) return;
    void loadLocalidades();
  }, [authReady, user, loadLocalidades]);

  const totalPages = Math.max(1, Math.ceil(totalLocalidades / PAGE_SIZE));
  const totalCountAll = useMemo(
    () => regionais.reduce((acc, r) => acc + (r.localidades_count || 0), 0),
    [regionais]
  );

  // Handlers Regional
  const openCreateRegional = () => {
    setEditingRegional(null);
    setRegionalNome("");
    setRegionalOrdem(String(regionais.length + 1));
    setRegionalAtivo(true);
    setRegionalDialogOpen(true);
  };

  const openEditRegional = (reg: Regional) => {
    setEditingRegional(reg);
    setRegionalNome(reg.nome);
    setRegionalOrdem(String(reg.ordem));
    setRegionalAtivo(reg.ativo);
    setRegionalDialogOpen(true);
  };

  const handleSaveRegional = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRegional(true);
    const ordemNum = Number(regionalOrdem) || 99;
    const res = editingRegional
      ? await updateRegional(editingRegional.id, {
          nome: regionalNome,
          ordem: ordemNum,
          ativo: regionalAtivo,
        })
      : await createRegional({
          nome: regionalNome,
          ordem: ordemNum,
          ativo: regionalAtivo,
        });
    setSavingRegional(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    toast.success(
      editingRegional ? "Regional atualizada com sucesso!" : "Nova regional cadastrada!"
    );
    setRegionalDialogOpen(false);
    void loadRegionais();
    void loadLocalidades();
  };

  const handleToggleRegionalAtivo = async (reg: RegionalWithCount) => {
    const res = await updateRegional(reg.id, { ativo: !reg.ativo });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(reg.ativo ? `Regional ${reg.nome} desativada.` : `Regional ${reg.nome} ativada.`);
    void loadRegionais();
  };

  // Handlers Localidade
  const openCreateLocalidade = () => {
    setEditingLocalidade(null);
    setLocRegionalId(
      selectedRegionalId !== "ALL"
        ? selectedRegionalId
        : regionais[0]?.id || ""
    );
    setLocNome("");
    setLocTipo("bairro");
    setLocAtivo(true);
    setLocalidadeDialogOpen(true);
  };

  const openEditLocalidade = (loc: LocalidadeComRegional) => {
    setEditingLocalidade(loc);
    setLocRegionalId(loc.regional_id);
    setLocNome(loc.nome);
    setLocTipo(loc.tipo);
    setLocAtivo(loc.ativo);
    setLocalidadeDialogOpen(true);
  };

  const handleSaveLocalidade = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLocalidade(true);
    const res = editingLocalidade
      ? await updateLocalidade(editingLocalidade.id, {
          regional_id: locRegionalId,
          nome: locNome,
          tipo: locTipo,
          ativo: locAtivo,
        })
      : await createLocalidade({
          regional_id: locRegionalId,
          nome: locNome,
          tipo: locTipo,
          ativo: locAtivo,
        });
    setSavingLocalidade(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    toast.success(
      editingLocalidade
        ? "Localidade atualizada com sucesso!"
        : "Nova localidade adicionada!"
    );
    setLocalidadeDialogOpen(false);
    void loadRegionais();
    void loadLocalidades();
  };

  const handleToggleLocalidadeAtivo = async (loc: LocalidadeComRegional) => {
    const res = await updateLocalidade(loc.id, { ativo: !loc.ativo });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(loc.ativo ? `${loc.nome} desativada.` : `${loc.nome} ativada.`);
    void loadLocalidades();
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const res =
      confirmDelete.type === "regional"
        ? await deleteRegional(confirmDelete.id)
        : await deleteLocalidade(confirmDelete.id);
    setDeleting(false);

    if (!res.success) {
      toast.error(res.error || "Erro ao excluir registro.");
      return;
    }

    toast.success(`"${confirmDelete.label}" excluído com sucesso.`);
    if (confirmDelete.type === "regional" && selectedRegionalId === confirmDelete.id) {
      setSelectedRegionalId("ALL");
    }
    setConfirmDelete(null);
    void loadRegionais();
    void loadLocalidades();
  };

  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={() => {}}
      activeCount={activeOrders.length}
      archivedCount={archivedOrders.length}
      sectorName="Regionais e Localidades"
      countsLoading={ordersLoading}
      permissions={permissions}
    >
      <div className="flex flex-col gap-4 p-3 sm:p-5">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <MapPinned className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold text-foreground">
                Regionais e Localidades
              </h1>
              <Badge variant="secondary" className="text-xs">
                {regionais.length} regionais · {totalCountAll} localidades
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cadastro estruturado de regionais, bairros e cidades para atendimento, filtros e entregas.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={openCreateRegional}
              disabled={missingTable}
            >
              <Plus className="h-3.5 w-3.5" />
              Nova Regional
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={openCreateLocalidade}
              disabled={missingTable || regionais.length === 0}
            >
              <MapPin className="h-3.5 w-3.5" />
              Nova Localidade
            </Button>
          </div>
        </div>

        {/* Aviso caso migration ainda não aplicada */}
        {missingTable && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2.5 text-xs text-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Migration pendente no Supabase</p>
              <p className="text-muted-foreground mt-0.5">
                Execute o arquivo{" "}
                <code className="text-amber-300 font-mono">
                  supabase/migrations/20261125_fase2_regionais_localidades_e_gestao_entregas.sql
                </code>{" "}
                no SQL Editor do Supabase para criar e popular as 18 regionais e 287 localidades.
              </p>
            </div>
          </div>
        )}

        {/* Seletor Inteligente de Localização (Teste e Uso Rápido) */}
        <div className="rounded-lg border border-border bg-card/70 p-3 sm:p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">
                Seletor Inteligente de Localização (Regional → Bairro/Cidade)
              </span>
            </div>
            {selectorPreview.regionalId && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  regional_id: {selectorPreview.regionalId.slice(0, 8)}...
                  {selectorPreview.localidadeId
                    ? ` | localidade_id: ${selectorPreview.localidadeId.slice(0, 8)}...`
                    : ""}
                </span>
              </div>
            )}
          </div>
          <RegionalLocalidadeSelector
            regionalId={selectorPreview.regionalId}
            localidadeId={selectorPreview.localidadeId}
            onChange={setSelectorPreview}
            regionaisCache={regionais}
          />
        </div>

        {/* Grid Principal: Lista de Regionais (esquerda) + Localidades paginadas (direita) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Coluna das Regionais */}
          <div className="lg:col-span-5 rounded-lg border border-border bg-card overflow-hidden flex flex-col">
            <div className="px-3 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Regionais ({regionais.length})
              </span>
              {selectedRegionalId !== "ALL" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    setSelectedRegionalId("ALL");
                    setPage(1);
                  }}
                >
                  Ver todas
                </Button>
              )}
            </div>

            <div className="divide-y divide-border max-h-[560px] overflow-y-auto">
              {loadingRegionais ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Carregando regionais...
                </div>
              ) : regionais.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Nenhuma regional encontrada.
                </div>
              ) : (
                regionais.map((reg) => {
                  const isSelected = selectedRegionalId === reg.id;
                  return (
                    <div
                      key={reg.id}
                      onClick={() => {
                        setSelectedRegionalId(isSelected ? "ALL" : reg.id);
                        setPage(1);
                      }}
                      className={cn(
                        "flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/40",
                        isSelected && "bg-primary/10 border-l-2 border-l-primary",
                        !reg.ativo && "opacity-60"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-muted-foreground w-5">
                            {String(reg.ordem).padStart(2, "0")}
                          </span>
                          <span className="text-xs font-semibold text-foreground truncate">
                            {reg.nome}
                          </span>
                          {!reg.ativo && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 text-zinc-400">
                              Inativa
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-1.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Badge variant="secondary" className="text-[11px] font-mono">
                          {reg.localidades_count}
                        </Badge>
                        <Switch
                          checked={reg.ativo}
                          onCheckedChange={() => handleToggleRegionalAtivo(reg)}
                          aria-label={`Ativar ou desativar ${reg.nome}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditRegional(reg)}
                          title="Editar regional"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-500"
                          onClick={() =>
                            setConfirmDelete({ type: "regional", id: reg.id, label: reg.nome })
                          }
                          title="Excluir regional"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Coluna das Localidades */}
          <div className="lg:col-span-7 rounded-lg border border-border bg-card overflow-hidden flex flex-col">
            <div className="p-3 bg-muted/40 border-b border-border flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <div className="relative flex-1">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar bairro ou cidade..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Select
                  value={selectedRegionalId}
                  onValueChange={(v) => {
                    setSelectedRegionalId(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[190px] text-xs">
                    <SelectValue placeholder="Filtrar por regional" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="ALL" className="text-xs">
                      Todas as Regionais
                    </SelectItem>
                    {regionais.map((reg) => (
                      <SelectItem key={reg.id} value={reg.id} className="text-xs">
                        {String(reg.ordem).padStart(2, "0")} — {reg.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <span className="text-[11px] text-muted-foreground">
                {totalLocalidades} registro(s)
              </span>
            </div>

            <div className="overflow-x-auto flex-1">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="text-xs">Localidade</TableHead>
                    <TableHead className="text-xs w-[90px]">Tipo</TableHead>
                    <TableHead className="text-xs">Regional</TableHead>
                    <TableHead className="text-xs w-[75px] text-center">Ativa</TableHead>
                    <TableHead className="text-xs w-[90px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLocalidades ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                        Carregando localidades...
                      </TableCell>
                    </TableRow>
                  ) : localidades.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                        Nenhuma localidade encontrada para os filtros aplicados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    localidades.map((loc) => (
                      <TableRow key={loc.id} className={cn(!loc.ativo && "opacity-60")}>
                        <TableCell className="text-xs font-medium">{loc.nome}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {loc.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {loc.regional?.nome || "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={loc.ativo}
                            onCheckedChange={() => handleToggleLocalidadeAtivo(loc)}
                            aria-label={`Ativar ou desativar ${loc.nome}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => openEditLocalidade(loc)}
                              title="Editar ou mover para outra regional"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-500"
                              onClick={() =>
                                setConfirmDelete({
                                  type: "localidade",
                                  id: loc.id,
                                  label: loc.nome,
                                })
                              }
                              title="Excluir localidade"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="px-3 py-2 border-t border-border bg-muted/20 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Regional */}
      <Dialog open={regionalDialogOpen} onOpenChange={setRegionalDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRegional ? "Editar Regional" : "Nova Regional"}</DialogTitle>
            <DialogDescription className="text-xs">
              Defina o nome e ordem de exibição da regional no cadastro administrativo.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveRegional} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome da Regional *</Label>
              <Input
                required
                value={regionalNome}
                onChange={(e) => setRegionalNome(e.target.value)}
                placeholder="Ex.: CENTRO-SUL"
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Ordem</Label>
                <Input
                  type="number"
                  min={1}
                  value={regionalOrdem}
                  onChange={(e) => setRegionalOrdem(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Switch checked={regionalAtivo} onCheckedChange={setRegionalAtivo} />
                <Label className="text-xs">Regional ativa</Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRegionalDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={savingRegional}>
                {savingRegional ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Localidade */}
      <Dialog open={localidadeDialogOpen} onOpenChange={setLocalidadeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLocalidade ? "Editar Localidade" : "Nova Localidade"}</DialogTitle>
            <DialogDescription className="text-xs">
              Vincule um bairro ou cidade a uma regional ativa ou altere sua regional de destino.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveLocalidade} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Regional *</Label>
              <Select value={locRegionalId} onValueChange={setLocRegionalId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecione a regional" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {regionais.map((reg) => (
                    <SelectItem key={reg.id} value={reg.id} className="text-xs">
                      {String(reg.ordem).padStart(2, "0")} — {reg.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome do Bairro ou Cidade *</Label>
              <Input
                required
                value={locNome}
                onChange={(e) => setLocNome(e.target.value)}
                placeholder="Ex.: Savassi"
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Tipo *</Label>
                <Select value={locTipo} onValueChange={(v) => setLocTipo(v as LocalidadeTipo)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bairro" className="text-xs">
                      Bairro
                    </SelectItem>
                    <SelectItem value="cidade" className="text-xs">
                      Cidade
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Switch checked={locAtivo} onCheckedChange={setLocAtivo} />
                <Label className="text-xs">Localidade ativa</Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLocalidadeDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={savingLocalidade}>
                {savingLocalidade ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Exclusão */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Deseja realmente excluir{" "}
              {confirmDelete?.type === "regional" ? "a regional" : "a localidade"}{" "}
              <strong className="text-foreground">{confirmDelete?.label}</strong>?
              {confirmDelete?.type === "regional" &&
                " Todas as localidades vinculadas a ela também serão removidas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? "Excluindo..." : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
