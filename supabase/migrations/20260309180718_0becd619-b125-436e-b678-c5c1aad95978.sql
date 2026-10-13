
-- Update existing orders: replace old acabamento names with simplified versions
UPDATE orders SET acabamentos = array_replace(acabamentos, 'CORTE/VINCO - ROSSET F2', 'CORTE/VINCO') WHERE acabamentos @> ARRAY['CORTE/VINCO - ROSSET F2'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'CORTE/VINCO - CV 2 (NOVA)', 'CORTE/VINCO') WHERE acabamentos @> ARRAY['CORTE/VINCO - CV 2 (NOVA)'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'ALCEAMENTO - SPF 200A', 'ALCEAMENTO') WHERE acabamentos @> ARRAY['ALCEAMENTO - SPF 200A'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'ALCEAMENTO - SOMENTE INTERCALAÇÃO', 'INTERCALAÇÃO') WHERE acabamentos @> ARRAY['ALCEAMENTO - SOMENTE INTERCALAÇÃO'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'DOBRA - TITAN 490B', 'DOBRA') WHERE acabamentos @> ARRAY['DOBRA - TITAN 490B'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'CAPA-DURA - CASEMAKER 450', 'CAPA-DURA') WHERE acabamentos @> ARRAY['CAPA-DURA - CASEMAKER 450'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'LAMINAÇÃO - PSG 680D', 'LAMINAÇÃO') WHERE acabamentos @> ARRAY['LAMINAÇÃO - PSG 680D'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'LAMINAÇÃO - THINKER SKBF 950', 'LAMINAÇÃO') WHERE acabamentos @> ARRAY['LAMINAÇÃO - THINKER SKBF 950'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'COLA - BABY BINDER SS', 'COLA') WHERE acabamentos @> ARRAY['COLA - BABY BINDER SS'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'PLOTTER - CG-60 SRIII AUTOCUTTER A3', 'PLOTTER') WHERE acabamentos @> ARRAY['PLOTTER - CG-60 SRIII AUTOCUTTER A3'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'CARTUCHEIRA - COLADEIRA DE CARTUCHO ZH800G', 'CARTUCHEIRA') WHERE acabamentos @> ARRAY['CARTUCHEIRA - COLADEIRA DE CARTUCHO ZH800G'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'SERRILHADEIRA - JMAC MASTER 700MM', 'SERRILHADEIRA') WHERE acabamentos @> ARRAY['SERRILHADEIRA - JMAC MASTER 700MM'];
UPDATE orders SET acabamentos = array_replace(acabamentos, 'HOT STAMPING - CATU', 'HOT STAMPING') WHERE acabamentos @> ARRAY['HOT STAMPING - CATU'];

-- Remove duplicates
UPDATE orders SET acabamentos = ARRAY(SELECT DISTINCT unnest(acabamentos)) WHERE acabamentos IS NOT NULL AND array_length(acabamentos, 1) > 0;
