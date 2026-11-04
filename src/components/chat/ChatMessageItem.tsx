import { useState } from "react";
import { ChatMessage } from "@/types/chat";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, useReducedMotion } from "framer-motion";
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
  CheckCheck,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

interface ChatMessageItemProps {
  message: ChatMessage;
  isMe: boolean;
  onEdit: (messageId: string, newContent: string) => void;
  onDelete: (messageId: string, mode: "for_me" | "for_all") => void;
  onReact: (messageId: string, emoji: string) => void;
  currentUserId: string;
  senderAvatarUrl?: string | null;
  senderName?: string;
  isConsecutive?: boolean;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "👏", "✅"];

export function ChatMessageItem({
  message,
  isMe,
  onEdit,
  onDelete,
  onReact,
  currentUserId,
  senderAvatarUrl,
  senderName,
  isConsecutive = false,
}: ChatMessageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const shouldReduceMotion = useReducedMotion();

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
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className={`flex flex-col group ${isConsecutive ? "mt-1" : "mt-2.5"} ${
        isMe ? "items-end" : "items-start"
      }`}
    >
      <div
        className={`flex items-end gap-2 max-w-[85%] sm:max-w-[72%] ${
          isMe ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {/* Avatar do remetente para mensagens recebidas */}
        {!isMe && (
          <div className="shrink-0 mb-0.5 w-7">
            {!isConsecutive ? (
              senderAvatarUrl ? (
                <img
                  src={senderAvatarUrl}
                  alt={senderName || "Usuário"}
                  className="w-7 h-7 rounded-xl object-cover border border-border/80 shadow-xs bg-muted"
                />
              ) : (
                <div className="w-7 h-7 rounded-xl bg-[#253745] border border-[#4A5C6A]/60 flex items-center justify-center font-bold text-[11px] text-[#CCD0CF] shadow-xs">
                  {(senderName || "U").charAt(0).toUpperCase()}
                </div>
              )
            ) : (
              <div className="w-7" />
            )}
          </div>
        )}

        {/* Message Bubble */}
        <div
          className={`relative px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed transition-all shadow-xs ${
            message.is_deleted
              ? "bg-muted/50 border border-border/70 text-muted-foreground/80 italic text-xs py-2 px-3"
              : isMe
              ? "bg-[#253745] text-[#CCD0CF] border border-[#4A5C6A]/80 rounded-br-xs font-normal"
              : "bg-muted/90 dark:bg-[#11212D] border border-border/80 dark:border-[#253745] text-foreground rounded-bl-xs font-normal"
          }`}
        >
          {/* Edit Mode Inline */}
          {isEditing ? (
            <div className="space-y-2 min-w-[220px]">
              <Input
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="h-8 text-xs bg-background border-[#4A5C6A] text-foreground"
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
                  className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  className="h-6 px-2 text-[10px] bg-[#CCD0CF] hover:bg-white text-[#06141B] font-bold"
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
                className={`flex items-center gap-1.5 justify-end mt-0.5 text-[10px] font-mono-tech select-none ${
                  isMe ? "text-[#CCD0CF]/75" : "text-muted-foreground"
                }`}
              >
                {message.is_edited && !message.is_deleted && (
                  <span className="text-[9px] opacity-75">editada</span>
                )}
                <span className="tabular-nums">{formattedTime}</span>

                {isMe && (
                  <span className="inline-flex items-center ml-0.5">
                    {message.status === "sending" ? (
                      <Clock
                        className="h-2.5 w-2.5 animate-spin text-muted-foreground/60"
                        title="Enviando..."
                      />
                    ) : message.is_read ? (
                      <CheckCheck
                        className="h-3 w-3 text-sky-400 font-bold"
                        title={
                          message.read_at
                            ? `Mensagem lida às ${format(new Date(message.read_at), "HH:mm")}`
                            : "Mensagem lida"
                        }
                      />
                    ) : (
                      <CheckCheck
                        className="h-3 w-3 text-muted-foreground/50"
                        title="Enviada (não visualizada)"
                      />
                    )}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Action Dropdown Menu & Quick React Trigger */}
        {!message.is_deleted && !isEditing && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0 self-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/70 transition-colors"
                  title="Mais ações"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={isMe ? "end" : "start"}
                className="bg-popover border-border text-popover-foreground min-w-[170px] p-1.5 rounded-xl shadow-xl z-50 backdrop-blur-md"
              >
                {/* Quick reactions bar inside menu */}
                <div className="flex items-center justify-between p-1 border-b border-border mb-1">
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
                  className="text-xs hover:bg-accent cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> Copiar texto
                </DropdownMenuItem>

                {isMe && (
                  <DropdownMenuItem
                    onClick={() => {
                      setEditContent(message.content);
                      setIsEditing(true);
                    }}
                    className="text-xs hover:bg-accent cursor-pointer text-[#CCD0CF]"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-2 text-[#CCD0CF]" /> Editar mensagem
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator className="bg-border" />

                <DropdownMenuItem
                  onClick={() => onDelete(message.id, "for_me")}
                  className="text-xs hover:bg-accent cursor-pointer text-muted-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir para mim
                </DropdownMenuItem>

                {isMe && (
                  <DropdownMenuItem
                    onClick={() => onDelete(message.id, "for_all")}
                    className="text-xs hover:bg-rose-500/10 text-rose-500 hover:text-rose-600 cursor-pointer"
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
        <div
          className={`flex flex-wrap gap-1 mt-1 ${
            isMe ? "justify-end mr-1" : "justify-start ml-9"
          }`}
        >
          {Object.entries(reactionCounts).map(([emoji, data]) => (
            <button
              key={emoji}
              onClick={() => onReact(message.id, emoji)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition-all ${
                data.hasReacted
                  ? "bg-[#253745] border-[#4A5C6A] text-[#CCD0CF] font-bold"
                  : "bg-card border-border text-foreground hover:border-muted-foreground/40"
              }`}
            >
              <span>{emoji}</span>
              <span className="font-mono-tech text-[10px]">{data.count}</span>
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
