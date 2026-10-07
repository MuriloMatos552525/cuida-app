-- Cálculo do preço sugerido. É a versão que vale na cobrança.
-- Espelha o PricingEngine.swift do app; os casos de teste dos dois são os mesmos
-- (supabase/tests/pricing_test.sql e PricingEngineTests.swift).

create function public.quote_price(
  r public.pricing_rules,
  p_start timestamptz,
  p_end timestamptz,
  p_mode public.billing_mode,
  p_dependents int,
  p_distance_km numeric,
  p_trips_km numeric default 0,
  p_requires_specialty boolean default false,
  p_is_holiday boolean default false,
  p_tz text default 'America/Sao_Paulo'
) returns jsonb
language plpgsql immutable as $$
declare
  minutes int;
  billable_minutes int;
  billed_units int;
  time_amount int;
  discount int := 0;
  surcharge int := 0;
  surcharge_bp int := 0;
  surcharge_reason text := null;
  net_time int;
  dependents_extra int;
  specialty_extra int := 0;
  travel_to int;
  travel_during int;
  total int;
  fee int;
  local_start timestamp := p_start at time zone p_tz;
  touches_night boolean := false;
  cursor_ts timestamptz;
  h int;
begin
  if p_end <= p_start then raise exception 'end_before_start'; end if;
  if p_dependents < 1 then raise exception 'invalid_dependents'; end if;
  if p_distance_km < 0 or p_trips_km < 0 then raise exception 'negative_distance'; end if;

  minutes := floor(extract(epoch from (p_end - p_start)) / 60);

  if p_mode = 'hora' then
    billable_minutes := greatest(minutes, r.minimum_hours * 60);
    billed_units := ceil(billable_minutes / 60.0);
    time_amount := round(r.hourly_rate::numeric * billable_minutes / 60);

    -- Noite: qualquer parte entre 22h e 6h (checado a cada 30 minutos).
    cursor_ts := p_start;
    while cursor_ts < p_end loop
      h := extract(hour from cursor_ts at time zone p_tz);
      if h >= 22 or h < 6 then touches_night := true; exit; end if;
      cursor_ts := cursor_ts + interval '30 minutes';
    end loop;

    -- Só o maior acréscimo vale. Em empate, a ordem é feriado, fim de semana, noite (igual ao app).
    if p_is_holiday and r.holiday_surcharge_bp > surcharge_bp then
      surcharge_bp := r.holiday_surcharge_bp; surcharge_reason := 'feriado';
    end if;
    if extract(dow from local_start) in (0, 6) and r.weekend_surcharge_bp > surcharge_bp then
      surcharge_bp := r.weekend_surcharge_bp; surcharge_reason := 'fim_de_semana';
    end if;
    if touches_night and r.night_surcharge_bp > surcharge_bp then
      surcharge_bp := r.night_surcharge_bp; surcharge_reason := 'noturno';
    end if;
    surcharge := round(time_amount::numeric * surcharge_bp / 10000);
  else
    billed_units := ceil(minutes / 1440.0);
    time_amount := r.daily_rate * billed_units;
    if billed_units >= r.long_stay_days then
      discount := round(time_amount::numeric * r.long_stay_discount_bp / 10000);
    end if;
  end if;

  net_time := time_amount - discount;
  dependents_extra := round(net_time::numeric * r.extra_dependent_bp * (p_dependents - 1) / 10000);
  if p_requires_specialty then
    specialty_extra := round(net_time::numeric * r.specialty_surcharge_bp / 10000);
  end if;
  travel_to := r.travel_base_fee + round(r.per_km_rate * p_distance_km * 2);
  travel_during := round(r.per_km_rate * p_trips_km);

  total := net_time + surcharge + dependents_extra + specialty_extra + travel_to + travel_during;
  fee := round(total::numeric * r.platform_fee_bp / 10000);

  return jsonb_build_object(
    'billedUnits', billed_units,
    'mode', p_mode,
    'timeAmount', time_amount,
    'longStayDiscount', discount,
    'surcharge', surcharge,
    'surchargeReason', surcharge_reason,
    'dependentsExtra', dependents_extra,
    'specialtyExtra', specialty_extra,
    'travelToLocation', travel_to,
    'travelDuringService', travel_during,
    'total', total,
    'platformFee', fee,
    'caregiverPayout', total - fee
  );
end;
$$;
