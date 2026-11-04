import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ChatAvatar } from "@/types/chat";
import {
  fetchAvatarLibrary,
  createAvatarInLibrary,
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
} from "lucide-react";
import { toast } from "sonner";

export function AdminAvatarManager() {
  const { user, isAdmin, role } = useAuth();
  const canManage = isAdmin || role === "coordenador";

  const [avatars, setAvatars] = useState<ChatAvatar[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Formulário de novo avatar
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("oficial");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Por favor, selecione um arquivo de imagem válido (PNG, JPG, SVG, WebP)");
        return;
      }
      setUploadFile(file);
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    }
  };

  const handleCreate = async () => {
    if (!canManage) {
      toast.error("Permissão negada. Apenas administradores e coordenadores podem gerenciar avatares.");
      return;
    }

    if (!newName.trim()) {
      toast.error("Informe o nome do avatar");
      return;
    }

    setIsSubmitting(true);
    try {
      let finalImageUrl = imageUrlInput.trim();

      // Se enviou arquivo, faz upload para o Storage
      if (uploadFile) {
        const uploadResult = await uploadAvatarImage(uploadFile);
        if (!uploadResult.success || !uploadResult.publicUrl) {
          toast.error(uploadResult.error || "Falha ao enviar arquivo de imagem");
          setIsSubmitting(false);
          return;
        }
        finalImageUrl = uploadResult.publicUrl;
      }

      if (!finalImageUrl) {
        toast.error("Selecione um arquivo de imagem ou informe a URL da imagem");
        setIsSubmitting(false);
        return;
      }

      const res = await createAvatarInLibrary(
        newName,
        finalImageUrl,
        newCategory,
        user?.id
      );

      if (res.success) {
        toast.success("Avatar cadastrado com sucesso!");
        setCreateDialogOpen(false);
        setNewName("");
        setImageUrlInput("");
        setUploadFile(null);
        setFilePreview(null);
        await loadAvatars();
      } else {
        toast.error(res.error || "Falha ao cadastrar avatar");
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

                <h3 className="text-sm font-bold text-foreground leading-snug truncate" title={avatar.name}>
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

      {/* Diálogo de Cadastro de Novo Avatar */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground rounded-2xl shadow-2xl p-6">
          <DialogHeader className="space-y-1.5 pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#253745] border border-[#4A5C6A] text-[#CCD0CF]">
                <Plus className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Cadastrar Novo Avatar
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Adicione uma nova ilustração ou foto à biblioteca oficial
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                Nome do Avatar <span className="text-rose-400">*</span>
              </Label>
              <Input
                placeholder="Ex: Operador Pré-Impressão (Verde)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9 text-xs bg-muted/40 border-input text-foreground rounded-xl"
              />
            </div>

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

            {/* Upload de Imagem */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">
                Arquivo de Imagem (PNG, JPG, SVG)
              </Label>
              <div className="flex items-center gap-3">
                <label className="flex-1 cursor-pointer">
                  <div className="border border-dashed border-border hover:border-[#4A5C6A] rounded-xl p-3 flex items-center justify-center gap-2 bg-muted/20 hover:bg-muted/40 transition-all text-xs text-muted-foreground hover:text-foreground">
                    <Upload className="h-4 w-4 text-sky-400" />
                    <span>{uploadFile ? uploadFile.name : "Selecionar arquivo..."}</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>

                {/* Preview */}
                {(filePreview || imageUrlInput) && (
                  <img
                    src={filePreview || imageUrlInput}
                    alt="Preview"
                    className="w-12 h-12 rounded-xl object-cover border border-sky-400 shadow-sm shrink-0"
                  />
                )}
              </div>
            </div>

            {/* Ou URL Direta */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                Ou informe URL / Caminho da Imagem
              </Label>
              <Input
                placeholder="Ex: /avatars/avatar-operador-azul.png ou https://..."
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                className="h-9 text-xs bg-muted/40 border-input text-foreground rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateDialogOpen(false)}
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
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> Salvando...
                </>
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