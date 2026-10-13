
-- Create orders table (shared globally, no user_id filter)
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  cliente TEXT NOT NULL,
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_andamento', 'aguardando', 'em_revisao', 'concluido')),
  arquivado BOOLEAN NOT NULL DEFAULT false,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view all orders
CREATE POLICY "Authenticated users can view all orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can create orders
CREATE POLICY "Authenticated users can create orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- All authenticated users can update any order
CREATE POLICY "Authenticated users can update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (true);

-- All authenticated users can delete any order
CREATE POLICY "Authenticated users can delete orders"
  ON public.orders FOR DELETE
  TO authenticated
  USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
