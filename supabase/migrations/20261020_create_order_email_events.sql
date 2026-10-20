-- ====================================================================
-- Primacor Gráfica - Integração Microsoft Outlook / 365
-- Migration: 20261020_create_order_email_events.sql
-- Tabela de eventos de e-mails vinculados a Ordens de Serviço (O.S.)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.order_email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('enviado', 'recebido')),
  mailbox TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  conversation_id TEXT,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipients TEXT NOT NULL,
  body_preview TEXT,
  email_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  os_number TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_order_email_events_order_id ON public.order_email_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_email_events_os_number ON public.order_email_events(os_number);
CREATE INDEX IF NOT EXISTS idx_order_email_events_conversation_id ON public.order_email_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_order_email_events_message_id ON public.order_email_events(message_id);
CREATE INDEX IF NOT EXISTS idx_order_email_events_datetime ON public.order_email_events(email_datetime DESC);

-- Habilita Row Level Security (RLS)
ALTER TABLE public.order_email_events ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança
DROP POLICY IF EXISTS "Authenticated users can view order email events" ON public.order_email_events;
CREATE POLICY "Authenticated users can view order email events"
  ON public.order_email_events
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert order email events" ON public.order_email_events;
CREATE POLICY "Authenticated users can insert order email events"
  ON public.order_email_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update order email events" ON public.order_email_events;
CREATE POLICY "Authenticated users can update order email events"
  ON public.order_email_events
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Habilita Realtime para sincronização instantânea com os cards do Kanban
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'order_email_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_email_events;
  END IF;
END $$;
