import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { ChatContainer } from "./ChatContainer";

interface ChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChatDialog({ open, onOpenChange }: ChatDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 border-0 bg-transparent shadow-2xl overflow-hidden rounded-2xl">
        <ChatContainer isModal={true} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
