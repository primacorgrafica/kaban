-- ====================================================================
-- Primacor Gráfica - Kaban: Notificações de Vendedores por E-mail
-- Migration: 20261023_seller_email_notifications.sql
-- Descrição: 
--   1. Adiciona e sincroniza o campo de e-mail na tabela profiles e vendedores.
--   2. Cria a tabela order_seller_notifications com rastreamento, anti-duplicação e tentativas.
--   3. Cria trigger backend na tabela orders para disparar notificação atômica ao vendedor
--      sempre que uma O.S. mudar para 'aguardando_aprovacao'.
--   4. RLS, índices de performance e habilitação de Realtime.
-- ====================================================================

-- 1. Campo email em public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_nome_lower ON public.profiles(lower(trim(nome)));

-- Atualiza handle_new_user para registrar o e-mail automaticamente no profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    LOWER(TRIM(NEW.email))
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    nome = CASE WHEN public.profiles.nome = '' OR public.profiles.nome IS NULL THEN EXCLUDED.nome ELSE public.profiles.nome END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Backfill dos e-mails existentes de auth.users para public.profiles
UPDATE public.profiles p
SET email = LOWER(TRIM(u.email))
FROM auth.users u
WHERE p.user_id = u.id AND (p.email IS NULL OR p.email = '');

-- 2. Campos email e user_id em public.vendedores
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vendedores_nome_lower ON public.vendedores(lower(trim(nome)));
CREATE INDEX IF NOT EXISTS idx_vendedores_email ON public.vendedores(email);

-- Backfill de email em vendedores baseado nos nomes cadastrados em profiles
UPDATE public.vendedores v
SET email = p.email, user_id = p.user_id
FROM public.profiles p
WHERE lower(trim(v.nome)) = lower(trim(p.nome))
  AND (v.email IS NULL OR v.email = '')
  AND p.email IS NOT NULL;

