import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ChatAvatar } from "@/types/chat";
import {
  fetchAvatarLibrary,
  updateUserAvatarPreference,
  createAvatarInLibrary,
  uploadAvatarImage,
} from "@/lib/chatService";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Check,
  Sparkles,
  User,
  RefreshCw,
  Plus,
  Upload,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

interface AvatarSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAvatarUpdated?: (newAvatarUrl: string) => void;
}

export function AvatarSelectorDialog({
  open,
  onOpenChange,
  onAvatarUpdated,
}: AvatarSelectorDialogProps) {
  const { user, avatarUrl, updateAvatar, refreshProfile, isAdmin, role } = useAuth();
  const currentUserId = user?.id || "";
  const canManage = isAdmin || role === "coordenador";

  const [avatars, setAvatars] = useState<ChatAvatar[]>([]);
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(avatarUrl || null);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Estado de criação de novo avatar (Admin / Coordenador)
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("oficial");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadAvatars = async () => {
    setLoading(true);
    try {
      const list = await fetchAvatarLibrary(false);
      setAvatars(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedAvatarUrl(avatarUrl || null);
      void loadAvatars();
    }
  }, [open, avatarUrl]);

  const handleSelect = (avatar: ChatAvatar) => {
    setSelectedAvatarUrl(avatar.image_url);
    setSelectedAvatarId(avatar.id);
  };

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

  const handleCreateAvatar = async () => {
    if (!canManage) {
      toast.error("Apenas administradores e coordenadores podem adicionar avatares.");
      return;
    }

    if (!newName.trim()) {
      toast.error("Informe um nome para o avatar");
      return;
    }

    setIsSubmitting(true);
    try {
      let finalImageUrl = imageUrlInput.trim();

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
        toast.error("Selecione um arquivo de imagem ou informe a URL");
        setIsSubmitting(false);
        return;
      }

      const res = await createAvatarInLibrary(
        newName,
        finalImageUrl,
        newCategory,
        user?.id
      );

      if (res.success && res.data) {
        toast.success("Novo avatar cadastrado com sucesso!");
        setCreateOpen(false);
        setNewName("");
        setImageUrlInput("");
        setUploadFile(null);
        setFilePreview(null);

        // Atualiza lista e já seleciona o novo avatar automaticamente
        await loadAvatars();
        setSelectedAvatarUrl(res.data.image_url);
        setSelectedAvatarId(res.data.id);
      } else {
        toast.error(res.error || "Falha ao cadastrar avatar");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = async () => {
    if (!currentUserId || !selectedAvatarUrl) {
      toast.error("Selecione um avatar para salvar");
      return;
    }

    setSaving(true);
    try {
      const result = await updateUserAvatarPreference(
        currentUserId,
        selectedAvatarUrl,
        selectedAvatarId
      );

      if (result.success) {
        updateAvatar(selectedAvatarUrl);
        await refreshProfile();
        if (onAvatarUpdated) {
          onAvatarUpdated(selectedAvatarUrl);
        }
        toast.success("Avatar atualizado com sucesso!");
        onOpenChange(false);
      } else {
        toast.error(result.error || "Não foi possível salvar o avatar");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar avatar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md bg-card border-border text-foreground rounded-2xl shadow-2xl p-6">
          <DialogHeader className="space-y-1.5 pb-2 border-b border-border">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#253745] border border-[#4A5C6A] text-[#CCD0CF]">
                  <Sparkles className="h-4 w-4 text-sky-400" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold tracking-tight text-foreground">
                    Escolher Meu Avatar
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Selecione um dos avatares oficiais Primacor para exibir nas conversas
                  </DialogDescription>
                </div>
              </div>

              {canManage && (
                <Badge className="bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-mono-tech shrink-0 hidden sm:flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Admin
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Avatar Atual Preview */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
              <div className="relative shrink-0">
                {selectedAvatarUrl ? (
                  <img
                    src={selectedAvatarUrl}
                    alt="Avatar selecionado"
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-sky-400 shadow-md"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-[#253745] border border-[#4A5C6A] flex items-center justify-center font-bold text-lg text-[#CCD0CF]">
                    <User className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-foreground block">
                  Avatar Selecionado
                </span>
                <span className="text-[11px] text-muted-foreground block truncate">
                  {selectedAvatarUrl ? "Pronto para salvar no seu perfil" : "Nenhum avatar selecionado"}
                </span>
              </div>

              {canManage && (
                <Link
                  to="/usuarios"
                  onClick={() => onOpenChange(false)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-mono-tech flex items-center gap-1 border border-sky-500/30 hover:border-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-xl transition-all"
                  title="Abrir o painel completo de gestão de avatares"
                >
                  <Settings className="h-3 w-3" />
                  <span>Painel</span>
                </Link>
              )}
            </div>

            {/* Grid de Avatares */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono-tech text-foreground uppercase tracking-wider">
                  Biblioteca Oficial ({avatars.length})
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadAvatars}
                    disabled={loading}
                    className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
                    Atualizar
                  </Button>

                  {canManage && (
                    <Button
                      size="sm"
                      onClick={() => setCreateOpen(true)}
                      className="h-6 px-2 text-[10px] font-bold font-mono-tech bg-sky-500 hover:bg-sky-400 text-white rounded-lg shadow-sm flex items-center gap-1"
                      title="Adicionar novo avatar à biblioteca oficial"
                    >
                      <Plus className="h-3 w-3" />
                      Novo Avatar
                    </Button>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Carregando biblioteca...
                </div>
              ) : avatars.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Nenhum avatar disponível na biblioteca no momento.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-64 overflow-y-auto p-1">
                  {avatars.map((avatar) => {
                    const isSelected = selectedAvatarUrl === avatar.image_url;
                    return (
                      <button
                        key={avatar.id}
                        type="button"
                        onClick={() => handleSelect(avatar)}
                        className={`relative flex flex-col items-center p-2 rounded-2xl transition-all border text-left group ${
                          isSelected
                            ? "bg-[#253745] border-sky-400 ring-2 ring-sky-400/40 shadow-md scale-105"
                            : "bg-muted/30 border-border hover:bg-muted/70 hover:border-[#4A5C6A]"
                        }`}
                      >
                        <div className="relative">
                          <img
                            src={avatar.image_url}
                            alt={avatar.name}
                            className="w-14 h-14 rounded-xl object-cover shadow-xs group-hover:scale-105 transition-transform bg-muted"
                          />
                          {isSelected && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-md">
                              <Check className="h-3 w-3 stroke-[3]" />
                            </span>
                          )}
                        </div>
                        <span className="mt-1.5 text-[10px] font-medium text-foreground truncate w-full text-center leading-tight">
                          {avatar.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="text-xs h-9 text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !selectedAvatarUrl}
              className="text-xs h-9 font-bold bg-[#CCD0CF] hover:bg-white text-[#06141B] shadow-md px-4"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> Salvando...
                </>
              ) : (
                "Salvar Meu Avatar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Cadastro Rápido de Novo Avatar (Admin / Coordenador) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground rounded-2xl shadow-2xl p-6 z-[60]">
          <DialogHeader className="space-y-1.5 pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                <Plus className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Cadastrar Novo Avatar
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Adicione uma nova ilustração ou foto para disponibilizar a todos
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

            {/* Ou URL / Caminho */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                Ou informe URL / Caminho da Imagem
              </Label>
              <Input
                placeholder="Ex: /avatars/novo-avatar.png ou https://..."
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
              onClick={() => setCreateOpen(false)}
              disabled={isSubmitting}
              className="text-xs h-9 text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateAvatar}
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
    </>
  );
}