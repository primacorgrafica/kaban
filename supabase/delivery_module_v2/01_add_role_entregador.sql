-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas (v2)
-- Migration 01: Adiciona o papel 'entregador' ao enum app_role
-- Arquivo: supabase/delivery_module_v2/01_add_role_entregador.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- NOTA TÉCNICA OPERACIONAL:
-- No PostgreSQL, a instrução ALTER TYPE ... ADD VALUE não pode ser executada
-- dentro de blocos de transação explícitos (BEGIN ... COMMIT).
-- No Supabase SQL Editor ou CLI de migrações, execute esta instrução
-- como um comando isolado de nível superior (autocommit).

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'entregador';

COMMENT ON TYPE public.app_role IS 'Papéis do sistema Kaban: admin, user, coordenador, operador, vendedor, orcamentista, impressor, entregador';
