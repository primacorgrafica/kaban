/**
 * Tipos para a integração de monitoramento de e-mails do Microsoft Outlook.
 * Estes tipos definem os eventos de e-mail associados às Ordens de Serviço no Kanban.
 */

/** Direção do e-mail em relação à Primacor */
export type EmailDirection = "enviado" | "recebido";

/** Caixa corporativa monitorada */
export type MonitoredMailbox =
  | "embalagens@primacorgrafica.com.br"
  | "preimpressao@primacorgrafica.com.br";

export const MONITORED_MAILBOXES: MonitoredMailbox[] = [
  "preimpressao@primacorgrafica.com.br",
];

/**
 * Representa um evento de e-mail vinculado a uma Ordem de Serviço.
 * Gravado na tabela `order_email_events` do Supabase.
 */
export interface OrderEmailEvent {
  id: string;
  order_id: string;
  direction: EmailDirection;
  mailbox: MonitoredMailbox;
  message_id: string;
  conversation_id: string | null;
  subject: string;
  sender: string;
  recipients: string;
  body_preview: string | null;
  email_datetime: string; // ISO timestamp
  os_number: string; // Número da O.S. extraído (ex: "73210")
  created_at: string;
  read_at?: string | null;
  read_by?: string | null;
}

/**
 * Payload retornado pela Microsoft Graph API ao listar mensagens.
 */
export interface GraphMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  body?: {
    contentType: string;
    content: string;
  };
  from?: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients?: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  sentDateTime: string;
  receivedDateTime: string;
  conversationId: string;
  internetMessageId?: string;
  parentFolderId?: string;
  isRead?: boolean;
}

/**
 * Resposta paginada da Graph API para listagem de mensagens.
 */
export interface GraphMessagesResponse {
  value: GraphMessage[];
  "@odata.nextLink"?: string;
}

/**
 * Estado do monitor de e-mails.
 */
export interface EmailMonitorState {
  isRunning: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  processedCount: number;
}
