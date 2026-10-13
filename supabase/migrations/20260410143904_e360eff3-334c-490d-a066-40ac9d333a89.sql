CREATE OR REPLACE FUNCTION public.notify_marcelo_on_preimpressao_saida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marcelo_user_id uuid := '4bbfbed7-35cf-4301-b165-308799da633e';
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.setor IS NULL
     AND NEW.status = 'arquivo_liberado' THEN

    IF NOT EXISTS (
      SELECT 1
      FROM public.avisos a
      WHERE a.destinatario_id = v_marcelo_user_id
        AND a.criado_por = COALESCE(NEW.atualizado_por, NEW.criado_por, v_marcelo_user_id)
        AND a.titulo = CONCAT('OS ', NEW.titulo, ' - ', NEW.cliente)
        AND a.mensagem = 'PODE SEGUIR'
        AND a.tipo = 'lembrete'
        AND a.created_at >= (now() - interval '10 minutes')
    ) THEN
      INSERT INTO public.avisos (titulo, mensagem, tipo, criado_por, destinatario_id)
      VALUES (
        CONCAT('OS ', NEW.titulo, ' - ', NEW.cliente),
        'PODE SEGUIR',
        'lembrete',
        COALESCE(NEW.atualizado_por, NEW.criado_por, v_marcelo_user_id),
        v_marcelo_user_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_marcelo_on_preimpressao_saida ON public.orders;

CREATE TRIGGER trg_notify_marcelo_on_preimpressao_saida
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_marcelo_on_preimpressao_saida();