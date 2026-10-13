
-- Update CHECK constraint for new status values
ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('preparando_arquivo', 'aguardando_prova', 'aguardando_aprovacao', 'aguardando_novo_arquivo', 'arquivo_liberado'));

-- Migrate existing data to new statuses
UPDATE public.orders SET status = 'preparando_arquivo' WHERE status = 'novo';
UPDATE public.orders SET status = 'aguardando_prova' WHERE status = 'em_andamento';
UPDATE public.orders SET status = 'aguardando_aprovacao' WHERE status = 'aguardando';
UPDATE public.orders SET status = 'aguardando_novo_arquivo' WHERE status = 'em_revisao';
UPDATE public.orders SET status = 'arquivo_liberado' WHERE status = 'concluido';

-- Update default
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'preparando_arquivo';
