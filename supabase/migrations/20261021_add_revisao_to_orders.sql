-- Migration: 20261021_add_revisao_to_orders.sql
-- Adiciona a coluna revisao na tabela orders para registrar o número da revisão da O.S. (REV2, REV3...) quando retorna para preparação
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS revisao INTEGER DEFAULT 1;
