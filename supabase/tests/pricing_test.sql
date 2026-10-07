-- Mesmos casos do PricingEngineTests.swift. Rode com: psql -v ON_ERROR_STOP=1 -f tests/pricing_test.sql
-- (depois das migrations e do seed). Qualquer divergência interrompe com erro.

do $$
declare
  baba pricing_rules := (select r from pricing_rules r where category = 'baba' and city = 'São Paulo');
  idoso pricing_rules := (select r from pricing_rules r where category = 'idoso' and city = 'São Paulo');
  q jsonb;
begin
  -- Dia de semana à tarde, 4 horas, 3 km
  q := quote_price(baba, '2026-10-07 14:00-03', '2026-10-07 18:00-03', 'hora', 1, 3);
  assert q->>'billedUnits' = '4' and q->>'timeAmount' = '14000' and q->>'surcharge' = '0'
     and q->>'travelToLocation' = '1700' and q->>'total' = '15700'
     and q->>'platformFee' = '2826' and q->>'caregiverPayout' = '12874', 'caso 1: ' || q;

  -- Mínimo de horas
  q := quote_price(baba, '2026-10-07 14:00-03', '2026-10-07 15:00-03', 'hora', 1, 0);
  assert q->>'billedUnits' = '3' and q->>'timeAmount' = '10500' and q->>'total' = '11300'
     and q->>'platformFee' = '2034', 'caso 2: ' || q;

  -- Sábado à noite, 2 crianças: vale só o maior acréscimo (noturno)
  q := quote_price(baba, '2026-10-10 20:00-03', '2026-10-10 23:00-03', 'hora', 2, 2);
  assert q->>'surchargeReason' = 'noturno' and q->>'surcharge' = '2100' and q->>'dependentsExtra' = '2625'
     and q->>'travelToLocation' = '1400' and q->>'total' = '16625'
     and q->>'platformFee' = '2993' and q->>'caregiverPayout' = '13632', 'caso 3: ' || q;

  -- 5 diárias de cuidador de idosos, com especialidade e 10 km de deslocamentos
  q := quote_price(idoso, '2026-10-12 08:00-03', '2026-10-17 08:00-03', 'diaria', 1, 4, 10, true);
  assert q->>'billedUnits' = '5' and q->>'timeAmount' = '140000' and q->>'longStayDiscount' = '14000'
     and q->>'specialtyExtra' = '31500' and q->>'travelToLocation' = '2000'
     and q->>'travelDuringService' = '1500' and q->>'total' = '161000'
     and q->>'platformFee' = '28980' and q->>'caregiverPayout' = '132020', 'caso 4: ' || q;

  -- Feriado
  q := quote_price(baba, '2026-10-07 14:00-03', '2026-10-07 18:00-03', 'hora', 1, 0, 0, false, true);
  assert q->>'surchargeReason' = 'feriado' and q->>'surcharge' = '7000', 'caso 5: ' || q;

  raise notice 'pricing_test: todos os casos passaram';
end;
$$;
