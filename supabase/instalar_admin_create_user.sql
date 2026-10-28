-- ====================================================================
-- Primacor Gráfica - Instalação da RPC admin_create_user no Supabase
-- Arquivo: supabase/instalar_admin_create_user.sql
-- ====================================================================

-- 1. Habilita extensão pgcrypto (necessária para criptografia de senha no auth.users)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Permite que administradores excluam registros na tabela profiles
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 3. Função RPC para criação de novos usuários com suporte a 'entregador'
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
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller_is_admin BOOLEAN;
  v_new_id UUID;
  v_clean_email TEXT;
  v_role_enum public.app_role;
  v_modulos TEXT[];
BEGIN
  -- Validação de segurança: apenas admin autenticado
  v_caller_is_admin := (
    public.get_user_role(auth.uid()) = 'admin' 
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

  IF NOT v_caller_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem criar usuários.');
  END IF;

  v_clean_email := LOWER(TRIM(p_email));

  -- Verifica se o e-mail já existe
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(TRIM(email)) = v_clean_email) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EMAIL_EXISTS', 'error', 'Já existe um usuário cadastrado com este e-mail.');
  END IF;

  v_new_id := gen_random_uuid();
  v_role_enum := p_role::public.app_role;

  -- Se for entregador e não especificou módulos, define ['entregador']
  IF p_role = 'entregador' AND (p_modulos_acesso IS NULL OR array_length(p_modulos_acesso, 1) IS NULL) THEN
    v_modulos := ARRAY['entregador'];
  ELSE
    v_modulos := COALESCE(p_modulos_acesso, '{}'::TEXT[]);
  END IF;

  -- Insere na tabela de autenticação auth.users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_new_id,
    'authenticated', 'authenticated', v_clean_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', TRIM(p_nome)), now(), now(), '', '', '', ''
  );

  -- Insere identidade auth
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    v_new_id, v_new_id,
    jsonb_build_object('sub', v_new_id, 'email', v_clean_email, 'email_verified', true),
    'email', v_new_id, now(), now(), now()
  );

  -- Insere profile
  INSERT INTO public.profiles (user_id, nome, email, modulos_acesso, created_at)
  VALUES (v_new_id, TRIM(p_nome), v_clean_email, v_modulos, now())
  ON CONFLICT (user_id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    modulos_acesso = EXCLUDED.modulos_acesso;

  -- Insere papel em user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_new_id, v_role_enum)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Se for entregador, cadastra na tabela de entregadores
  IF p_role = 'entregador' THEN
    INSERT INTO public.entregadores (nome_completo, user_id, ativo)
    VALUES (TRIM(p_nome), v_new_id, true)
    ON CONFLICT (user_id) DO UPDATE SET
      nome_completo = EXCLUDED.nome_completo,
      ativo = true;
  END IF;

  -- Se for vendedor, cadastra em vendedores
  IF p_role = 'vendedor' THEN
    INSERT INTO public.vendedores (nome, email, user_id)
    VALUES (TRIM(p_nome), v_clean_email, v_new_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT[]) TO authenticated;

-- 4. Função RPC para exclusão segura de usuários
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_is_admin BOOLEAN;
BEGIN
  v_caller_is_admin := (
    public.get_user_role(auth.uid()) = 'admin' 
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

  IF NOT v_caller_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem remover usuários.');
  END IF;

  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Você não pode remover a si mesmo.');
  END IF;

  DELETE FROM public.user_presence WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE user_id = p_user_id;
  DELETE FROM public.entregadores WHERE user_id = p_user_id;
  UPDATE public.vendedores SET user_id = NULL WHERE user_id = p_user_id;

  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
