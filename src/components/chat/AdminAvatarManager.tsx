import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ChatAvatar } from "@/types/chat";
import {
  fetchAvatarLibrary,
  createAvatarInLibrary,
  createMultipleAvatarsInLibrary,
  toggleAvatarStatus,
  deleteAvatarFromLibrary,
  uploadAvatarImage,
  DEFAULT_OFFICIAL_AVATARS,
} from "@/lib/chatService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  Sparkles,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Image as ImageIcon,
  Check,
  AlertCircle,
  ShieldCheck,
  X,
  FileCheck,
} from "lucide-react";
import { toast } from "sonner";

export function AdminAvatarManager() {
  const { user, isAdmin, role } = useAuth();
  const canManage = isAdmin || role === "coordenador";

  const [avatars, setAvatars] = useState<ChatAvatar[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Formulário de novo avatar / lote
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("oficial");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setCreateDialogOpen(false);
    setNewName("");
    setImageUrlInput("");
    setUploadFiles([]);
    setFilePreviews([]);
    setUploadProgress(null);
  };

  const loadAvatars = async () => {
    setLoading(true);
    try {
      const list = await fetchAvatarLibrary(true);
      setAvatars(list);
    } catch (err) {
      console.error("Erro ao carregar avatares:", err);
      toast.error("Erro ao carregar lista de avatares");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAvatars();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files || []);
    const validImages = rawFiles.filter((f) => f.type.startsWith("image/"));
    if (validImages.length === 0 && rawFiles.length > 0) {
      toast.error("Por favor, selecione arquivos de imagem válidos (PNG, JPG, SVG, WebP)");
      return;
    }
    setUploadFiles((prev) => [...prev, ...validImages]);
    const newPreviews = validImages.map((f) => URL.createObjectURL(f));
    setFilePreviews((prev) => [...prev, ...newPreviews]);
  };

  const handleRemoveFile = (index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!canManage) {
      toast.error("Permissão negada. Apenas administradores e coordenadores podem gerenciar avatares.");
      return;
    }

    // 1. Arquivos selecionados para upload em lote
    if (uploadFiles.length > 0) {
      setIsSubmitting(true);
      try {
        if (uploadFiles.length === 1 && newName.trim()) {
          const uploadResult = await uploadAvatarImage(uploadFiles[0]);
          if (!uploadResult.success || !uploadResult.publicUrl) {
            toast.error(uploadResult.error || "Falha ao enviar arquivo de imagem");
            setIsSubmitting(false);
            return;
          }
          const res = await createAvatarInLibrary(
            newName.trim(),
            uploadResult.publicUrl,
            newCategory,
            user?.id
          );
          if (res.success) {
            toast.success("Avatar cadastrado com sucesso!");
            resetForm();
            await loadAvatars();
          } else {
            toast.error(res.error || "Falha ao cadastrar avatar");
          }
        } else {
          const result = await createMultipleAvatarsInLibrary(
            uploadFiles,
            newCategory,
            user?.id,
            (current, total) => setUploadProgress({ current, total })
          );
          if (result.success) {
            toast.success(
              result.createdCount > 1
                ? `${result.createdCount} novos avatares importados com sucesso!`
                : "Avatar cadastrado com sucesso!"
            );
            resetForm();
            await loadAvatars();
          } else {
            toast.error(result.errors[0] || "Falha ao enviar avatares");
          }
        }
      } catch (err: any) {
        toast.error(err.message || "Erro inesperado");
      } finally {
        setIsSubmitting(false);
        setUploadProgress(null);
      }
      return;
    }

    // 2. URLs diretas (uma ou múltiplas separadas por vírgula ou quebra de linha)
    const rawUrls = imageUrlInput
      .split(/[\n,]/)
      .map((u) => u.trim())
      .filter(Boolean);

    if (rawUrls.length === 0) {
      toast.error("Selecione um ou mais arquivos de imagem ou informe a URL");
      return;
    }

    setIsSubmitting(true);
    try {
      if (rawUrls.length === 1) {
        const res = await createAvatarInLibrary(
          newName.trim() || undefined,
          rawUrls[0],
          newCategory,
          user?.id
        );
        if (res.success) {
          toast.success("Avatar cadastrado com sucesso!");
          resetForm();
          await loadAvatars();
        } else {
          toast.error(res.error || "Falha ao cadastrar avatar");
        }
      } else {
        let created = 0;
        for (let i = 0; i < rawUrls.length; i++) {
          const url = rawUrls[i];
          const autoName =
            url.split("/").pop()?.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ") ||
            `Avatar Primacor ${i + 1}`;
          const res = await createAvatarInLibrary(autoName, url, newCategory, user?.id);
          if (res.success) created++;
        }
        if (created > 0) {
          toast.success(`${created} avatares cadastrados com sucesso!`);
          resetForm();
          await loadAvatars();
        } else {
          toast.error("Falha ao cadastrar avatares via URL");
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (avatar: ChatAvatar, nextActive: boolean) => {
    if (!canManage) {
      toast.error("Apenas administradores e coordenadores podem alterar status de avatares.");
      return;
    }

    // Otimista
    setAvatars((prev) =>
      prev.map((a) => (a.id === avatar.id ? { ...a, is_active: nextActive } : a))
    );

    const res = await toggleAvatarStatus(avatar.id, nextActive);
    if (!res.success) {
      toast.error("Falha ao atualizar status do avatar");
      // Reverter
      setAvatars((prev) =>
        prev.map((a) => (a.id === avatar.id ? { ...a, is_active: avatar.is_active } : a))
      );
    } else {
      toast.success(nextActive ? "Avatar ativado para todos" : "Avatar desativado da biblioteca");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId || !canManage) return;

    const res = await deleteAvatarFromLibrary(deleteConfirmId);
    if (res.success) {
      toast.success("Avatar removido/desativado com sucesso");
      setDeleteConfirmId(null);
      await loadAvatars();
    } else {
      toast.error(res.error || "Falha ao excluir avatar");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com Ações */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#253745] border border-[#4A5C6A] text-[#CCD0CF]">
            <Sparkles className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground tracking-tight">
                Biblioteca Oficial de Avatares
              </h2>
              <Badge className="bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-mono-tech flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                Admin & Coordenador
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gerencie, publique e ative avatares oficiais para os colaboradores do Primacor Kaban.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAvatars}
            disabled={loading}
            className="h-9 border-border text-foreground hover:bg-accent text-xs font-mono-tech"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          {canManage && (
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              className="h-9 bg-[#CCD0CF] hover:bg-white text-[#06141B] text-xs font-bold font-mono-tech rounded-xl shadow-md gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Novo Avatar
            </Button>
          )}
        </div>
      </div>

      {/* Grid de Avatares */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2">
          <RefreshCw className="h-6 w-6 animate-spin text-[#CCD0CF]" />
          <span className="text-xs font-mono-tech">Carregando avatares...</span>
        </div>
      ) : avatars.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-border rounded-2xl bg-card/40">
          <ImageIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm font-semibold text-foreground">Nenhum avatar cadastrado</p>
          <p className="text-xs text-muted-foreground mt-1">
            Cadastre os avatares oficiais acima para disponibilizá-los a todos os usuários.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {avatars.map((avatar) => (
            <div
              key={avatar.id}
              className={`p-4 rounded-2xl border transition-all bg-card/80 backdrop-blur-sm flex flex-col justify-between ${
                avatar.is_active
                  ? "border-border shadow-sm hover:border-[#4A5C6A]"
                  : "border-border/40 opacity-60 bg-muted/20"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="relative">
                    <img
                      src={avatar.image_url}
                      alt={avatar.name}
                      className="w-16 h-16 rounded-2xl object-cover border border-[#4A5C6A]/60 shadow-md bg-muted"
                    />
                    {avatar.is_active && (
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-card" />
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono-tech uppercase border-border/70"
                    >
                      {avatar.category}
                    </Badge>
                    <span
                      className={`text-[10px] font-bold font-mono-tech ${
                        avatar.is_active ? "text-emerald-400" : "text-muted-foreground"
                      }`}
                    >
                      {avatar.is_active ? "ATIVO" : "INATIVO"}
                    </span>
                  </div>
                </div>

                <h3
                  className="text-sm font-bold text-foreground leading-snug break-words line-clamp-2 sm:line-clamp-3"
                  title={avatar.name}
                >
                  {avatar.name}
                </h3>
                <p className="text-[10px] text-muted-foreground font-mono-tech truncate mt-0.5">
                  {avatar.image_url}
                </p>
              </div>

              {/* Controles de Admin/Coordenador */}
              <div className="pt-4 mt-4 border-t border-border flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={avatar.is_active}
                    disabled={!canManage}
                    onCheckedChange={(checked) => handleToggleStatus(avatar, checked)}
                    id={`switch-${avatar.id}`}
                  />
                  <Label
                    htmlFor={`switch-${avatar.id}`}
                    className="text-xs text-muted-foreground cursor-pointer font-mono-tech select-none"
                  >
                    Disponível
                  </Label>
                </div>

                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirmId(avatar.id)}
                    className="h-7 w-7 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-lg"
                    title="Excluir ou desativar avatar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Diálogo de Cadastro de Novo Avatar / Lote */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          setCreateDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md bg-card border-border text-foreground rounded-2xl shadow-2xl p-6">
          <DialogHeader className="space-y-1.5 pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#253745] border border-[#4A5C6A] text-[#CCD0CF]">
                <Plus className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Cadastrar Novos Avatares
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Importe uma ou várias imagens para a biblioteca oficial. O nome não é obrigatório.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Upload de Imagens em Lote */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">
                  Arquivos de Imagem (PNG, JPG, SVG, WebP)
                </Label>
                {uploadFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setUploadFiles([]);
                      setFilePreviews([]);
                    }}
                    className="text-[10px] text-muted-foreground hover:text-rose-400 font-mono-tech"
                  >
                    Limpar todos ({uploadFiles.length})
                  </button>
                )}
              </div>

              <label className="block cursor-pointer">
                <div className="border border-dashed border-border hover:border-sky-400 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 bg-muted/20 hover:bg-muted/40 transition-all text-xs text-muted-foreground hover:text-foreground text-center">
                  <Upload className="h-5 w-5 text-sky-400" />
                  <span className="font-semibold text-foreground">
                    Clique ou arraste imagens aqui
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Você pode selecionar <strong>múltiplos arquivos</strong> de uma só vez
                  </span>
                </div>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {/* Grid de Previews com remoção individual */}
              {uploadFiles.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono-tech">
                    <FileCheck className="h-3.5 w-3.5" />
                    <span>{uploadFiles.length} arquivo(s) selecionado(s)</span>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-44 overflow-y-auto p-1.5 border border-border/60 rounded-xl bg-background/50">
                    {uploadFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="relative group rounded-lg overflow-hidden border border-border bg-card aspect-square flex items-center justify-center"
                      >
                        <img
                          src={filePreviews[idx]}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full p-1 opacity-90 hover:opacity-100 hover:scale-110 transition shadow"
                          title="Remover"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                        <span
                          className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-white px-1 truncate text-center"
                          title={file.name}
                        >
                          {file.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Nome Opcional (apenas se 1 arquivo ou se quiser personalizar) */}
            {uploadFiles.length <= 1 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground">
                    Nome do Avatar
                  </Label>
                  <span className="text-[10px] text-muted-foreground font-mono-tech">
                    Opcional
                  </span>
                </div>
                <Input
                  placeholder="Ex: Operador Pré-Impressão (opcional, gerado pelo arquivo)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-9 text-xs bg-muted/40 border-input text-foreground rounded-xl"
                />
              </div>
            )}

            {/* Categoria */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Categoria</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="h-9 text-xs bg-muted/40 border-input rounded-xl text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-popover-foreground">
                  <SelectItem value="oficial">Oficial Primacor</SelectItem>
                  <SelectItem value="pre_impressao">Pré-Impressão</SelectItem>
                  <SelectItem value="producao">Produção / CTP</SelectItem>
                  <SelectItem value="comercial">Comercial</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ou URL Direta */}
            {uploadFiles.length === 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">
                  Ou informe URLs / Caminhos de Imagens
                </Label>
                <Input
                  placeholder="Ex: /avatars/avatar.png (uma por linha ou separadas por vírgula)"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  className="h-9 text-xs bg-muted/40 border-input text-foreground rounded-xl"
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={resetForm}
              disabled={isSubmitting}
              className="text-xs h-9 text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={isSubmitting}
              className="text-xs h-9 font-bold bg-[#CCD0CF] hover:bg-white text-[#06141B] shadow-md px-4"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  {uploadProgress
                    ? `Importando ${uploadProgress.current}/${uploadProgress.total}...`
                    : "Salvando..."}
                </>
              ) : uploadFiles.length > 1 ? (
                `Importar (${uploadFiles.length}) Avatares`
              ) : (
                "Cadastrar Avatar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <AlertDialogContent className="bg-card border-border text-foreground rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir avatar da biblioteca?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-xs">
              Se este avatar estiver vinculado ao perfil de algum usuário, ele será preservado de forma histórica ou desativado com segurança.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDeleteConfirmId(null)}
              className="border-border text-foreground hover:bg-accent rounded-xl text-xs"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold"
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}