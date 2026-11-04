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
      className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
        isActive
          ? "bg-secondary/70 border border-[#4A5C6A]/50 shadow-xs"
          : "hover:bg-muted/50 border border-transparent hover:border-border/60"
      }`}
    >
      {/* Indicador lateral sutil da conversa ativa (estilo Linear) */}
      {isActive && (
        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
      )}

      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Avatar com status online */}
        <div className="relative shrink-0">
          {otherUser.avatar_url ? (
            <img
              src={otherUser.avatar_url}
              alt={otherUser.nome}
              className={`w-10 h-10 rounded-xl object-cover shadow-xs transition-transform duration-150 ${
                isActive
                  ? "ring-2 ring-sky-400/60 shadow-sm"
                  : "border border-border/80 group-hover:scale-[1.02]"
              }`}
            />
          ) : (
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-xs transition-transform duration-150 ${
                isActive
                  ? "bg-gradient-to-br from-[#253745] to-[#1a2935] text-[#CCD0CF] ring-2 ring-sky-400/60 font-black shadow-sm"
                  : "bg-muted border border-border/80 text-foreground group-hover:scale-[1.02]"
              }`}
            >
              {otherUser.nome.charAt(0).toUpperCase()}
            </div>
          )}
          {otherUser.online ? (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-card shadow-[0_0_6px_rgba(16,185,129,0.6)]"
              title="Online agora"
            />
          ) : (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-muted-foreground/30 ring-2 ring-card"
              title="Offline"
            />
          )}
        </div>

        {/* Informações da conversa */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span
              className={`text-xs sm:text-[13px] font-semibold truncate tracking-tight transition-colors ${
                isActive ? "text-foreground font-bold" : "text-foreground group-hover:text-foreground"
              }`}
            >
              {otherUser.nome}
            </span>
            {timeStr && (
              <span className="text-[10px] text-muted-foreground/70 font-mono-tech tabular-nums shrink-0">
                {timeStr}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-1">
            <p
              className={`text-[11px] truncate max-w-[170px] leading-tight transition-colors ${
                unreadCount > 0
                  ? "text-foreground font-medium"
                  : "text-muted-foreground/70"
              }`}
            >
              {last_message_preview || "Conversa iniciada"}
            </p>

            {unreadCount > 0 && (
              <span className="bg-sky-500 text-white text-[10px] font-bold px-1.5 h-4 min-w-[16px] flex items-center justify-center rounded-full font-mono-tech shrink-0 shadow-xs">
                {unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Menu contextual */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
              title="Opções da conversa"
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
              className="text-xs hover:bg-accent cursor-pointer text-foreground rounded-lg"
            >
              <Eraser className="h-3.5 w-3.5 mr-2 text-amber-500" /> Limpar histórico
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onHide}
              className="text-xs hover:bg-rose-500/10 text-rose-500 hover:text-rose-600 cursor-pointer rounded-lg"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir para mim
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
