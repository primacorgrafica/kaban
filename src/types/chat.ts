export interface ChatUser {
  id: string;
  nome: string;
  email?: string;
  role?: string | null;
  setor?: string | null;
  online?: boolean;
  last_seen?: string | null;
}

export interface ChatReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_edited: boolean;
  is_deleted: boolean;
  deleted_for_users: string[];
  reply_to_id?: string | null;
  created_at: string;
  updated_at: string;
  status?: "sending" | "sent" | "error";
  reactions?: ChatReaction[];
  reply_to?: {
    id: string;
    sender_id: string;
    content: string;
    sender_name?: string;
  } | null;
}

export interface ChatConversationSettings {
  conversation_id: string;
  user_id: string;
  is_hidden: boolean;
  cleared_until?: string | null;
  last_read_at: string;
}

export interface ChatConversation {
  id: string;
  user1_id: string;
  user2_id: string;
  last_message_at: string;
  last_message_preview?: string | null;
  last_message_sender_id?: string | null;
  created_at: string;
  updated_at: string;
  otherUser: ChatUser;
  unreadCount: number;
  is_hidden?: boolean;
  cleared_until?: string | null;
  settings?: ChatConversationSettings | null;
}

export interface TypingPayload {
  conversationId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}
