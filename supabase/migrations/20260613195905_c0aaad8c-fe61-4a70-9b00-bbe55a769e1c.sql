DROP TRIGGER IF EXISTS trg_auto_create_faturamento ON public.orders;
DROP TRIGGER IF EXISTS trg_sync_faturamento ON public.orders;
DROP FUNCTION IF EXISTS public.auto_create_faturamento_order() CASCADE;
DROP FUNCTION IF EXISTS public.sync_faturamento_order() CASCADE;
DELETE FROM public.orders WHERE setor = 'faturamento';