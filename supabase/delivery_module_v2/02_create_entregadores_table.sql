-- ====================================================================
-- Primacor Gráfica - Módulo Gestão e Monitoramento de Entregas (v2)
-- Migration 02: Criação da tabela satélite de entregadores
-- Arquivo: supabase/delivery_module_v2/02_create_entregadores_table.sql
-- Status: PREPARADA PARA REVISÃO (NÃO APLICADA)
-- ====================================================================

-- 1. CRIAÇÃO DA TABELA DEDICADA DE ENTREGADORES
-- Isola atributos específicos da operação logística (veículo, telefone, status de atividade)
-- sem alterar o esquema da tabela profiles e sem expor dados internos sensíveis.
CREATE TABLE IF NOT EXISTS public.entregadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL,
  telefone TEXT,
  placa_veiculo TEXT,
  modelo_veiculo TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('disponivel', 'em_entrega', 'offline')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  precisao_metros REAL,
  velocidade_kmh REAL,
  bateria_percentual INT,
  ultima_atividade TIMESTAMPTZ DEFAULT now(),
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_entregadores_user_id UNIQUE (user_id),
  CONSTRAINT chk_entregadores_latitude CHECK (latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)),
  CONSTRAINT chk_entregadores_longitude CHECK (longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0)),
  CONSTRAINT chk_entregadores_bateria CHECK (bateria_percentual IS NULL OR (bateria_percentual >= 0 AND bateria_percentual <= 100))
);

COMMENT ON TABLE public.entregadores IS 'Tabela satélite dos entregadores com vínculo direto a auth.users e controle de ativação';
COMMENT ON COLUMN public.entregadores.user_id IS 'Chave estrangeira obrigatória e única para auth.users(id)';
COMMENT ON COLUMN public.entregadores.ativo IS 'Flag de controle operacional: entregador inativo é bloqueado em todas as operações';

-- 2. ÍNDICES DE PERFORMANCE E CONSULTA
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

-- Gestores autorizados (admin, coordenador ou colaboradores com módulo entregas/expedição) podem visualizar a frota
DROP POLICY IF EXISTS "Staff can view all drivers" ON public.entregadores;
CREATE POLICY "Staff can view all drivers"
  ON public.entregadores
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin', 'coordenador')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND (
        p.modulos_acesso @> ARRAY['entregas']::text[]
        OR p.modulos_acesso @> ARRAY['gestao_entregas']::text[]
        OR p.modulos_acesso @> ARRAY['expedicao']::text[]
      )
    )
  );

-- O próprio entregador autenticado só visualiza o seu próprio registro
DROP POLICY IF EXISTS "Drivers can view own driver record" ON public.entregadores;
CREATE POLICY "Drivers can view own driver record"
  ON public.entregadores
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- O próprio entregador pode atualizar sua posição GPS e telemetria ao vivo
DROP POLICY IF EXISTS "Drivers can update own live telemetry" ON public.entregadores;
CREATE POLICY "Drivers can update own live telemetry"
  ON public.entregadores
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND ativo = true
  )
  WITH CHECK (
    user_id = auth.uid()
    AND ativo = true
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

-- Apenas administradores e coordenadores podem alterar dados cadastrais de entregadores (ativação, veículo, etc.)
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
ALTER TABLE public.entregadores REPLICA IDENTITY FULL;

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
