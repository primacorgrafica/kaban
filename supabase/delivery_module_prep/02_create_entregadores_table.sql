-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas
-- Migration 02: Criação da tabela satélite de entregadores
-- Arquivo: supabase/delivery_module_prep/02_create_entregadores_table.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- 1. CRIAÇÃO DA TABELA DEDICADA DE ENTREGADORES
-- Isola atributos de motoboy/veículo sem alterar o esquema da tabela profiles.
CREATE TABLE IF NOT EXISTS public.entregadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  nome_completo TEXT NOT NULL,
  telefone TEXT,
  placa_veiculo TEXT,
  modelo_veiculo TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_entregadores_user_id ON public.entregadores(user_id);
CREATE INDEX IF NOT EXISTS idx_entregadores_ativo ON public.entregadores(ativo);

-- 3. TRIGGER AUTOMÁTICO DE updated_at
DROP TRIGGER IF EXISTS update_entregadores_updated_at ON public.entregadores;
CREATE TRIGGER update_entregadores_updated_at
  BEFORE UPDATE ON public.entregadores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
ALTER TABLE public.entregadores ENABLE ROW LEVEL SECURITY;

-- 5. POLÍTICAS DE RLS EM public.entregadores
-- Equipe interna pode consultar todos os entregadores
DROP POLICY IF EXISTS "Staff can view all drivers" ON public.entregadores;
CREATE POLICY "Staff can view all drivers"
  ON public.entregadores
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(public.get_user_role(auth.uid()), 'user') != 'entregador'
  );

-- O próprio entregador só visualiza seu próprio cadastro
DROP POLICY IF EXISTS "Drivers can view own driver record" ON public.entregadores;
CREATE POLICY "Drivers can view own driver record"
  ON public.entregadores
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- Apenas administradores e coordenadores podem cadastrar entregadores
DROP POLICY IF EXISTS "Admins and coordinators can insert drivers" ON public.entregadores;
CREATE POLICY "Admins and coordinators can insert drivers"
  ON public.entregadores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
  );

-- Apenas administradores e coordenadores podem editar ou ativar/desativar entregadores
DROP POLICY IF EXISTS "Admins and coordinators can update drivers" ON public.entregadores;
CREATE POLICY "Admins and coordinators can update drivers"
  ON public.entregadores
  FOR UPDATE
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
  )
  WITH CHECK (
    public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
  );

-- Apenas administradores podem excluir registros físicos de entregador
DROP POLICY IF EXISTS "Admins can delete drivers" ON public.entregadores;
CREATE POLICY "Admins can delete drivers"
  ON public.entregadores
  FOR DELETE
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'admin'
  );

-- 6. HABILITAÇÃO DO SUPABASE REALTIME
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'entregadores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.entregadores;
  END IF;
END $$;
