
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fat_cnpj_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_cnpj_obs text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fat_retencao_iss_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_retencao_iss_obs text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fat_retencoes_federais_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_retencoes_federais_obs text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fat_limite_emissao_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_limite_emissao_obs text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fat_envio_nf_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_envio_nf_obs text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fat_ocpp_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_ocpp_obs text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fat_restricao_credito_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fat_restricao_credito_obs text DEFAULT NULL;
