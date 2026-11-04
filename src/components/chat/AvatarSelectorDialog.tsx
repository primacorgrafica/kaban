import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ChatAvatar } from "@/types/chat";
import {
  fetchAvatarLibrary,
  updateUserAvatarPreference,
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
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, User, RefreshCw } from "lucide-react";
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
  const { user, avatarUrl, updateAvatar, refreshProfile } = useAuth();
  const currentUserId = user?.id || "";

  const [avatars, setAvatars] = useState<ChatAvatar[]>([]);
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(avatarUrl || null);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border text-foreground rounded-2xl shadow-2xl p-6">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border">
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
            <div className="min-w-0">
              <span className="text-xs font-semibold text-foreground block">
                Avatar Selecionado
              </span>
              <span className="text-[11px] text-muted-foreground">
                {selectedAvatarUrl ? "Pronto para salvar no seu perfil" : "Nenhum avatar selecionado"}
              </span>
            </div>
          </div>

          {/* Grid de Avatares */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono-tech text-foreground uppercase tracking-wider">
                Biblioteca Oficial ({avatars.length})
              </span>
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
                          className="w-14 h-14 rounded-xl object-cover shadow-xs group-hover:scale-105 transition-transform"
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

        <DialogFooter className="flex items-center justify-end gap-2 pt-3 border-t border-border">
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
  );
}