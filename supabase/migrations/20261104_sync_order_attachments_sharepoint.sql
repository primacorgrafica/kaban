-- ====================================================================
-- Primacor Gráfica - Kaban: Resiliência e Auto-Sincronização de Anexos SharePoint
-- Migration: 20261104_sync_order_attachments_sharepoint.sql
-- ====================================================================

-- 1. Garante colunas de pastas do SharePoint na tabela orders
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS sharepoint_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS sharepoint_folder_url TEXT,
  ADD COLUMN IF NOT EXISTS sharepoint_folder_name TEXT;

-- 2. Garante estrutura completa da tabela order_attachments
CREATE TABLE IF NOT EXISTS public.order_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  tamanho_bytes BIGINT NOT NULL DEFAULT 0,
  content_type TEXT,
  sharepoint_item_id TEXT NOT NULL,
  sharepoint_folder_id TEXT NOT NULL,
  sharepoint_folder_name TEXT NOT NULL,
  sharepoint_drive_id TEXT NOT NULL,
  sharepoint_site_id TEXT,
  sharepoint_web_url TEXT NOT NULL,
  sharepoint_path TEXT,
  status TEXT NOT NULL DEFAULT 'concluido' CHECK (status IN ('uploading', 'concluido', 'falha')),
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Índices de busca rápida por O.S., pasta e item do SharePoint
CREATE INDEX IF NOT EXISTS idx_order_attachments_order_id ON public.order_attachments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_attachments_sharepoint_folder ON public.order_attachments(sharepoint_folder_name);
CREATE INDEX IF NOT EXISTS idx_order_attachments_sharepoint_item_id ON public.order_attachments(sharepoint_item_id);
CREATE INDEX IF NOT EXISTS idx_order_attachments_created_at ON public.order_attachments(created_at DESC);

-- 4. Habilita RLS
ALTER TABLE public.order_attachments ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS permissivas para operadores e administradores autenticados
DROP POLICY IF EXISTS "Authenticated users can view order attachments" ON public.order_attachments;
CREATE POLICY "Authenticated users can view order attachments" 
  ON public.order_attachments 
  FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert order attachments" ON public.order_attachments;
CREATE POLICY "Authenticated users can insert order attachments" 
  ON public.order_attachments 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update order attachments" ON public.order_attachments;
CREATE POLICY "Authenticated users can update order attachments" 
  ON public.order_attachments 
  FOR UPDATE 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins coordinators or uploader can delete order attachments" ON public.order_attachments;
CREATE POLICY "Admins coordinators or uploader can delete order attachments" 
  ON public.order_attachments 
  FOR DELETE 
  TO authenticated 
  USING (
    auth.uid() = criado_por 
    OR public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
  );

-- 6. RPC para auto-sincronização de anexos do SharePoint com garantia de integridade
CREATE OR REPLACE FUNCTION public.sync_order_attachment(
  p_order_id UUID,
  p_nome_arquivo TEXT,
  p_tamanho_bytes BIGINT,
  p_content_type TEXT,
  p_sharepoint_item_id TEXT,
  p_sharepoint_folder_id TEXT,
  p_sharepoint_folder_name TEXT,
  p_sharepoint_drive_id TEXT,
  p_sharepoint_site_id TEXT,
  p_sharepoint_web_url TEXT,
  p_sharepoint_path TEXT,
  p_criado_por UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attachment_id UUID;
BEGIN
  -- Verifica se já existe anexo com mesmo sharepoint_item_id ou mesmo nome para esta O.S.
  SELECT id INTO v_attachment_id
  FROM public.order_attachments
  WHERE order_id = p_order_id
    AND (sharepoint_item_id = p_sharepoint_item_id OR lower(trim(nome_arquivo)) = lower(trim(p_nome_arquivo)))
  LIMIT 1;

  IF v_attachment_id IS NOT NULL THEN
    -- Atualiza metadados existentes
    UPDATE public.order_attachments
    SET
      sharepoint_item_id = p_sharepoint_item_id,
      sharepoint_web_url = p_sharepoint_web_url,
      sharepoint_folder_id = p_sharepoint_folder_id,
      sharepoint_folder_name = p_sharepoint_folder_name,
      sharepoint_drive_id = p_sharepoint_drive_id,
      sharepoint_site_id = p_sharepoint_site_id,
      tamanho_bytes = p_tamanho_bytes,
      content_type = p_content_type,
      updated_at = now()
    WHERE id = v_attachment_id;
    RETURN v_attachment_id;
  END IF;

  -- Insere novo registro de anexo
  INSERT INTO public.order_attachments (
    order_id,
    nome_arquivo,
    tamanho_bytes,
    content_type,
    sharepoint_item_id,
    sharepoint_folder_id,
    sharepoint_folder_name,
    sharepoint_drive_id,
    sharepoint_site_id,
    sharepoint_web_url,
    sharepoint_path,
    status,
    criado_por,
    created_at,
    updated_at
  ) VALUES (
    p_order_id,
    p_nome_arquivo,
    p_tamanho_bytes,
    p_content_type,
    p_sharepoint_item_id,
    p_sharepoint_folder_id,
    p_sharepoint_folder_name,
    p_sharepoint_drive_id,
    p_sharepoint_site_id,
    p_sharepoint_web_url,
    p_sharepoint_path,
    'concluido',
    COALESCE(p_criado_por, auth.uid()),
    now(),
    now()
  )
  RETURNING id INTO v_attachment_id;

  RETURN v_attachment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_order_attachment TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_order_attachment TO anon;

-- 7. Realtime na tabela order_attachments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'order_attachments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_attachments;
  END IF;
END $$;
