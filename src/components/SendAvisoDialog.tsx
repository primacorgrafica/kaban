import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Bell } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SendAvisoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (aviso: { titulo: string; mensagem: string; tipo: string; destinatario_id: string | null }) => Promise<{ error: any } | undefined>;
}

interface UserProfile {
  user_id: string;
  nome: string;
}

export function SendAvisoDialog({ open, onOpenChange, onSend }: SendAvisoDialogProps) {
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [tipo, setTipo] = useState("info");
  const [modo, setModo] = useState<"todos" | "selecionar">("todos");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      supabase.from("profiles").select("user_id, nome").then(({ data }) => {
        if (data) setUsers(data);
      });
    }
  }, [open]);

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(users.map(u => u.user_id)));
    }
  };

  const handleSend = async () => {
    if (!titulo.trim() || !mensagem.trim()) {
      toast.error("Preencha título e mensagem");
      return;
    }
    if (modo === "selecionar" && selectedUsers.size === 0) {
      toast.error("Selecione pelo menos um destinatário");
      return;
    }

    setSending(true);

    if (modo === "todos") {
      const result = await onSend({
        titulo: titulo.trim(),
        mensagem: mensagem.trim(),
        tipo,
        destinatario_id: null,
      });
      if (result?.error) {
        toast.error("Erro ao enviar aviso");
        setSending(false);
        return;
      }
    } else {
      // Send one aviso per selected user
      for (const userId of selectedUsers) {
        const result = await onSend({
          titulo: titulo.trim(),
          mensagem: mensagem.trim(),
          tipo,
          destinatario_id: userId,
        });
        if (result?.error) {
          toast.error("Erro ao enviar aviso");
          setSending(false);
          return;
        }
      }
    }

    setSending(false);
    toast.success("Aviso enviado com sucesso!");
    setTitulo("");
    setMensagem("");
    setTipo("info");
    setModo("todos");
    setSelectedUsers(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Enviar Aviso
          </DialogTitle>
          <DialogDescription>Envie um lembrete ou aviso para os usuários.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Destinatário</Label>
            <Select value={modo} onValueChange={(v) => { setModo(v as "todos" | "selecionar"); setSelectedUsers(new Set()); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">📢 Todos os usuários</SelectItem>
                <SelectItem value="selecionar">👥 Selecionar usuários</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {modo === "selecionar" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  {selectedUsers.size} selecionado(s)
                </Label>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={selectAll}>
                  {selectedUsers.size === users.length ? "Desmarcar todos" : "Selecionar todos"}
                </Button>
              </div>
              <ScrollArea className="h-[140px] rounded-md border p-2">
                <div className="space-y-2">
                  {users.map((u) => (
                    <label key={u.user_id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                      <Checkbox
                        checked={selectedUsers.has(u.user_id)}
                        onCheckedChange={() => toggleUser(u.user_id)}
                      />
                      <span className="text-sm">{u.nome || "Sem nome"}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">ℹ️ Informativo</SelectItem>
                <SelectItem value="urgente">🔴 Urgente</SelectItem>
                <SelectItem value="lembrete">🟡 Lembrete</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Reunião amanhã às 9h"
            />
          </div>

          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Descreva o aviso..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Enviando..." : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