-- 3. Tabela de notificações para vendedores
CREATE TABLE IF NOT EXISTS public.order_seller_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  os_number TEXT NOT NULL,
  cliente TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando_aprovacao',
  vendedor_nome TEXT,
  vendedor_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  link_card TEXT NOT NULL,
  sent_status TEXT NOT NULL DEFAULT 'pending' CHECK (sent_status IN ('pending', 'sent', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices de consulta, auditoria e desduplicação
CREATE INDEX IF NOT EXISTS idx_order_seller_notif_order_id ON public.order_seller_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_seller_notif_pending ON public.order_seller_notifications(sent_status, created_at) WHERE sent_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_order_seller_notif_dedup ON public.order_seller_notifications(order_id, status, created_at DESC);

-- Habilita RLS
ALTER TABLE public.order_seller_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view order seller notifications" ON public.order_seller_notifications;
CREATE POLICY "Authenticated can view order seller notifications"
  ON public.order_seller_notifications
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert order seller notifications" ON public.order_seller_notifications;
CREATE POLICY "Authenticated can insert order seller notifications"
  ON public.order_seller_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update order seller notifications" ON public.order_seller_notifications;
CREATE POLICY "Authenticated can update order seller notifications"
  ON public.order_seller_notifications
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Habilita Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'order_seller_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_seller_notifications;
  END IF;
END $$;

-- 4. Função e Trigger para disparar notificação no backend na mudança para 'aguardando_aprovacao'
CREATE OR REPLACE FUNCTION public.handle_order_status_approval_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_seller_email TEXT := NULL;
  v_seller_name TEXT := NULL;
  v_os_title TEXT;
  v_cliente TEXT;
  v_subject TEXT;
  v_body TEXT;
  v_link TEXT;
  v_existing_id UUID;
  v_base_url TEXT := 'https://primacorflow.vercel.app';
BEGIN
  -- Dispara apenas quando entra no status aguardando_aprovacao vindo de outro status
  IF NEW.status = 'aguardando_aprovacao' AND (OLD.status IS DISTINCT FROM 'aguardando_aprovacao') THEN
    
    -- Anti-duplicação: verifica se já existe notificação recente (últimas 12 horas) para a mesma O.S. neste status
    SELECT id INTO v_existing_id
    FROM public.order_seller_notifications
    WHERE order_id = NEW.id
      AND status = 'aguardando_aprovacao'
      AND created_at >= (now() - interval '12 hours')
      AND sent_status IN ('sent', 'pending')
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Já foi notificado para esta transição recente, evita duplicatas
      RETURN NEW;
    END IF;

    v_os_title := COALESCE(TRIM(NEW.titulo), 'Sem número');
    v_cliente := COALESCE(TRIM(NEW.cliente), 'Cliente não informado');
    v_seller_name := TRIM(COALESCE(NEW.vendedor, ''));

    -- Resolução do e-mail do vendedor:
    -- 1. Busca em public.profiles por nome idêntico ou parcial
    IF v_seller_name <> '' THEN
      SELECT email, nome INTO v_seller_email, v_seller_name
      FROM public.profiles
      WHERE lower(trim(nome)) = lower(v_seller_name)
        AND email IS NOT NULL AND email <> ''
      LIMIT 1;

      -- Se não achou por igualdade exata, tenta com ilike
      IF v_seller_email IS NULL THEN
        SELECT email, nome INTO v_seller_email, v_seller_name
        FROM public.profiles
        WHERE lower(trim(nome)) ILIKE lower(v_seller_name) || '%'
          AND email IS NOT NULL AND email <> ''
        LIMIT 1;
      END IF;

      -- 2. Se ainda não achou, busca na tabela vendedores
      IF v_seller_email IS NULL THEN
        SELECT email, nome INTO v_seller_email, v_seller_name
        FROM public.vendedores
        WHERE lower(trim(nome)) = lower(v_seller_name)
          AND email IS NOT NULL AND email <> ''
        LIMIT 1;
      END IF;
    END IF;

    -- 3. Fallback: se a OS não tinha vendedor ou não tinha e-mail, tenta o criador da O.S.
    IF v_seller_email IS NULL AND NEW.criado_por IS NOT NULL THEN
      SELECT email, nome INTO v_seller_email, v_seller_name
      FROM public.profiles
      WHERE user_id = NEW.criado_por
        AND email IS NOT NULL AND email <> ''
      LIMIT 1;
    END IF;

    v_link := v_base_url || '/?os=' || v_os_title;

    v_subject := '🔔 [KABAN] O.S. #' || v_os_title || ' — ' || v_cliente || ' está em Aguardando Aprovação';

    v_body := '<div style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #0c1821; color: #ccd0cf; border-radius: 16px; border: 1px solid #253745;">'
      || '<div style="margin-bottom: 20px; border-bottom: 1px solid #253745; padding-bottom: 16px;">'
      || '<span style="font-size: 11px; font-weight: 700; color: #9ba8ab; text-transform: uppercase; letter-spacing: 1.5px;">Primacor Gráfica • Sistema Kaban</span>'
      || '<h2 style="margin: 8px 0 0 0; font-size: 20px; color: #ffffff; font-weight: 700;">O.S. Aguardando Aprovação</h2>'
      || '</div>'
      || '<p style="font-size: 14px; line-height: 1.6; color: #ccd0cf; margin-bottom: 20px;">'
      || 'Olá' || CASE WHEN v_seller_name IS NOT NULL AND v_seller_name <> '' THEN ' <strong>' || v_seller_name || '</strong>' ELSE '' END || ', a seguinte Ordem de Serviço mudou de status e aguarda aprovação do cliente:'
      || '</p>'
      || '<div style="background-color: #11212d; border-radius: 12px; padding: 18px; margin-bottom: 24px; border: 1px solid #1f3344;">'
      || '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">'
      || '<tr><td style="padding: 6px 0; color: #9ba8ab; width: 140px;">Número da O.S.:</td><td style="padding: 6px 0; color: #ffffff; font-weight: bold;">#' || v_os_title || '</td></tr>'
      || '<tr><td style="padding: 6px 0; color: #9ba8ab;">Cliente:</td><td style="padding: 6px 0; color: #ffffff; font-weight: bold;">' || v_cliente || '</td></tr>'
      || '<tr><td style="padding: 6px 0; color: #9ba8ab;">Status Atual:</td><td style="padding: 6px 0;"><span style="background-color: rgba(249, 115, 22, 0.2); color: #f97316; padding: 3px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; border: 1px solid rgba(249, 115, 22, 0.4);">Aguardando Aprovação</span></td></tr>'
      || CASE WHEN NEW.descricao IS NOT NULL AND NEW.descricao <> '' THEN '<tr><td style="padding: 6px 0; color: #9ba8ab;">Descrição:</td><td style="padding: 6px 0; color: #ccd0cf;">' || NEW.descricao || '</td></tr>' ELSE '' END
      || CASE WHEN v_seller_name IS NOT NULL AND v_seller_name <> '' THEN '<tr><td style="padding: 6px 0; color: #9ba8ab;">Vendedor:</td><td style="padding: 6px 0; color: #ccd0cf;">' || v_seller_name || '</td></tr>' ELSE '' END
      || '</table>'
      || '</div>'
      || '<div style="text-align: center; margin: 30px 0;">'
      || '<a href="' || v_link || '" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);">Acessar Card no Kaban</a>'
      || '</div>'
      || '<div style="border-top: 1px solid #1f3344; padding-top: 14px; font-size: 11px; color: #9ba8ab; text-align: center;">'
      || 'Disparado automaticamente pelo fluxo de O.S. do Kaban Primacor • ' || to_char(now(), 'DD/MM/YYYY HH24:MI:SS')
      || '</div>'
      || '</div>';

    IF v_seller_email IS NOT NULL AND v_seller_email <> '' THEN
      INSERT INTO public.order_seller_notifications (
        order_id,
        os_number,
        cliente,
        status,
        vendedor_nome,
        vendedor_email,
        subject,
        body_html,
        link_card,
        sent_status
      ) VALUES (
        NEW.id,
        v_os_title,
        v_cliente,
        'aguardando_aprovacao',
        v_seller_name,
        v_seller_email,
        v_subject,
        v_body,
        v_link,
        'pending'
      );
    ELSE
      -- Registra a falha de resolução para possibilitar que o administrador veja e tente novamente após cadastrar o email
      INSERT INTO public.order_seller_notifications (
        order_id,
        os_number,
        cliente,
        status,
        vendedor_nome,
        vendedor_email,
        subject,
        body_html,
        link_card,
        sent_status,
        error_message
      ) VALUES (
        NEW.id,
        v_os_title,
        v_cliente,
        'aguardando_aprovacao',
        COALESCE(v_seller_name, 'Não identificado'),
        'sem_email@primacorgrafica.com.br',
        v_subject,
        v_body,
        v_link,
        'failed',
        'Vendedor ' || COALESCE('"' || v_seller_name || '"', 'não especificado') || ' não possui e-mail cadastrado no sistema.'
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Associa o trigger à tabela orders
DROP TRIGGER IF EXISTS trg_order_status_approval_notification ON public.orders;
CREATE TRIGGER trg_order_status_approval_notification
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_status_approval_notification();

-- 5. RPC para re-tentar envio de notificação falha ou pendente
CREATE OR REPLACE FUNCTION public.retry_order_seller_notification(p_notification_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notif RECORD;
  v_seller_email TEXT;
BEGIN
  SELECT * INTO v_notif
  FROM public.order_seller_notifications
  WHERE id = p_notification_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Notificação não encontrada');
  END IF;

  -- Se estava sem e-mail válido, tenta re-resolver a partir do vendedor atual
  IF v_notif.vendedor_email = 'sem_email@primacorgrafica.com.br' OR v_notif.vendedor_email IS NULL THEN
    SELECT email INTO v_seller_email
    FROM public.profiles
    WHERE lower(trim(nome)) = lower(trim(v_notif.vendedor_nome))
      AND email IS NOT NULL AND email <> ''
    LIMIT 1;

    IF v_seller_email IS NOT NULL THEN
      UPDATE public.order_seller_notifications
      SET vendedor_email = v_seller_email
      WHERE id = p_notification_id;
    END IF;
  END IF;

  UPDATE public.order_seller_notifications
  SET sent_status = 'pending',
      error_message = NULL,
      attempts = attempts + 1,
      last_attempt_at = now(),
      updated_at = now()
  WHERE id = p_notification_id;

  RETURN jsonb_build_object('success', true, 'id', p_notification_id);
END;
$$;
