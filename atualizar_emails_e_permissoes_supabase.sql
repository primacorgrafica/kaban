-- ====================================================================
-- PRIMACOR - KABAN: ATUALIZAÇÃO DE E-MAILS, PERMISSÕES E SINCRONIZAÇÃO
-- Projeto Supabase: zkpfuotxkdbokytqtjgj
-- Execute este script no SQL Editor do Supabase Dashboard
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Cria coluna de e-mail na tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_nome_lower ON public.profiles(lower(trim(nome)));

-- 2. Cria colunas de e-mail e user_id na tabela vendedores
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vendedores_nome_lower ON public.vendedores(lower(trim(nome)));
CREATE INDEX IF NOT EXISTS idx_vendedores_email ON public.vendedores(email);

-- 3. Sincroniza imediatamente todos os e-mails de auth.users para public.profiles
UPDATE public.profiles p
SET email = LOWER(TRIM(u.email))
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.email IS NULL OR p.email = '' OR p.email <> LOWER(TRIM(u.email)));

-- 4. Sincroniza e-mails dos vendedores a partir dos profiles correspondentes
UPDATE public.vendedores v
SET email = p.email, user_id = p.user_id
FROM public.profiles p
WHERE LOWER(TRIM(v.nome)) = LOWER(TRIM(p.nome))
  AND p.email IS NOT NULL
  AND (v.email IS NULL OR v.email = '');

-- 5. Atualiza a política de RLS em public.profiles para permitir que administradores editem usuários
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = user_id
  )
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = user_id
  );

-- 6. RPC para listar e-mails de auth.users com segurança (sem depender de Edge Functions)
CREATE OR REPLACE FUNCTION public.admin_get_user_emails()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT 
    id as user_id,
    email::text,
    last_sign_in_at
  FROM auth.users;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_emails() TO authenticated;

-- 7. RPC definitiva para salvar usuário, e-mail, senha e módulos com privilégios de Admin
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  p_user_id UUID,
  p_nome TEXT,
  p_email TEXT DEFAULT NULL,
  p_modulos_acesso TEXT[] DEFAULT NULL,
  p_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_is_admin BOOLEAN;
  v_clean_email TEXT;
