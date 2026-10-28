-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas (v2 Hardened)
-- Script de Reversão / Rollback Controlado e Seguro
-- Arquivo: supabase/delivery_module_v2/rollback_delivery_module.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- ####################################################################
-- MODO 1: DESATIVAÇÃO FUNCIONAL SEGURA (RECOMENDADO EM PRODUÇÃO)
-- --------------------------------------------------------------------
-- OBJETIVO:
-- Suspender imediatamente e de forma definitiva a operação dos entregadores,
-- preservando 100% da integridade de dados e garantindo que as contas de
-- motoboys existentes NÃO HERDEM acesso amplo ou irrestrito ao sistema.
--
-- PRINCÍPIO CRÍTICO DE SEGURANÇA (AUDITORIA V2):
-- Nunca restaurar políticas permissivas legadas como 'USING (true)' ou
-- 'WITH CHECK (auth.uid() IS NOT NULL)' sem o filtro restritivo de papel.
-- Políticas permissivas no PostgreSQL são combinadas via OR. Restaurar
-- 'USING (true)' permitiria que qualquer conta de motoboy existente
-- visualizasse dados financeiros, notas fiscais e ordens de todos os clientes.
--
-- GARANTIA DE DADOS:
-- - NÃO remove tabelas (entregadores, entregador_posicoes permanecem intactas).
-- - NÃO remove colunas na tabela orders.
-- - NÃO remove arquivos ou comprovantes do bucket do Storage.
-- - NÃO altera históricos de status (order_status_history, sector_history).
-- - Preserva todas as informações fiscais, logísticas e auditorias.
-- ####################################################################

-- 1.1 Desativação cadastral e operacional imediata de todos os entregadores
UPDATE public.entregadores 
SET ativo = false, updated_at = now();

-- 1.2 Revogação imediata de privilégios de execução das RPCs do módulo
REVOKE EXECUTE ON FUNCTION public.driver_update_delivery_status(UUID, TEXT, TEXT, TEXT, TEXT) FROM authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.manager_assign_delivery_driver(UUID, UUID, INT) FROM authenticated, PUBLIC;

-- 1.3 Remoção do trigger de proteção operacional de entregadores
DROP TRIGGER IF EXISTS trg_guard_order_driver_tampering ON public.orders;
DROP FUNCTION IF EXISTS public.guard_order_driver_tampering();

-- 1.4 Bloqueio total de acesso dos motoboys ao Storage (sem deletar arquivos ou o bucket)
DROP POLICY IF EXISTS "Drivers can upload proof only to assigned order folder" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can view only assigned order proofs" ON storage.objects;
-- Equipe interna mantém acesso aos comprovantes já armazenados para auditoria
-- (As políticas "Staff can view all delivery proofs" e "Admins and coordinators can delete delivery proofs" permanecem ativas).

-- 1.5 Restauração de políticas seguras na tabela public.orders
-- Remove políticas de entregadores e políticas temporárias
DROP POLICY IF EXISTS "Drivers can view only assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can create orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;

