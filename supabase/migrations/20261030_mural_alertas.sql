-- Migration: 20261030_mural_alertas.sql
-- Descrição: Criação da tabela mural_alertas para comunicados e avisos globais no topo do Kaban

CREATE TABLE IF NOT EXISTS public.mural_alertas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'urgente',
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  autor_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mural_alertas_ativo_created ON public.mural_alertas(ativo, created_at DESC);

ALTER TABLE public.mural_alertas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos autenticados podem ver mural_alertas" ON public.mural_alertas;
CREATE POLICY "Todos autenticados podem ver mural_alertas"
  ON public.mural_alertas
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Usuarios autenticados podem gerenciar mural_alertas" ON public.mural_alertas;
CREATE POLICY "Usuarios autenticados podem gerenciar mural_alertas"
  ON public.mural_alertas
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Habilita Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'mural_alertas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mural_alertas;
  END IF;
END $$;

-- Garante política de UPDATE na tabela avisos para compatibilidade com fallback do mural
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'avisos'
    AND policyname = 'Admins can update avisos'
  ) THEN
    CREATE POLICY "Admins can update avisos" ON public.avisos
      FOR UPDATE TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
