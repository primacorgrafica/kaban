-- Migration: 20261103_update_revisao_default_to_zero.sql
-- Altera o valor padrão da coluna revisao para 0 (versão original sem revisão).
-- As revisões passam a contar explicitamente: REV1 (1ª revisão), REV2 (2ª revisão), etc.

ALTER TABLE public.orders ALTER COLUMN revisao SET DEFAULT 0;

-- Atualiza ordens legadas que tinham revisao = 1 por padrão mas nunca tiveram tag de revisão
UPDATE public.orders
SET revisao = 0
WHERE revisao = 1 AND (observacao IS NULL OR observacao NOT ILIKE '%[REV%');
