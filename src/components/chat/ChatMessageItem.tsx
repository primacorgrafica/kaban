import { useState } from "react";
import { ChatMessage } from "@/types/chat";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MoreHorizontal,
  Copy,
  Pencil,
  Trash2,
  Check,
  CheckCheck,
  Clock,
  CornerDownRight,
  Smile,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface ChatMessageItemProps {
  message: ChatMessage;
  isMe: boolean;
  onEdit: (messageId: string, newContent: string) => void;
  onDelete: (messageId: string, mode: "for_me" | "for_all") => void;
  onReact: (messageId: string, emoji: string) => void;
  currentUserId: string;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "👏", "✅"];

export function ChatMessageItem({
  message,
  isMe,
  onEdit,
  onDelete,
  onReact,
  currentUserId,
}: ChatMessageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    toast.success("Mensagem copiada para a área de transferência");
  };

  const handleSaveEdit = () => {
    if (!editContent.trim()) return;
    onEdit(message.id, editContent);
    setIsEditing(false);
  };

  const formattedTime = format(new Date(message.created_at), "HH:mm", { locale: ptBR });

  // Agrupamento de reações
  const reactionCounts: Record<string, { count: number; hasReacted: boolean }> = {};
  if (message.reactions) {
    message.reactions.forEach((r) => {
      if (!reactionCounts[r.emoji]) {
        reactionCounts[r.emoji] = { count: 0, hasReacted: false };
      }
      reactionCounts[r.emoji].count += 1;
      if (r.user_id === currentUserId) {
        reactionCounts[r.emoji].hasReacted = true;
      }
    });
  }

  return (
    <div className={`flex flex-col mb-3 group ${isMe ? "items-end" : "items-start"}`}>
      <div className={`flex items-end gap-1.5 max-w-[85%] sm:max-w-[70%] ${isMe ? "flex-row-reverse" : "flex-row"}`}>
        {/* Message Bubble */}
        <div
          className={`relative px-3.5 py-2.5 rounded-2xl text-xs transition-all shadow-sm ${
            message.is_deleted
              ? "bg-slate-900/60 border border-slate-800 text-slate-500 italic"
              : isMe
              ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-br-xs"
              : "bg-slate-800/80 border border-slate-700/60 text-slate-100 rounded-bl-xs"
          }`}
        >
          {/* Edit Mode Inline */}
          {isEditing ? (
            <div className="space-y-2 min-w-[200px]">
              <Input
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="h-8 text-xs bg-slate-950/70 border-cyan-500 text-white"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") setIsEditing(false);
                }}
              />
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                  className="h-6 px-2 text-[10px] text-slate-300 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  className="h-6 px-2 text-[10px] bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold"
                >
                  Salvar
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Message Content */}
              <p className="whitespace-pre-wrap break-words leading-relaxed select-text">
                {message.content}
              </p>

              {/* Footer Meta: Time, Edit, Checkmarks */}
              <div
                className={`flex items-center gap-1 justify-end mt-1 text-[10px] font-mono-tech ${
                  isMe ? "text-cyan-100/70" : "text-slate-400"
                }`}
              >
                {message.is_edited && !message.is_deleted && (
                  <span className="text-[9px] opacity-75">editada</span>
                )}
                <span>{formattedTime}</span>

                {isMe && (
                  <span>
                    {message.status === "sending" ? (
                      <Clock className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <CheckCheck className="h-3 w-3 text-cyan-200" />
                    )}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Action Dropdown Menu & Quick React Trigger */}
        {!message.is_deleted && !isEditing && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={isMe ? "end" : "start"}
                className="bg-slate-900 border-slate-800 text-white min-w-[170px] p-1.5 rounded-xl shadow-xl z-50"
              >
                {/* Quick reactions bar inside menu */}
                <div className="flex items-center justify-between p-1 border-b border-slate-800/80 mb-1">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => onReact(message.id, emoji)}
                      className="text-base p-1 hover:scale-125 transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <DropdownMenuItem
                  onClick={handleCopy}
                  className="text-xs hover:bg-slate-800 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5 mr-2 text-slate-400" /> Copiar texto
                </DropdownMenuItem>

                {isMe && (
                  <DropdownMenuItem
                    onClick={() => {
                      setEditContent(message.content);
                      setIsEditing(true);
                    }}
                    className="text-xs hover:bg-slate-800 cursor-pointer text-cyan-300"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-2 text-cyan-400" /> Editar mensagem
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator className="bg-slate-800" />

                <DropdownMenuItem
                  onClick={() => onDelete(message.id, "for_me")}
                  className="text-xs hover:bg-slate-800 cursor-pointer text-slate-400"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir para mim
                </DropdownMenuItem>

                {isMe && (
                  <DropdownMenuItem
                    onClick={() => onDelete(message.id, "for_all")}
                    className="text-xs hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir para todos
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Reactions Bar Below Bubble */}
      {Object.keys(reactionCounts).length > 0 && (
        <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
          {Object.entries(reactionCounts).map(([emoji, data]) => (
            <button
              key={emoji}
              onClick={() => onReact(message.id, emoji)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition-all ${
                data.hasReacted
                  ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold"
                  : "bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700"
              }`}
            >
              <span>{emoji}</span>
              <span className="font-mono-tech text-[10px]">{data.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
