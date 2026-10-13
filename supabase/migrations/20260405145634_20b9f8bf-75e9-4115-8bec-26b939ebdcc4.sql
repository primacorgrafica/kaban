-- Create sector_history table to track sector transitions
CREATE TABLE public.sector_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  setor_anterior TEXT,
  setor_novo TEXT,
  setor_status_novo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sector_history ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view sector history"
  ON public.sector_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert sector history"
  ON public.sector_history FOR INSERT TO authenticated WITH CHECK (true);

-- Index for fast lookup by order_id
CREATE INDEX idx_sector_history_order_id ON public.sector_history(order_id);

-- Trigger function to log sector changes
CREATE OR REPLACE FUNCTION public.log_sector_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.setor IS DISTINCT FROM NEW.setor) THEN
    INSERT INTO public.sector_history (order_id, setor_anterior, setor_novo, setor_status_novo)
    VALUES (NEW.id, OLD.setor, NEW.setor, NEW.setor_status);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on orders table
CREATE TRIGGER track_sector_changes
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_sector_change();

-- Backfill: for archived orders that have a setor set, create at least one entry
-- so we have minimal data for existing archived orders
INSERT INTO public.sector_history (order_id, setor_anterior, setor_novo, setor_status_novo, created_at)
SELECT id, NULL, setor, setor_status, 
  COALESCE(
    (SELECT MAX(created_at) FROM order_status_history WHERE order_id = orders.id),
    orders.created_at
  )
FROM orders
WHERE setor IS NOT NULL AND arquivado = true;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sector_history;