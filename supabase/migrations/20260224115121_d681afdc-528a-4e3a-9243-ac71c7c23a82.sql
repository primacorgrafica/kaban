-- Add position column for ordering cards within each status column
ALTER TABLE public.orders ADD COLUMN posicao integer NOT NULL DEFAULT 0;

-- Set initial positions based on creation date
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY status ORDER BY created_at) - 1 AS rn
  FROM public.orders
)
UPDATE public.orders SET posicao = ranked.rn FROM ranked WHERE public.orders.id = ranked.id;