-- ====================================================================
-- Primacor Gráfica - Sincronização em Tempo Real de Leitura de E-mails
-- Migration: 20261103_order_email_events_read_sync.sql
-- Sincroniza marcação de leitura de respostas de e-mail entre todos os usuários
-- ====================================================================

-- 1. Garante que as colunas de leitura existam
ALTER TABLE public.order_email_events
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.order_email_events
  ADD COLUMN IF NOT EXISTS read_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_email_events_read_at
  ON public.order_email_events(read_at);

-- 2. Habilita REPLICA IDENTITY FULL para que o Supabase Realtime replique UPDATE com RLS ativo
ALTER TABLE public.order_email_events REPLICA IDENTITY FULL;

-- 3. Atualiza políticas de segurança RLS para permitir atualização por todos os operadores autenticados
DROP POLICY IF EXISTS "Authenticated users can update order email events" ON public.order_email_events;
CREATE POLICY "Authenticated users can update order email events"
  ON public.order_email_events
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. RPC dedicada para marcar todos os eventos recebidos de uma O.S. como lidos de forma atômica
CREATE OR REPLACE FUNCTION public.mark_order_email_events_read(
  p_order_id UUID DEFAULT NULL,
  p_os_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_user_id UUID := auth.uid();
  v_count INT := 0;
BEGIN
  UPDATE public.order_email_events
  SET
    read_at = v_now,
    read_by = COALESCE(v_user_id, read_by)
  WHERE direction = 'recebido'
    AND read_at IS NULL
    AND (
      (p_order_id IS NOT NULL AND order_id = p_order_id)
      OR
      (p_os_number IS NOT NULL AND os_number = p_os_number)
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Remove avisos correspondentes da central para que não fiquem pendentes para outros usuários
  IF p_os_number IS NOT NULL AND p_os_number <> '' THEN
    DELETE FROM public.avisos
    WHERE titulo ILIKE '%' || p_os_number || '%'
      AND titulo ILIKE '%Nova resposta do cliente%';
  END IF;

  RETURN jsonb_build_object('success', true, 'updated_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_order_email_events_read(UUID, TEXT) TO authenticated, anon;