BEGIN
  -- Verifica autorização (admin ou próprio usuário)
  v_caller_is_admin := (
    public.get_user_role(auth.uid()) = 'admin' 
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

  IF NOT (v_caller_is_admin OR auth.uid() = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem atualizar usuários.');
  END IF;

  v_clean_email := NULLIF(LOWER(TRIM(p_email)), '');

  -- Atualiza public.profiles
  UPDATE public.profiles
  SET
    nome = COALESCE(NULLIF(trim(p_nome), ''), nome),
    email = COALESCE(v_clean_email, email),
    modulos_acesso = COALESCE(p_modulos_acesso, modulos_acesso)
  WHERE user_id = p_user_id;

  -- Atualiza auth.users
  IF v_clean_email IS NOT NULL THEN
    UPDATE auth.users
    SET 
      email = v_clean_email,
      raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{nome}', to_jsonb(trim(p_nome))),
      updated_at = now()
    WHERE id = p_user_id;

    UPDATE auth.identities
    SET 
      identity_data = jsonb_set(COALESCE(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_clean_email)),
      updated_at = now()
    WHERE user_id = p_user_id AND provider = 'email';
  END IF;

  -- Atualiza senha se informada
  IF p_password IS NOT NULL AND length(trim(p_password)) >= 6 THEN
    UPDATE auth.users
    SET 
      encrypted_password = crypt(trim(p_password), gen_salt('bf')),
      updated_at = now()
    WHERE id = p_user_id;
  END IF;

  -- Sincroniza tabela de vendedores
  IF v_clean_email IS NOT NULL THEN
    UPDATE public.vendedores
    SET
      nome = COALESCE(NULLIF(trim(p_nome), ''), nome),
      email = v_clean_email,
      user_id = p_user_id
    WHERE user_id = p_user_id OR lower(trim(nome)) = lower(trim(p_nome));
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(UUID, TEXT, TEXT, TEXT[], TEXT) TO authenticated;

-- 8. Tabela de rastreamento de notificações para vendedores
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

CREATE INDEX IF NOT EXISTS idx_order_seller_notif_order_id ON public.order_seller_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_seller_notif_pending ON public.order_seller_notifications(sent_status, created_at) WHERE sent_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_order_seller_notif_dedup ON public.order_seller_notifications(order_id, status, created_at DESC);

ALTER TABLE public.order_seller_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view order seller notifications" ON public.order_seller_notifications;
CREATE POLICY "Authenticated can view order seller notifications"
  ON public.order_seller_notifications FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert order seller notifications" ON public.order_seller_notifications;
CREATE POLICY "Authenticated can insert order seller notifications"
  ON public.order_seller_notifications FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update order seller notifications" ON public.order_seller_notifications;
CREATE POLICY "Authenticated can update order seller notifications"
  ON public.order_seller_notifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 9. Trigger para criação de notificação na transição de status para 'aguardando_aprovacao'
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
  IF NEW.status = 'aguardando_aprovacao' AND (OLD.status IS DISTINCT FROM 'aguardando_aprovacao') THEN
    
    SELECT id INTO v_existing_id
    FROM public.order_seller_notifications
    WHERE order_id = NEW.id
      AND status = 'aguardando_aprovacao'
      AND created_at >= (now() - interval '12 hours')
      AND sent_status IN ('sent', 'pending')
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    v_os_title := COALESCE(NEW.titulo, 'O.S. sem número');
    v_cliente := COALESCE(NEW.cliente, 'Cliente não informado');
    v_seller_name := NEW.vendedor;

    IF v_seller_name IS NOT NULL AND trim(v_seller_name) <> '' THEN
      SELECT email INTO v_seller_email
      FROM public.vendedores
      WHERE lower(trim(nome)) = lower(trim(v_seller_name))
        AND email IS NOT NULL AND email <> ''
      LIMIT 1;

      IF v_seller_email IS NULL THEN
        SELECT email INTO v_seller_email
        FROM public.profiles
        WHERE lower(trim(nome)) = lower(trim(v_seller_name))
          AND email IS NOT NULL AND email <> ''
        LIMIT 1;
      END IF;
    END IF;

    IF v_seller_email IS NOT NULL AND v_seller_email <> '' THEN
      v_subject := 'O.S. ' || v_os_title || ' - Aguardando Aprovação (' || v_cliente || ')';
      v_link := v_base_url || '/?orderId=' || NEW.id;
      v_body := '<h3>Notificação de Ordem de Serviço</h3><p>A O.S. <strong>' || v_os_title || '</strong> do cliente <strong>' || v_cliente || '</strong> mudou para <strong>Aguardando Aprovação</strong>.</p><p><a href="' || v_link || '">Acessar Card no Kaban</a></p>';

      INSERT INTO public.order_seller_notifications (
        order_id, os_number, cliente, status, vendedor_nome, vendedor_email, subject, body_html, link_card
      ) VALUES (
        NEW.id, v_os_title, v_cliente, 'aguardando_aprovacao', v_seller_name, v_seller_email, v_subject, v_body, v_link
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_seller_on_approval ON public.orders;
CREATE TRIGGER trg_notify_seller_on_approval
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_status_approval_notification();

-- 10. Permissão para exclusão de perfis por administradores
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 11. RPC para remover usuário e seus acessos com segurança (sem depender de Edge Functions)
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_is_admin BOOLEAN;
BEGIN
  -- Validação de administrador
  v_caller_is_admin := (
    public.get_user_role(auth.uid()) = 'admin' 
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

  IF NOT v_caller_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem remover usuários.');
  END IF;

  -- Impede autoexclusão
  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Você não pode remover seu próprio usuário.');
  END IF;

  -- Remove registros dependentes
  DELETE FROM public.user_presence WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE user_id = p_user_id;
  UPDATE public.vendedores SET user_id = NULL WHERE user_id = p_user_id;

  -- Remove autenticação
  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

-- 12. RPC para criar novos usuários diretamente (sem depender de Edge Functions)
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_nome TEXT,
  p_role TEXT,
  p_modulos_acesso TEXT[] DEFAULT '{}'::TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_is_admin BOOLEAN;
  v_new_id UUID;
  v_clean_email TEXT;
  v_role_enum public.app_role;
BEGIN
  v_caller_is_admin := (
    public.get_user_role(auth.uid()) = 'admin' 
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

  IF NOT v_caller_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem criar usuários.');
  END IF;

  v_clean_email := LOWER(TRIM(p_email));

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(trim(email)) = v_clean_email) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EMAIL_EXISTS', 'error', 'Já existe um usuário cadastrado com este e-mail.');
  END IF;

  v_new_id := gen_random_uuid();
  v_role_enum := p_role::public.app_role;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_new_id,
    'authenticated', 'authenticated', v_clean_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', trim(p_nome)), now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    v_new_id, v_new_id,
    jsonb_build_object('sub', v_new_id, 'email', v_clean_email, 'email_verified', true),
    'email', v_new_id, now(), now(), now()
  );

  INSERT INTO public.profiles (user_id, nome, email, modulos_acesso, created_at)
  VALUES (v_new_id, trim(p_nome), v_clean_email, COALESCE(p_modulos_acesso, '{}'::text[]), now())
  ON CONFLICT (user_id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    modulos_acesso = EXCLUDED.modulos_acesso;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_new_id, v_role_enum)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF p_role = 'vendedor' THEN
    INSERT INTO public.vendedores (nome, email, user_id)
    VALUES (trim(p_nome), v_clean_email, v_new_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT[]) TO authenticated;

-- ====================================================================
-- 8. Adiciona suporte a status de leitura de respostas de e-mail (read_at)
-- ====================================================================
ALTER TABLE public.order_email_events
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.order_email_events
  ADD COLUMN IF NOT EXISTS read_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_email_events_read_at
  ON public.order_email_events(read_at);

DROP POLICY IF EXISTS "Authenticated users can update order email events" ON public.order_email_events;
CREATE POLICY "Authenticated users can update order email events"
  ON public.order_email_events
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

