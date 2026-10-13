
-- Expand app_role enum with new roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coordenador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendedor';

-- Add setor_vinculado to profiles for operators
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS setor_vinculado text;

-- Update has_role to also support checking multiple roles via a helper
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;
