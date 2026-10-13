ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status = ANY (ARRAY[
    'fila_de_entrada',
    'preparando_arquivo',
    'operador_2',
    'operador_3',
    'aguardando_prova',
    'aguardando_aprovacao',
    'aguardando_novo_arquivo',
    'arquivo_liberado',
    'rota'
  ])
);