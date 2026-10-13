
-- Tabela de vendedores
CREATE TABLE public.vendedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view vendedores" ON public.vendedores
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert vendedores" ON public.vendedores
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update vendedores" ON public.vendedores
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete vendedores" ON public.vendedores
  FOR DELETE TO authenticated USING (true);

-- Tabela de equipamentos
CREATE TABLE public.equipamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.equipamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view equipamentos" ON public.equipamentos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert equipamentos" ON public.equipamentos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update equipamentos" ON public.equipamentos
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete equipamentos" ON public.equipamentos
  FOR DELETE TO authenticated USING (true);

-- Novas colunas na tabela orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vendedor text,
  ADD COLUMN IF NOT EXISTS tipo_trabalho text,
  ADD COLUMN IF NOT EXISTS equipamentos text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS acabamentos text[] DEFAULT '{}';
