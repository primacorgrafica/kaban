
-- Table to log every status change with timestamps
CREATE TABLE public.order_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  alterado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view status history"
  ON public.order_status_history FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert status history"
  ON public.order_status_history FOR INSERT
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_history;

-- Trigger to automatically log status changes on orders
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- On INSERT, log the initial status
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history (order_id, status_anterior, status_novo, alterado_por)
    VALUES (NEW.id, NULL, NEW.status, NEW.criado_por);
    RETURN NEW;
  END IF;

  -- On UPDATE, log only if status changed
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.order_status_history (order_id, status_anterior, status_novo, alterado_por)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.atualizado_por);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_log_order_status_change
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_order_status_change();
