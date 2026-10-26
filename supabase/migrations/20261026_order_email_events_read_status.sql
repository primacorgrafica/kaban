-- ====================================================================
-- Primacor Gráfica - Integração Microsoft Outlook / 365
-- Migration: 20261026_order_email_events_read_status.sql
-- Adiciona suporte a status de leitura de respostas de e-mail (read_at / read_by)
-- ====================================================================

ALTER TABLE public.order_email_events
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.order_email_events
  ADD COLUMN IF NOT EXISTS read_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_email_events_read_at
  ON public.order_email_events(read_at);

-- Garante que todos os usuários autenticados possam atualizar read_at nos eventos de e-mail
DROP POLICY IF EXISTS "Authenticated users can update order email events" ON public.order_email_events;
CREATE POLICY "Authenticated users can update order email events"
  ON public.order_email_events
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
