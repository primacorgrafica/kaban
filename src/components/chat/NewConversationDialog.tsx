import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatUser } from "@/types/chat";
import { Search, UserPlus, Users, MessageSquare, Circle } from "lucide-react";

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: ChatUser[];
  onSelectUser: (user: ChatUser) => void;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  users,
  onSelectUser,
}: NewConversationDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredUsers = useMemo(() => {
    const list = !searchTerm.trim()
      ? users
      : users.filter(
          (u) =>
            u.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (u.role && u.role.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (u.setor && u.setor.toLowerCase().includes(searchTerm.toLowerCase()))
        );

    return [...list].sort((a, b) => {
      if (a.online && !b.online) return -1;
      if (!a.online && b.online) return 1;
      return a.nome.localeCompare(b.nome);
    });
  }, [users, searchTerm]);

  const handleSelect = (user: ChatUser) => {
    onSelectUser(user);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border text-foreground rounded-2xl shadow-2xl p-5">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#253745] border border-[#4A5C6A]/50 text-[#CCD0CF]">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Nova Mensagem Privada
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Selecione um colaborador da Primacor para conversar em privado.
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Search */}
        <div className="relative my-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nome, cargo ou setor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs bg-muted/50 border-input text-foreground placeholder:text-muted-foreground rounded-xl"
            autoFocus
          />
        </div>

        {/* Users List */}
        <div className="max-h-80 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
          {filteredUsers.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Nenhum usuário encontrado com o termo pesquisado.
            </div>
          ) : (
            filteredUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelect(user)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-accent transition-colors text-left group border border-transparent hover:border-border"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <div className="w-9 h-9 rounded-xl bg-[#253745] border border-[#4A5C6A]/60 flex items-center justify-center font-bold text-sm text-[#CCD0CF]">
                      {user.nome.charAt(0).toUpperCase()}
                    </div>
                    {user.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                      <span>{user.nome}</span>
                      {user.online && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono-tech">
                          online
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {user.role && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-mono-tech uppercase">
                          {user.role}
                        </span>
                      )}
                      {user.setor && (
                        <span className="text-[10px] text-muted-foreground">
                          • {user.setor}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="p-1.5 rounded-lg bg-[#253745] text-[#CCD0CF] text-xs flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
