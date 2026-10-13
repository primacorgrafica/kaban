ALTER TABLE public.orders
  ADD COLUMN destinatario text DEFAULT null,
  ADD COLUMN entregue_para text DEFAULT null,
  ADD COLUMN entregue_em timestamptz DEFAULT null;