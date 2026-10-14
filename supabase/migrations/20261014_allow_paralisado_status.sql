-- Permite o status 'paralisado' caso seja enviado diretamente ao banco de dados
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status = ANY (ARRAY[
    'fila_de_entrada'::text,
    'preparando_arquivo'::text,
    'paralisado'::text,
    'operador_2'::text,
    'operador_3'::text,
    'aguardando_prova'::text,
    'aguardando_aprovacao'::text,
    'aguardando_novo_arquivo'::text,
    'arquivo_liberado'::text,
    'rota'::text
  ])
);
