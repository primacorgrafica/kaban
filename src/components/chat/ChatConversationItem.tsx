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
          ? "bg-cyan-500/15 border-cyan-500/40 shadow-sm"
          : "hover:bg-slate-900/60 border-transparent hover:border-slate-800/80"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Avatar com status online */}
        <div className="relative shrink-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm transition-transform ${
              isActive
                ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-slate-950 font-black ring-1 ring-cyan-400/60"
                : "bg-slate-800 border border-slate-700/60 text-slate-200"
            }`}
          >
            {otherUser.nome.charAt(0).toUpperCase()}
          </div>
          {otherUser.online && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
          )}
        </div>

        {/* Informações da conversa */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span
              className={`text-xs font-bold truncate ${
                isActive ? "text-cyan-300" : "text-white"
              }`}
            >
              {otherUser.nome}
            </span>
            {timeStr && (
              <span className="text-[10px] text-slate-500 font-mono-tech shrink-0">
                {timeStr}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] text-slate-400 truncate max-w-[170px] leading-tight">
              {last_message_preview || "Conversa iniciada"}
            </p>

            {unreadCount > 0 && (
              <Badge className="bg-cyan-500 text-slate-950 text-[10px] font-bold px-1.5 py-0 h-4 min-w-[16px] flex items-center justify-center rounded-full font-mono-tech shrink-0 animate-pulse">
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
              className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-slate-900 border-slate-800 text-white min-w-[160px] p-1.5 rounded-xl shadow-xl z-50"
          >
            <DropdownMenuItem
              onClick={onClearHistory}
              className="text-xs hover:bg-slate-800 cursor-pointer text-slate-300"
            >
              <Eraser className="h-3.5 w-3.5 mr-2 text-amber-400" /> Limpar histórico
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onHide}
              className="text-xs hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir para mim
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
