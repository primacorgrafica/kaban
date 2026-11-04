-- ====================================================================
-- PRIMACOR - KABAN: SINCRONIZAÇÃO DE VENDEDORES COM PERFIS REAIS
-- Corrige "Wellington" para "well" e remove "Primacor" da lista de vendedores
-- ====================================================================

-- 1. Remove qualquer registro inválido que não seja um vendedor real
DELETE FROM public.vendedores
WHERE LOWER(TRIM(nome)) IN ('primacor', 'wellington');

-- 2. Insere/atualiza os 5 vendedores reais vinculados aos seus user_ids e perfis
INSERT INTO public.vendedores (id, nome, email, user_id)
VALUES
  ('3011f0f8-e3a7-4ba7-9d9c-11a39614bd60', 'Bianca', 'bianca@primacorgrafica.com.br', '3011f0f8-e3a7-4ba7-9d9c-11a39614bd60'),
  ('8713c922-2c4c-419e-ae73-0bc1c9ea989f', 'deborah', 'deborah@primacorgrafica.com.br', '8713c922-2c4c-419e-ae73-0bc1c9ea989f'),
  ('dfcf8a88-b38f-4fa8-af2b-c36f69e56df2', 'Ozeas', 'ozeas@primacorgrafica.com.br', 'dfcf8a88-b38f-4fa8-af2b-c36f69e56df2'),
  ('09dfa978-8d68-47aa-8a81-14e9c6891ca1', 'Ronaldo', 'ronaldo@primacorgrafica.com.br', '09dfa978-8d68-47aa-8a81-14e9c6891ca1'),
  ('cac0c4fa-f98f-47fa-b16d-61a3e23e4408', 'well', 'well@primacorgrafica.com.br', 'cac0c4fa-f98f-47fa-b16d-61a3e23e4408')
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  email = EXCLUDED.email,
  user_id = EXCLUDED.user_id;

-- 3. Atualiza O.S. existentes gravadas anteriormente como Wellington para well
UPDATE public.ordens_de_servico
SET vendedor = 'well'
WHERE LOWER(TRIM(vendedor)) = 'wellington';

-- 4. Atualiza Oportunidades do CRM existentes gravadas como Wellington para well
UPDATE public.crm_opportunities
SET vendedor_responsavel = 'well'
WHERE LOWER(TRIM(vendedor_responsavel)) = 'wellington';

-- 5. Criação da RPC get_vendedores com SECURITY DEFINER
-- Garante que o frontend sempre consulte diretamente a lista de perfis reais
-- cujo papel (user_roles) seja 'vendedor'
CREATE OR REPLACE FUNCTION public.get_vendedores()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  nome TEXT,
  email TEXT
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
    p.email
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE ur.role = 'vendedor'
    AND p.nome IS NOT NULL
    AND TRIM(p.nome) <> ''
    AND LOWER(TRIM(p.nome)) <> 'primacor'
  ORDER BY p.nome;
$$;

GRANT EXECUTE ON FUNCTION public.get_vendedores() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendedores() TO anon;
