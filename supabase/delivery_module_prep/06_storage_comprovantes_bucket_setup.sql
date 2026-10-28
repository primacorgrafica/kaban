-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas
-- Migration 06: Criação do bucket privado e políticas de segurança no Supabase Storage
-- Arquivo: supabase/delivery_module_prep/06_storage_comprovantes_bucket_setup.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- 1. CRIAÇÃO DO BUCKET PRIVADO 'comprovantes-entrega'
-- Limite de 10 MB por arquivo e tipos restritos a imagens e PDF
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprovantes-entrega',
  'comprovantes-entrega',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- 2. POLÍTICAS DE RLS EM storage.objects
-- Convenção obrigatória de caminho: comprovantes-entrega/{order_id}/{nome_arquivo}

-- 2.1 INSERT (Upload):
DROP POLICY IF EXISTS "Staff can upload to delivery proofs bucket" ON storage.objects;
CREATE POLICY "Staff can upload to delivery proofs bucket"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'comprovantes-entrega'
    AND COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

DROP POLICY IF EXISTS "Drivers can upload proof only to assigned order folder" ON storage.objects;
CREATE POLICY "Drivers can upload proof only to assigned order folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'comprovantes-entrega'
    AND public.get_user_role(auth.uid()) = 'entregador'
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id::text = (storage.foldername(name))[1]
        AND orders.entregador_id = auth.uid()
    )
  );

-- 2.2 SELECT (Download / Visualização):
DROP POLICY IF EXISTS "Staff can view all delivery proofs" ON storage.objects;
CREATE POLICY "Staff can view all delivery proofs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'comprovantes-entrega'
    AND COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

DROP POLICY IF EXISTS "Drivers can view only assigned order proofs" ON storage.objects;
CREATE POLICY "Drivers can view only assigned order proofs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'comprovantes-entrega'
    AND public.get_user_role(auth.uid()) = 'entregador'
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id::text = (storage.foldername(name))[1]
        AND orders.entregador_id = auth.uid()
    )
  );

-- 2.3 DELETE:
-- Apenas administradores e coordenadores podem excluir comprovantes físicos
DROP POLICY IF EXISTS "Admins and coordinators can delete delivery proofs" ON storage.objects;
CREATE POLICY "Admins and coordinators can delete delivery proofs"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'comprovantes-entrega'
    AND public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
  );
