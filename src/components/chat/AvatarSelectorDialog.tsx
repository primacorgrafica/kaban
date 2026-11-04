import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ChatAvatar } from "@/types/chat";
import {
  fetchAvatarLibrary,
  updateUserAvatarPreference,
  createAvatarInLibrary,
  createMultipleAvatarsInLibrary,
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
  X,
  FileCheck,
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

  // Estado de criação/importação de novos avatares em lote (Admin / Coordenador)
  const [createOpen, setCreateOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("oficial");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

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

  const handleImportAvatars = async () => {
    if (!canManage) {
      toast.error("Apenas administradores e coordenadores podem adicionar avatares.");
      return;
    }

    // 1. Importação via múltiplos arquivos de imagem selecionados
    if (uploadFiles.length > 0) {
      setIsSubmitting(true);
      try {
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
              : "Avatar importado com sucesso!"
          );
          setCreateOpen(false);
          setUploadFiles([]);
          setFilePreviews([]);
          setImageUrlInput("");
          setUploadProgress(null);
          await loadAvatars();
        } else {
          toast.error(result.errors[0] || "Falha ao importar imagens");
        }
      } catch (err: any) {
        toast.error(err.message || "Erro ao importar avatares");
      } finally {
        setIsSubmitting(false);
        setUploadProgress(null);
      }
      return;
    }

    // 2. Importação via URLs informadas (separadas por linha ou vírgula)
    const urls = imageUrlInput
      .split(/[\n,]/)
      .map((u) => u.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      toast.error("Selecione um ou vários arquivos de imagem para importar");
      return;
    }

    setIsSubmitting(true);
    try {
      let created = 0;
      for (const url of urls) {
        const res = await createAvatarInLibrary(undefined, url, newCategory, user?.id);
        if (res.success) created++;
      }

      if (created > 0) {
        toast.success(
          created > 1
            ? `${created} avatares cadastrados com sucesso!`
            : "Avatar cadastrado com sucesso!"
        );
        setCreateOpen(false);
        setImageUrlInput("");
        await loadAvatars();
      } else {
        toast.error("Falha ao cadastrar avatar via URL");
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
                      title="Importar um ou vários avatares para a biblioteca oficial"
                    >
                      <Plus className="h-3 w-3" />
                      Importar Avatares
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

      {/* Modal de Importação de Avatares (Admin / Coordenador) - Sem exigência de nomes & com suporte a múltiplos arquivos */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground rounded-2xl shadow-2xl p-6 z-[60]">
          <DialogHeader className="space-y-1.5 pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                <Upload className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Importar Novos Avatares
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Selecione um ou vários arquivos de uma só vez (sem necessidade de digitar nomes)
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-3">
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

            {/* Upload de Múltiplos Arquivos */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Arquivos de Imagem (PNG, JPG, SVG, WebP)</span>
                {uploadFiles.length > 0 && (
                  <span className="text-[10px] text-sky-400 font-mono-tech">
                    {uploadFiles.length} {uploadFiles.length === 1 ? "arquivo" : "arquivos"}
                  </span>
                )}
              </Label>

              <label className="block cursor-pointer">
                <div className="border-2 border-dashed border-border hover:border-sky-400 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 bg-muted/20 hover:bg-muted/40 transition-all text-xs text-muted-foreground hover:text-foreground text-center">
                  <div className="p-2.5 rounded-full bg-sky-500/10 text-sky-400">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-bold text-foreground block">
                      Clique para escolher imagens
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Segure Ctrl ou Shift para selecionar múltiplos arquivos
                    </span>
                  </div>
                </div>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {/* Previews dos arquivos selecionados */}
              {filePreviews.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono-tech">
                    <span>SELECIONADOS ({filePreviews.length})</span>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadFiles([]);
                        setFilePreviews([]);
                      }}
                      className="text-rose-400 hover:text-rose-300 text-[10px]"
                    >
                      Limpar todos
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1 border border-border/50 rounded-xl bg-muted/10">
                    {filePreviews.map((preview, idx) => (
                      <div key={idx} className="relative group/thumb aspect-square">
                        <img
                          src={preview}
                          alt="preview"
                          className="w-full h-full object-cover rounded-lg border border-border bg-card"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity shadow-sm"
                          title="Remover este arquivo"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ou URL / Caminho */}
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-semibold text-foreground">
                Ou cole URLs diretas (uma por linha ou separadas por vírgula)
              </Label>
              <Input
                placeholder="Ex: /avatars/avatar1.png, /avatars/avatar2.png"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                className="h-9 text-xs bg-muted/40 border-input text-foreground rounded-xl"
              />
            </div>

            {/* Indicador de progresso do upload */}
            {uploadProgress && (
              <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-400 flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span>
                  Importando {uploadProgress.current} de {uploadProgress.total} avatares...
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCreateOpen(false);
                setUploadFiles([]);
                setFilePreviews([]);
              }}
              disabled={isSubmitting}
              className="text-xs h-9 text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleImportAvatars}
              disabled={isSubmitting || (uploadFiles.length === 0 && !imageUrlInput.trim())}
              className="text-xs h-9 font-bold bg-[#CCD0CF] hover:bg-white text-[#06141B] shadow-md px-4"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> Importando...
                </>
              ) : uploadFiles.length > 1 ? (
                `Importar (${uploadFiles.length}) Avatares`
              ) : (
                "Importar Avatar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}