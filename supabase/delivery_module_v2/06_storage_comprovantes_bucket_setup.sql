-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas (v2 Hardened)
-- Migration 06: Criação do bucket privado e políticas de segurança no Supabase Storage
-- Arquivo: supabase/delivery_module_v2/06_storage_comprovantes_bucket_setup.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- 1. CRIAÇÃO DO BUCKET PRIVADO 'comprovantes-entrega'
-- Limite de 10 MB por arquivo e restrição de tipos MIME declarados.
-- O bucket é estritamente PRIVADO (public = false). Nenhum acesso anônimo é permitido.
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
-- PADRÃO DE CAMINHO OBRIGATÓRIO: comprovantes-entrega/{order_id}/{nome_arquivo}
-- Onde {order_id} DEVE ser um UUID válido de 36 caracteres E CORRESPONDER A UMA O.S. EXISTENTE.

-- 2.1 INSERT (Upload):
-- Equipe interna autorizada pode fazer upload de comprovantes ou documentos exclusivamente
-- em pastas de O.S. reais existentes no sistema (não permite UUIDs arbitrários ou órfãos).
DROP POLICY IF EXISTS "Staff can upload to delivery proofs bucket" ON storage.objects;
CREATE POLICY "Staff can upload to delivery proofs bucket"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'comprovantes-entrega'
    AND COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND storage.filename(name) ~* '\.(jpg|jpeg|png|webp|pdf)$'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id::text = (storage.foldername(name))[1]
    )
  );

-- Entregador ativo pode fazer upload EXCLUSIVAMENTE para a pasta da O.S. que lhe está atribuída
-- Validações estritas de segurança:
-- 1. Chamador possui papel de 'entregador' e está ATIVO no cadastro da transportadora
-- 2. Caminho possui exatamente 1 nível de pasta (impede path traversal ../)
-- 3. Identificador é estritamente um UUID de 36 caracteres
-- 4. Extensão permitida no nome do arquivo (.jpg, .jpeg, .png, .webp, .pdf)
-- 5. A O.S. existe no banco de dados e está SOB CUSTÓDIA DIRETA do entregador autenticado
DROP POLICY IF EXISTS "Drivers can upload proof only to assigned order folder" ON storage.objects;
CREATE POLICY "Drivers can upload proof only to assigned order folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'comprovantes-entrega'
    AND public.get_user_role(auth.uid()) = 'entregador'
    AND EXISTS (
      SELECT 1 FROM public.entregadores e
      WHERE e.user_id = auth.uid() AND e.ativo = true
    )
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND storage.filename(name) ~* '\.(jpg|jpeg|png|webp|pdf)$'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id::text = (storage.foldername(name))[1]
        AND o.entregador_id = auth.uid()
    )
  );

-- 2.2 SELECT (Download / Visualização):
-- Equipe interna (gestão, PCP, faturamento, conferência) visualiza comprovantes armazenados
DROP POLICY IF EXISTS "Staff can view all delivery proofs" ON storage.objects;
CREATE POLICY "Staff can view all delivery proofs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'comprovantes-entrega'
    AND COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

-- Entregador visualiza exclusivamente comprovantes da O.S. que lhe foi atribuída
DROP POLICY IF EXISTS "Drivers can view only assigned order proofs" ON storage.objects;
CREATE POLICY "Drivers can view only assigned order proofs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'comprovantes-entrega'
    AND public.get_user_role(auth.uid()) = 'entregador'
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id::text = (storage.foldername(name))[1]
        AND o.entregador_id = auth.uid()
    )
  );

-- 2.3 UPDATE (Proteção contra adulteração e sobrescrita de comprovantes):
-- Entregadores NÃO POSSUEM permissão de UPDATE (default deny / imutabilidade probatória).
-- Apenas administradores e coordenadores podem renomear ou mover arquivos se estritamente necessário.
DROP POLICY IF EXISTS "Admins and coordinators can update delivery proofs" ON storage.objects;
CREATE POLICY "Admins and coordinators can update delivery proofs"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'comprovantes-entrega'
    AND public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
  )
  WITH CHECK (
    bucket_id = 'comprovantes-entrega'
    AND public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
  );

-- 2.4 DELETE:
-- Apenas administradores e coordenadores podem excluir comprovantes físicos do storage.
-- Entregadores têm privilégio ZERO de exclusão para evitar destruição de canhotos ou evidências.
DROP POLICY IF EXISTS "Admins and coordinators can delete delivery proofs" ON storage.objects;
CREATE POLICY "Admins and coordinators can delete delivery proofs"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'comprovantes-entrega'
    AND public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
  );
