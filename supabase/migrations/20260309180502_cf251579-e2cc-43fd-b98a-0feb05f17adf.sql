
-- Update existing orders that have any of the 3 digital equipment names
UPDATE orders SET equipamentos = array_replace(equipamentos, 'DIGITAL - ACURIOPRESS 6100', 'DIGITAL') WHERE equipamentos @> ARRAY['DIGITAL - ACURIOPRESS 6100'];
UPDATE orders SET equipamentos = array_replace(equipamentos, 'DIGITAL - ACURIOPRESS 7100', 'DIGITAL') WHERE equipamentos @> ARRAY['DIGITAL - ACURIOPRESS 7100'];
UPDATE orders SET equipamentos = array_replace(equipamentos, 'DIGITAL - PB', 'DIGITAL') WHERE equipamentos @> ARRAY['DIGITAL - PB'];

-- Remove duplicates from orders that now have multiple 'DIGITAL' entries
UPDATE orders SET equipamentos = ARRAY(SELECT DISTINCT unnest(equipamentos)) WHERE 'DIGITAL' = ANY(equipamentos);

-- Delete the 3 old digital equipment entries
DELETE FROM equipamentos WHERE nome IN ('DIGITAL - ACURIOPRESS 6100', 'DIGITAL - ACURIOPRESS 7100', 'DIGITAL - PB');

-- Insert the single DIGITAL entry
INSERT INTO equipamentos (nome) VALUES ('DIGITAL');
