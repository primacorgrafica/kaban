-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas
-- Migration 01: Adiciona o papel 'entregador' ao enum app_role
-- Arquivo: supabase/delivery_module_prep/01_add_role_entregador.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- 1. ADICIONA VALOR AO ENUM COM SEGURANÇA
-- O comando ALTER TYPE ... ADD VALUE no PostgreSQL não pode ser executado
-- dentro de um bloco de transação multi-comando tradicional (COMMIT/ROLLBACK),
-- mas a cláusula IF NOT EXISTS garante idempotência segura.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'entregador';

-- Comentário explicativo no catálogo de tipos
COMMENT ON TYPE public.app_role IS 'Papéis do sistema Kaban: admin, user, coordenador, operador, vendedor, orcamentista, impressor, entregador';
