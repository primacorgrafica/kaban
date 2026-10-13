-- Update default status for new orders to 'fila_de_entrada'
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'fila_de_entrada';