-- ====================================================================
-- Primacor Gráfica - Integração SharePoint Corporativo
-- Migration: 20261015_create_order_attachments.sql
-- Tabela de metadados de anexos das Ordens de Serviço vinculadas ao SharePoint
-- ====================================================================

-- 1. ADICIONA CAMPOS DA PASTA DO SHAREPOINT NA TABELA ORDERS
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS sharepoint_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS sharepoint_folder_url TEXT,
  ADD COLUMN IF NOT EXISTS sharepoint_folder_name TEXT;

-- 2. CRIA A TABELA DE METADADOS DE ANEXOS DA OS
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

-- 3. ÍNDICES DE ALTA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_order_attachments_order_id ON public.order_attachments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_attachments_created_at ON public.order_attachments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_attachments_sharepoint_item_id ON public.order_attachments(sharepoint_item_id);

-- 4. TRIGGER PARA ATUALIZAR AUTOMATICAMENTE updated_at
DROP TRIGGER IF EXISTS update_order_attachments_updated_at ON public.order_attachments;
CREATE TRIGGER update_order_attachments_updated_at
  BEFORE UPDATE ON public.order_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. HABILITA ROW LEVEL SECURITY (RLS)
ALTER TABLE public.order_attachments ENABLE ROW LEVEL SECURITY;

-- 6. POLÍTICAS DE SEGURANÇA (RLS)
-- Todos os usuários autenticados do Kaban podem visualizar anexos de O.S.
DROP POLICY IF EXISTS "Authenticated users can view order attachments" ON public.order_attachments;
CREATE POLICY "Authenticated users can view order attachments" 
  ON public.order_attachments 
  FOR SELECT 
  TO authenticated 
  USING (true);

-- Todos os usuários autenticados podem inserir novos anexos de O.S.
DROP POLICY IF EXISTS "Authenticated users can insert order attachments" ON public.order_attachments;
CREATE POLICY "Authenticated users can insert order attachments" 
  ON public.order_attachments 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- Usuários autenticados podem atualizar metadados de anexos (ex: status)
DROP POLICY IF EXISTS "Authenticated users can update order attachments" ON public.order_attachments;
CREATE POLICY "Authenticated users can update order attachments" 
  ON public.order_attachments 
  FOR UPDATE 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);

-- Apenas o criador do anexo ou administradores/coordenadores podem excluir anexos
DROP POLICY IF EXISTS "Admins coordinators or uploader can delete order attachments" ON public.order_attachments;
CREATE POLICY "Admins coordinators or uploader can delete order attachments" 
  ON public.order_attachments 
  FOR DELETE 
  TO authenticated 
  USING (
    auth.uid() = criado_por 
    OR public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
  );

-- 7. HABILITA REALTIME NA TABELA DE ANEXOS
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
