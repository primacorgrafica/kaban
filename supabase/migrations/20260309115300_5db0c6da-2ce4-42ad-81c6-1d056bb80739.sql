ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS setor text DEFAULT null,
  ADD COLUMN IF NOT EXISTS setor_status text DEFAULT 'entrada',
  ADD COLUMN IF NOT EXISTS maquina text DEFAULT null;