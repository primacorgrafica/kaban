-- ====================================================================
-- PRIMACOR - KABAN: FILTRAR OPERADORES POR PAPEL & PERMISSÕES RLS
-- ====================================================================

-- 1. Garante que qualquer usuário autenticado consiga visualizar os papéis de usuários,
-- permitindo filtrar operadores em O.S., visualizar cargos no chat e nos módulos colaborativos.
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.user_roles;
CREATE POLICY "Authenticated can view roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 2. Função RPC segura com SECURITY DEFINER para listar operadores de forma atômica
CREATE OR REPLACE FUNCTION public.get_operadores()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  nome TEXT,
  setor_vinculado TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id, 
    p.user_id, 
    p.nome, 
    p.setor_vinculado
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE ur.role = 'operador'
    AND p.nome IS NOT NULL
    AND TRIM(p.nome) <> ''
  ORDER BY p.nome;
$$;

GRANT EXECUTE ON FUNCTION public.get_operadores() TO authenticated;
