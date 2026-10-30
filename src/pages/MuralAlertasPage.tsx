import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useOrders } from "@/hooks/useOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { useMuralAlertas } from "@/hooks/useMuralAlertas";
import { MuralAlerta, MuralAlertaInput } from "@/types/mural";
import { MuralAlertaDialog } from "@/components/mural/MuralAlertaDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  AlertTriangle,
  Info,
  User,
  CheckCircle2,
  XCircle,
  Eye,
  Radio,
  ChevronDown,
  Check,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function MuralAlertasPage() {
  const { orders, archivedOrders, loading: ordersLoading } = useOrders();
  const permissions = usePermissions();
  const {
    alertas,
    loading: muralLoading,
    canManageMural,
    criarAlerta,
    editarAlerta,
    excluirAlerta,
  } = useMuralAlertas();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [alertaToEdit, setAlertaToEdit] = useState<MuralAlerta | null>(null);
  const [deleteAlertId, setDeleteAlertId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterAtivosOnly, setFilterAtivosOnly] = useState(false);

  const filteredAlertas = useMemo(() => {
    return alertas.filter((a) => {
      if (filterAtivosOnly && !a.ativo) return false;
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        a.titulo.toLowerCase().includes(term) ||
        a.mensagem.toLowerCase().includes(term) ||
        (a.autor_nome && a.autor_nome.toLowerCase().includes(term))
      );
    });
  }, [alertas, search, filterAtivosOnly]);

  const handleOpenNew = () => {
    setAlertaToEdit(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (alerta: MuralAlerta) => {
    setAlertaToEdit(alerta);
    setDialogOpen(true);
  };

  const handleSaveAlerta = async (input: MuralAlertaInput) => {
    if (alertaToEdit) {
      return await editarAlerta(alertaToEdit.id, input);
    } else {
      return await criarAlerta(input);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteAlertId) return;
    await excluirAlerta(deleteAlertId);
    setDeleteAlertId(null);
  };

  const handleToggleAtivo = async (alerta: MuralAlerta) => {
    await editarAlerta(alerta.id, { ativo: !alerta.ativo });
  };

  const handleUpdateTipo = async (alerta: MuralAlerta, novoTipo: MuralTipo) => {
    if (alerta.tipo === novoTipo) return;
    await editarAlerta(alerta.id, { tipo: novoTipo });
  };

  return (
    <Layout
      sectorName="Mural de Alertas"
      permissions={permissions}
      searchQuery={search}
      onSearchChange={setSearch}
      onAddOrder={() => {}}
      activeCount={orders.filter((o) => !o.arquivado).length}
      archivedCount={archivedOrders.length}
      countsLoading={ordersLoading}
    >
      <div className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Cabeçalho da Página */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/80">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500">
                <Megaphone className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                  Mural de Alertas
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Comunicados gerais, avisos diários e orientações operacionais da Primacor
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={filterAtivosOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterAtivosOnly(!filterAtivosOnly)}
              className="text-xs h-9 rounded-xl"
            >
              <Radio className={`h-3.5 w-3.5 mr-1.5 ${filterAtivosOnly ? "text-emerald-400" : "text-muted-foreground"}`} />
              {filterAtivosOnly ? "Exibindo apenas Ativos" : "Todos os Alertas"}
            </Button>

            {canManageMural && (
              <Button
                onClick={handleOpenNew}
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-9 rounded-xl shadow-xs font-bold gap-1.5"
              >
                <Plus className="h-4 w-4" />
                <span>Novo Alerta</span>
              </Button>
            )}
          </div>
        </div>

        {/* Listagem de Alertas */}
        {muralLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-muted-foreground font-mono-tech">
            <span className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Carregando alertas do mural...</span>
          </div>
        ) : filteredAlertas.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-center p-8 rounded-2xl border border-dashed border-border bg-card/40">
            <div className="p-4 rounded-2xl bg-muted/50 text-muted-foreground">
              <Megaphone className="h-8 w-8 opacity-40" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              Nenhum alerta cadastrado no momento
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              {canManageMural
                ? "Clique no botão 'Novo Alerta' acima para cadastrar um comunicado para toda a equipe."
                : "Quando houver avisos operacionais publicados pela coordenação, eles aparecerão aqui e no topo do sistema."}
            </p>
            {canManageMural && (
              <Button
                onClick={handleOpenNew}
                size="sm"
                className="mt-2 text-xs bg-[#253745] hover:bg-[#324859] text-white rounded-xl"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Criar Primeiro Alerta
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAlertas.map((alerta) => {
              const isUrgente = alerta.tipo === "urgente";
              const isImportante = alerta.tipo === "importante";
              const Icon = isUrgente ? AlertTriangle : isImportante ? Megaphone : Info;
              const badgeClass = isUrgente
                ? "bg-red-500/15 text-red-500 dark:text-red-400 border-red-500/40"
                : isImportante
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40"
                : "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/40";

              const borderHighlight = alerta.ativo
                ? isUrgente
                  ? "border-red-500/60 shadow-[0_4px_20px_rgba(239,68,68,0.12)]"
                  : isImportante
                  ? "border-amber-500/60 shadow-[0_4px_20px_rgba(245,158,11,0.12)]"
                  : "border-sky-500/60 shadow-[0_4px_20px_rgba(14,165,233,0.12)]"
                : "border-border/60 opacity-60";

              return (
                <div
                  key={alerta.id}
                  className={`flex flex-col justify-between rounded-2xl border bg-card/80 backdrop-blur-sm p-4 transition-all duration-200 hover:shadow-md ${borderHighlight}`}
                >
                  <div className="space-y-3">
                    {/* Linha superior: Tipo, Status Ativo, Data */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {canManageMural ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider flex items-center gap-1 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-xs ${badgeClass}`}
                                title="Clique para alterar o nível de urgência"
                              >
                                <Icon className="h-3 w-3" />
                                <span>{isUrgente ? "Urgente" : isImportante ? "Importante" : "Informativo"}</span>
                                <ChevronDown className="h-2.5 w-2.5 opacity-60 ml-0.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48 bg-card border-border shadow-2xl">
                              <DropdownMenuItem
                                onClick={() => handleUpdateTipo(alerta, "urgente")}
                                className="text-xs font-bold text-red-500 focus:text-red-500 focus:bg-red-500/10 cursor-pointer flex items-center gap-2"
                              >
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <span>Urgente / Destaque</span>
                                {alerta.tipo === "urgente" && <Check className="h-3.5 w-3.5 ml-auto" />}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleUpdateTipo(alerta, "importante")}
                                className="text-xs font-bold text-amber-500 focus:text-amber-500 focus:bg-amber-500/10 cursor-pointer flex items-center gap-2"
                              >
                                <Megaphone className="h-3.5 w-3.5" />
                                <span>Importante</span>
                                {alerta.tipo === "importante" && <Check className="h-3.5 w-3.5 ml-auto" />}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleUpdateTipo(alerta, "info")}
                                className="text-xs font-bold text-sky-400 focus:text-sky-400 focus:bg-sky-400/10 cursor-pointer flex items-center gap-2"
                              >
                                <Info className="h-3.5 w-3.5" />
                                <span>Informativo</span>
                                {alerta.tipo === "info" && <Check className="h-3.5 w-3.5 ml-auto" />}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider flex items-center gap-1 ${badgeClass}`}>
                            <Icon className="h-3 w-3" />
                            <span>{isUrgente ? "Urgente" : isImportante ? "Importante" : "Informativo"}</span>
                          </span>
                        )}

                        {alerta.ativo ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/40 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                            <span>No Topo</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                            Inativo
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-muted-foreground font-mono-tech flex items-center gap-1 shrink-0">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {format(new Date(alerta.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>

                    {/* Título */}
                    <h3 className="text-sm font-bold text-foreground leading-snug">
                      {alerta.titulo}
                    </h3>

                    {/* Mensagem */}
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4 leading-relaxed bg-muted/20 p-2.5 rounded-xl border border-border/40">
                      {alerta.mensagem}
                    </p>
                  </div>

                  {/* Rodapé com autor e ações */}
                  <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-between gap-2">
                    <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                      <User className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {alerta.autor_nome || "Coordenação"}
                      </span>
                    </div>

                    {canManageMural ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleAtivo(alerta)}
                          className={`h-7 w-7 rounded-lg ${alerta.ativo ? "text-emerald-500 hover:bg-emerald-500/10" : "text-muted-foreground hover:bg-muted"}`}
                          title={alerta.ativo ? "Desativar do topo" : "Ativar no topo"}
                        >
                          {alerta.ativo ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(alerta)}
                          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                          title="Editar alerta"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteAlertId(alerta.id)}
                          className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                          title="Excluir alerta"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground font-mono-tech uppercase">
                        Apenas leitura
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Criação / Edição */}
      {canManageMural && (
        <MuralAlertaDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          alertaToEdit={alertaToEdit}
          onSave={handleSaveAlerta}
        />
      )}

      {/* Confirmação de Exclusão */}
      <AlertDialog open={!!deleteAlertId} onOpenChange={(open) => !open && setDeleteAlertId(null)}>
        <AlertDialogContent className="bg-card border-border shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-foreground">
              Excluir este alerta do mural?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Esta ação removerá o alerta permanentemente do sistema e do topo das telas de todos os usuários.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
            >
              Sim, excluir alerta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
