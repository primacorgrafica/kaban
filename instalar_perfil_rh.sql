-- ====================================================================
-- PRIMACOR - KABAN: ATUALIZAÇÃO DO PERFIL RH E PERMISSÕES RLS
-- Projeto Supabase: zkpfuotxkdbokytqtjgj
-- Execute este script no SQL Editor do Supabase Dashboard
-- ====================================================================

-- 1. Adiciona o valor 'rh' ao enum public.app_role se ainda não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid 
    WHERE t.typname = 'app_role' AND e.enumlabel = 'rh'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'rh';
  END IF;
END $$;

COMMENT ON TYPE public.app_role IS 'Papéis do sistema Kaban: admin, user, coordenador, operador, vendedor, orcamentista, impressor, entregador, rh';

-- 2. Garante a tabela public.user_roles com integridade
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Habilita RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Atualiza políticas de RLS em user_roles para evitar bloqueios em edições de admins
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

-- Qualquer usuário autenticado pode ver seu próprio papel
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Administradores podem visualizar todos os papéis
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Administradores podem inserir papéis
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Administradores podem atualizar papéis
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Administradores podem remover papéis
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'admin'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 4. Cria a RPC dedicada admin_set_user_role (SECURITY DEFINER)
-- Bypassa quaisquer bloqueios de RLS para administradores autenticados
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id UUID,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_is_admin BOOLEAN;
  v_role_enum public.app_role;
BEGIN
  -- Validação de privilégios de administrador
  v_caller_is_admin := (
    public.get_user_role(auth.uid()) = 'admin' 
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

  IF NOT v_caller_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem alterar o perfil de usuários.');
  END IF;

  -- Validação e conversão do papel
  BEGIN
    v_role_enum := p_role::public.app_role;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil inválido: ' || COALESCE(p_role, 'nulo'));
  END;

  -- Remove registros anteriores de papel deste usuário para evitar duplicatas
  DELETE FROM public.user_roles WHERE user_id = p_user_id;

  -- Insere o novo papel definido
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, v_role_enum);

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'role', p_role);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) TO authenticated;
