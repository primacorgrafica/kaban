ALTER TABLE public.orders
  ADD COLUMN urgente boolean NOT NULL DEFAULT false,
  ADD COLUMN prazo timestamptz DEFAULT null;

-- Migrate existing alta priority to urgente
UPDATE public.orders SET urgente = true WHERE prioridade = 'alta';