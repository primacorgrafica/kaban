import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MuralAlerta, MuralAlertaInput, MuralTipo } from "@/types/mural";
import { Megaphone, AlertTriangle, Info, Calendar } from "lucide-react";

interface MuralAlertaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alertaToEdit?: MuralAlerta | null;
  onSave: (data: MuralAlertaInput) => Promise<{ success: boolean; error?: string }>;
}

export function MuralAlertaDialog({
  open,
  onOpenChange,
  alertaToEdit,
  onSave,
}: MuralAlertaDialogProps) {
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [tipo, setTipo] = useState<MuralTipo>("urgente");
  const [ativo, setAtivo] = useState(true);
  const [dataPublicacao, setDataPublicacao] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (alertaToEdit) {
      setTitulo(alertaToEdit.titulo);
      setMensagem(alertaToEdit.mensagem);
      setTipo(alertaToEdit.tipo || "urgente");
      setAtivo(alertaToEdit.ativo);
      setDataPublicacao(
        alertaToEdit.created_at
          ? new Date(alertaToEdit.created_at).toISOString().slice(0, 16)
          : new Date().toISOString().slice(0, 16)
      );
    } else {
      setTitulo("");
      setMensagem("");
      setTipo("urgente");
      setAtivo(true);
      setDataPublicacao(new Date().toISOString().slice(0, 16));
    }
  }, [alertaToEdit, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !mensagem.trim()) return;

    setSubmitting(true);
    try {
      const res = await onSave({
        titulo: titulo.trim(),
        mensagem: mensagem.trim(),
        tipo,
        ativo,
        created_at: dataPublicacao ? new Date(dataPublicacao).toISOString() : new Date().toISOString(),
      });
      if (res.success) {
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border shadow-2xl text-foreground">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <span>{alertaToEdit ? "Editar Alerta do Mural" : "Novo Alerta no Mural"}</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Título */}
          <div className="space-y-1.5">
            <Label htmlFor="mural-titulo" className="text-xs font-semibold">
              Título do Alerta <span className="text-red-500">*</span>
            </Label>
            <Input
              id="mural-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Manutenção da Offset 1 às 14h / Prazo Fechamento O.S."
              required
              className="bg-muted/40 border-input text-xs h-9 rounded-xl focus:border-primary"
            />
          </div>

          {/* Mensagem */}
          <div className="space-y-1.5">
            <Label htmlFor="mural-mensagem" className="text-xs font-semibold">
              Mensagem Detalhada <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="mural-mensagem"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Escreva as instruções ou orientações para a equipe..."
              rows={4}
              required
              className="bg-muted/40 border-input text-xs rounded-xl focus:border-primary resize-y"
            />
          </div>

          {/* Tipo e Data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nível de Importância</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as MuralTipo)}>
                <SelectTrigger className="bg-muted/40 border-input text-xs h-9 rounded-xl">
                  <SelectValue placeholder="Selecione o nível" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="urgente" className="text-xs">
                    <span className="flex items-center gap-2 text-red-500 font-bold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Urgente / Destaque</span>
                    </span>
                  </SelectItem>
                  <SelectItem value="importante" className="text-xs">
                    <span className="flex items-center gap-2 text-amber-500 font-bold">
                      <Megaphone className="h-3.5 w-3.5" />
                      <span>Importante</span>
                    </span>
                  </SelectItem>
                  <SelectItem value="info" className="text-xs">
                    <span className="flex items-center gap-2 text-sky-400 font-bold">
                      <Info className="h-3.5 w-3.5" />
                      <span>Informativo</span>
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mural-data" className="text-xs font-semibold">
                Data de Publicação
              </Label>
              <Input
                id="mural-data"
                type="datetime-local"
                value={dataPublicacao}
                onChange={(e) => setDataPublicacao(e.target.value)}
                className="bg-muted/40 border-input text-xs h-9 rounded-xl"
              />
            </div>
          </div>

          {/* Ativo */}
          <div className="flex items-center space-x-2 pt-1 bg-muted/20 p-2.5 rounded-xl border border-border/40">
            <Checkbox
              id="mural-ativo"
              checked={ativo}
              onCheckedChange={(checked) => setAtivo(Boolean(checked))}
            />
            <Label htmlFor="mural-ativo" className="text-xs font-medium cursor-pointer">
              Exibir este alerta no topo das páginas do Kaban (Ativo)
            </Label>
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !titulo.trim() || !mensagem.trim()}
              className="text-xs bg-[#253745] hover:bg-[#324859] text-white"
            >
              {submitting ? "Salvando..." : alertaToEdit ? "Salvar Alterações" : "Publicar Alerta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
