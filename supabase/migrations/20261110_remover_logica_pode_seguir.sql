-- ====================================================================
-- Primacor Gráfica - Remoção da Lógica de Aviso 'PODE SEGUIR'
-- Migration: 20261110_remover_logica_pode_seguir.sql
-- Descrição:
--   1. Remove o trigger trg_notify_marcelo_on_preimpressao_saida da tabela public.orders
--   2. Remove a função plpgsql public.notify_marcelo_on_preimpressao_saida()
--   3. Limpa todos os registros residuais de 'PODE SEGUIR' das tabelas avisos e avisos_lidos
-- ====================================================================

-- 1. Remove o trigger que disparava na mudança de status para 'arquivo_liberado' (Saída)
DROP TRIGGER IF EXISTS trg_notify_marcelo_on_preimpressao_saida ON public.orders;

-- 2. Remove a função associada
DROP FUNCTION IF EXISTS public.notify_marcelo_on_preimpressao_saida();

-- 3. Limpa avisos e leituras residuais de 'PODE SEGUIR'
DELETE FROM public.avisos_lidos
WHERE aviso_id IN (
  SELECT id FROM public.avisos
  WHERE mensagem = 'PODE SEGUIR'
     OR mensagem ILIKE '%PODE SEGUIR%'
);

DELETE FROM public.avisos
WHERE mensagem = 'PODE SEGUIR'
   OR mensagem ILIKE '%PODE SEGUIR%';