-- RESTAURA POLÍTICAS RESTRITAS PARA EQUIPE INTERNA (PCP, Produção, Faturamento, etc.)
-- O filtro '!= entregador' GARANTE que nenhuma conta de entregador acesse os dados.
CREATE POLICY "Staff can view all orders" 
  ON public.orders FOR SELECT TO authenticated 
  USING (COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador');

CREATE POLICY "Staff can create orders" 
  ON public.orders FOR INSERT TO authenticated 
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

CREATE POLICY "Staff can update orders" 
  ON public.orders FOR UPDATE TO authenticated 
  USING (
    auth.uid() IS NOT NULL 
    AND COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

-- (Nota: A política "Admins and coordinators can delete orders" permanece ativa).

-- 1.6 Restauração de políticas seguras na tabela public.order_attachments
DROP POLICY IF EXISTS "Drivers can view only assigned order attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Drivers can insert attachments for assigned order" ON public.order_attachments;
DROP POLICY IF EXISTS "Staff can view all attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Staff can insert attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Staff can update attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Staff can delete attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Authenticated users can view order attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Authenticated users can insert order attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Authenticated users can update order attachments" ON public.order_attachments;
DROP POLICY IF EXISTS "Admins coordinators or uploader can delete order attachments" ON public.order_attachments;

-- Equipe interna mantém controle total; entregadores perdem 100% de acesso a anexos
CREATE POLICY "Staff can view all attachments" 
  ON public.order_attachments FOR SELECT TO authenticated 
  USING (COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador');

CREATE POLICY "Staff can insert attachments" 
  ON public.order_attachments FOR INSERT TO authenticated 
  WITH CHECK (COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador');

CREATE POLICY "Staff can update attachments" 
  ON public.order_attachments FOR UPDATE TO authenticated 
  USING (COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador')
  WITH CHECK (COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador');

CREATE POLICY "Staff can delete attachments" 
  ON public.order_attachments FOR DELETE TO authenticated 
  USING (
    COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
    AND (
      auth.uid() = criado_por 
      OR public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
    )
  );


-- ####################################################################
-- MODO 2: RECUPERAÇÃO EMERGENCIAL DE ACESSO (SUSPENSÃO DE CREDENCIAIS)
-- --------------------------------------------------------------------
-- Caso seja necessária a invalidação sumária de todas as credenciais de
-- entregadores para impedir autenticação no Auth (ex: incidente de segurança):
--
-- EXECUÇÃO MANUAL POR ADMINISTRADOR (OPCIONAL):
-- UPDATE auth.users 
-- SET banned_until = '2099-01-01 00:00:00+00' 
-- WHERE id IN (SELECT user_id FROM public.entregadores);
-- ####################################################################


-- ####################################################################
-- MODO 3: REVERSÃO ESTRUTURAL COMPLETA (EXCLUSIVO PARA TESTES EM HOMOLOGAÇÃO)
-- --------------------------------------------------------------------
-- AVISO CRÍTICO DE RISCO DE PERDA DE DADOS:
-- A reversão estrutural (DROP TABLE, DROP COLUMN) é TERMINANTEMENTE PROIBIDA
-- em ambientes de produção com dados cadastrados.
-- O bloco de proteção abaixo aborta a execução se encontrar qualquer registro.
-- ####################################################################

/*
-- FUSÍVEL DE SEGURANÇA: Bloqueia execução se houver dados reais
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders WHERE entregador_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.entregador_posicoes LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.entregadores LIMIT 1) THEN
    RAISE EXCEPTION 'ERRO DE SEGURANÇA: Existem registros de entregas, entregadores ou GPS gravados. O Modo 3 causa perda destrutiva de dados. Utilize exclusivamente o Modo 1 (Desativação Funcional).';
  END IF;
END $$;

-- 3.1 Remove políticas do Storage e o bucket de comprovantes
DROP POLICY IF EXISTS "Staff can upload to delivery proofs bucket" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can upload proof only to assigned order folder" ON storage.objects;
DROP POLICY IF EXISTS "Staff can view all delivery proofs" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can view only assigned order proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins and coordinators can update delivery proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins and coordinators can delete delivery proofs" ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'comprovantes-entrega';

-- 3.2 Remove tabela de telemetria GPS e função de purga
DROP TABLE IF EXISTS public.entregador_posicoes CASCADE;
DROP FUNCTION IF EXISTS public.purge_old_delivery_positions(INT);

-- 3.3 Remove colunas adicionadas na tabela orders
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS entregador_id CASCADE,
  DROP COLUMN IF EXISTS status_entrega CASCADE,
  DROP COLUMN IF EXISTS ordem_parada CASCADE,
  DROP COLUMN IF EXISTS data_saida_entrega CASCADE,
  DROP COLUMN IF EXISTS data_chegada_entrega CASCADE,
  DROP COLUMN IF EXISTS motivo_insucesso CASCADE,
  DROP COLUMN IF EXISTS status_comprovante_sync CASCADE;

-- 3.4 Remove tabela satélite de entregadores
DROP TABLE IF EXISTS public.entregadores CASCADE;

-- NOTA TÉCNICA: Valores de ENUM (app_role 'entregador') não suportam DROP VALUE
-- no PostgreSQL sem recriação do tipo. Permanece inócuo.
*/
