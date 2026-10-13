
ALTER TABLE public.orders
  ADD COLUMN fat_cnpj_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN fat_retencao_iss_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN fat_retencoes_federais_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN fat_limite_emissao_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN fat_envio_nf_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN fat_ocpp_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN fat_restricao_credito_pendente boolean NOT NULL DEFAULT false;
