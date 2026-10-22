import { ChatConversation } from "@/types/chat";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { MoreVertical, Trash2, Eraser } from "lucide-react";

interface ChatConversationItemProps {
  conversation: ChatConversation;
  isActive: boolean;
  onClick: () => void;
  onHide: () => void;
  onClearHistory: () => void;
}

export function ChatConversationItem({
  conversation,
  isActive,
  onClick,
  onHide,
  onClearHistory,
}: ChatConversationItemProps) {
  const { otherUser, unreadCount, last_message_preview, last_message_at } = conversation;

  // Formatação amigável de horário
  let timeStr = "";
  if (last_message_at) {
    const d = new Date(last_message_at);
    if (isToday(d)) {
      timeStr = format(d, "HH:mm", { locale: ptBR });
    } else if (isYesterday(d)) {
      timeStr = "Ontem";
    } else {
      timeStr = format(d, "dd/MM", { locale: ptBR });
    }
  }

  return (
    <div
      onClick={onClick}
      className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${
        isActive
          ? "bg-[#253745] border-[#4A5C6A] shadow-sm"
          : "hover:bg-accent border-transparent hover:border-border"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Avatar com status online */}
        <div className="relative shrink-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm transition-transform ${
              isActive
                ? "bg-[#253745] text-[#CCD0CF] font-black border border-[#4A5C6A]"
                : "bg-muted border border-border text-foreground"
            }`}
          >
            {otherUser.nome.charAt(0).toUpperCase()}
          </div>
          {otherUser.online && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
          )}
        </div>

        {/* Informações da conversa */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span
              className={`text-xs font-bold truncate ${
                isActive ? "text-[#CCD0CF]" : "text-foreground"
              }`}
            >
              {otherUser.nome}
            </span>
            {timeStr && (
              <span className="text-[10px] text-muted-foreground font-mono-tech shrink-0">
                {timeStr}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] text-muted-foreground truncate max-w-[170px] leading-tight">
              {last_message_preview || "Conversa iniciada"}
            </p>

            {unreadCount > 0 && (
              <Badge className="bg-[#CCD0CF] text-[#06141B] text-[10px] font-bold px-1.5 py-0 h-4 min-w-[16px] flex items-center justify-center rounded-full font-mono-tech shrink-0 animate-pulse">
                {unreadCount}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Menu contextual */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-1" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-popover border-border text-popover-foreground min-w-[160px] p-1.5 rounded-xl shadow-xl z-50"
          >
            <DropdownMenuItem
              onClick={onClearHistory}
              className="text-xs hover:bg-accent cursor-pointer text-foreground"
            >
              <Eraser className="h-3.5 w-3.5 mr-2 text-amber-500" /> Limpar histórico
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onHide}
              className="text-xs hover:bg-rose-500/10 text-rose-500 hover:text-rose-600 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir para mim
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
