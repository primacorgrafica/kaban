CREATE OR REPLACE FUNCTION public.notify_marcelo_on_preimpressao_saida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_recipients uuid[] := ARRAY[
    '4bbfbed7-35cf-4301-b165-308799da633e'::uuid,
    '916f93ad-ae84-4dee-86a4-38bd12daeb0a'::uuid,
    '7d7fc4d0-548d-4976-a324-87e51581110a'::uuid
  ];
  v_recipient uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.setor IS NULL
     AND NEW.status = 'arquivo_liberado' THEN

    FOREACH v_recipient IN ARRAY v_recipients LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.avisos a
        WHERE a.destinatario_id = v_recipient
          AND a.criado_por = COALESCE(NEW.atualizado_por, NEW.criado_por, v_recipient)
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
          COALESCE(NEW.atualizado_por, NEW.criado_por, v_recipient),
          v_recipient
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

DELETE FROM public.avisos_lidos
WHERE aviso_id IN (
  SELECT id FROM public.avisos
  WHERE mensagem = 'PODE SEGUIR'
    AND destinatario_id = '12610a1b-8862-4357-9272-948a35483532'
);

DELETE FROM public.avisos
WHERE mensagem = 'PODE SEGUIR'
  AND destinatario_id = '12610a1b-8862-4357-9272-948a35483532';