-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas
-- Script de Reversão / Rollback Controlado
-- Arquivo: supabase/delivery_module_prep/rollback_delivery_module.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- ####################################################################
-- MODO 1: DESATIVAÇÃO FUNCIONAL SEGURA (RECOMENDADO EM PRODUÇÃO)
-- Este modo suspende o acesso dos motoboys e restaura as políticas
-- originais do Kaban SEM EXCLUIR NENHUM DADO, histórico ou comprovante.
-- ####################################################################

-- 1.1 Desativa todos os entregadores para impedir qualquer chamada
UPDATE public.entregadores SET ativo = false;

-- 1.2 Revoga permissão de execução das RPCs de entrega
REVOKE EXECUTE ON FUNCTION public.driver_update_delivery_status(UUID, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.manager_assign_delivery_driver(UUID, UUID, INT) FROM authenticated;

-- 1.3 Remove trigger de validação
DROP TRIGGER IF EXISTS trg_guard_order_driver_tampering ON public.orders;
DROP FUNCTION IF EXISTS public.guard_order_driver_tampering();

-- 1.4 Restaura políticas originais em public.orders
DROP POLICY IF EXISTS "Staff can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Drivers can view only assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can create orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;

CREATE POLICY "Authenticated users can view all orders" 
  ON public.orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create orders" 
  ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update orders" 
  ON public.orders FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 1.5 Restaura políticas originais em public.order_attachments
DROP POLICY IF EXISTS "Staff can view all attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Drivers can view only assigned order attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Staff can insert attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Drivers can insert attachments for assigned order" ON public.order_attachments;

CREATE POLICY "Authenticated users can view order attachments" 
  ON public.order_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert order attachments" 
  ON public.order_attachments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update order attachments" 
  ON public.order_attachments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- ####################################################################
-- MODO 2: REVERSÃO ESTRUTURAL COMPLETA (APENAS PARA AMBIENTE DE TESTES)
-- ATENÇÃO: NÃO EXECUTE EM PRODUÇÃO SE JÁ HOUVER DADOS DE ENTREGA REAIS!
-- ####################################################################
/*
-- 2.1 Remove políticas do Storage e o bucket de comprovantes
DROP POLICY IF EXISTS "Staff can upload to delivery proofs bucket" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can upload proof only to assigned order folder" ON storage.objects;
DROP POLICY IF EXISTS "Staff can view all delivery proofs" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can view only assigned order proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins and coordinators can delete delivery proofs" ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'comprovantes-entrega';

-- 2.2 Remove tabela de telemetria GPS
DROP TABLE IF EXISTS public.entregador_posicoes CASCADE;
DROP FUNCTION IF EXISTS public.purge_old_delivery_positions(INT);

-- 2.3 Remove colunas adicionadas na tabela orders
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS entregador_id CASCADE,
  DROP COLUMN IF EXISTS status_entrega CASCADE,
  DROP COLUMN IF EXISTS ordem_parada CASCADE,
  DROP COLUMN IF EXISTS data_saida_entrega CASCADE,
  DROP COLUMN IF EXISTS data_chegada_entrega CASCADE,
  DROP COLUMN IF EXISTS motivo_insucesso CASCADE,
  DROP COLUMN IF EXISTS status_comprovante_sync CASCADE;

-- 2.4 Remove tabela de entregadores
DROP TABLE IF EXISTS public.entregadores CASCADE;

-- NOTA SOBRE ENUMS: No PostgreSQL, valores adicionados a um ENUM (ex: 'entregador')
-- não podem ser removidos diretamente via DROP VALUE, mas tornam-se inócuos
-- se nenhuma tabela ou role os utilizar.
*/
