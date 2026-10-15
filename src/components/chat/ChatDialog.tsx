import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { ChatContainer } from "./ChatContainer";
import {
  setChatModalOpen,
  getActiveChatConversationId,
  notifyConversationViewed,
} from "./GlobalChatNotifier";

interface ChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChatDialog({ open, onOpenChange }: ChatDialogProps) {
  useEffect(() => {
    setChatModalOpen(open);
    if (open) {
      const activeId = getActiveChatConversationId();
      if (activeId) {
        void notifyConversationViewed(activeId);
      }
    }
    return () => {
      setChatModalOpen(false);
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 border-0 bg-transparent shadow-2xl overflow-hidden rounded-2xl">
        <ChatContainer isModal={true} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
