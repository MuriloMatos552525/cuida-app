-- Funções chamadas pelo app (supabase.rpc). Todas validam quem está chamando,
-- calculam o que importa no servidor e só então gravam.

-- Criar reserva ---------------------------------------------------------------------

create function public.create_booking(
  p_caregiver_id uuid,
  p_address_id uuid,
  p_category public.service_category,
  p_start timestamptz,
  p_end timestamptz,
  p_mode public.billing_mode,
  p_dependents int default 1,
  p_trips_km numeric default 0,
  p_requires_specialty boolean default false,
  p_notes text default ''
) returns public.bookings
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_client uuid := auth.uid();
  v_address addresses;
  v_caregiver caregiver_profiles;
  v_rule pricing_rules;
  v_distance_km numeric;
  v_is_holiday boolean;
  v_price jsonb;
  v_booking bookings;
begin
  if v_client is null then raise exception 'not_authenticated'; end if;
  if not public.is_identity_verified(v_client) then raise exception 'client_not_verified'; end if;
  if p_start < now() then raise exception 'start_in_past'; end if;

  select * into v_address from addresses where id = p_address_id and client_id = v_client;
  if not found then raise exception 'address_not_found'; end if;

  select * into v_caregiver from caregiver_profiles where profile_id = p_caregiver_id;
  if not found or not public.is_caregiver_eligible(p_caregiver_id) then raise exception 'caregiver_not_available'; end if;
  if not exists (select 1 from caregiver_categories where caregiver_id = p_caregiver_id and category = p_category) then
    raise exception 'caregiver_not_available';
  end if;

  v_distance_km := st_distance(v_caregiver.location, v_address.location) / 1000;
  if v_distance_km > v_caregiver.service_radius_km then raise exception 'out_of_radius'; end if;

  if exists (select 1 from bookings b
              where b.caregiver_id = p_caregiver_id
                and b.status in ('solicitada', 'aceita', 'a_caminho', 'em_andamento')
                and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_start, p_end)) then
    raise exception 'caregiver_busy';
  end if;

  select * into v_rule from pricing_rules where category = p_category and city = v_address.city;
  if not found then raise exception 'city_not_served'; end if;

  v_is_holiday := exists (select 1 from holidays
                           where day = (p_start at time zone 'America/Sao_Paulo')::date
                             and city in ('*', v_address.city));

  v_price := public.quote_price(v_rule, p_start, p_end, p_mode, p_dependents, v_distance_km,
                                p_trips_km, p_requires_specialty, v_is_holiday);

  insert into bookings (client_id, caregiver_id, address_id, category, mode, starts_at, ends_at,
                        dependents, notes, start_pin, price, total_cents, platform_fee_cents)
  values (v_client, p_caregiver_id, p_address_id, p_category, p_mode, p_start, p_end,
          p_dependents, coalesce(p_notes, ''), lpad((floor(random() * 10000))::int::text, 4, '0'),
          v_price, (v_price ->> 'total')::int, (v_price ->> 'platformFee')::int)
  returning * into v_booking;

  -- O pagamento é autorizado pela Edge Function do gateway a partir deste registro.
  insert into payments (booking_id, gateway, amount_cents, platform_fee_cents, caregiver_payout_cents)
  values (v_booking.id, 'a_definir', v_booking.total_cents, v_booking.platform_fee_cents,
          (v_price ->> 'caregiverPayout')::int);

  return v_booking;
end;
$$;

-- Mudanças de estado --------------------------------------------------------------------
-- Mesmas regras do BookingStateMachine.swift.

create function public.booking_transition(p_booking_id uuid, p_event text, p_pin text default null)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  b bookings;
  v_next booking_status;
  is_client boolean;
  is_caregiver boolean;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  is_client := b.client_id = v_user;
  is_caregiver := b.caregiver_id = v_user;
  if not (is_client or is_caregiver) then raise exception 'not_allowed'; end if;

  v_next := case
    when p_event = 'accept'     and is_caregiver and b.status = 'solicitada' then 'aceita'
    when p_event = 'decline'    and is_caregiver and b.status = 'solicitada' then 'recusada'
    when p_event = 'start_trip' and is_caregiver and b.status = 'aceita' then 'a_caminho'
    when p_event = 'start'      and is_caregiver and b.status in ('aceita', 'a_caminho') then 'em_andamento'
    when p_event = 'finish'     and is_caregiver and b.status = 'em_andamento' then 'concluida'
    when p_event = 'cancel'     and b.status in ('solicitada', 'aceita', 'a_caminho') then 'cancelada'
    when p_event = 'dispute'    and b.status in ('em_andamento', 'concluida') then 'em_disputa'
    else null
  end;
  if v_next is null then raise exception 'transition_not_allowed'; end if;

  if p_event = 'start' and (p_pin is null or p_pin <> b.start_pin) then
    raise exception 'wrong_pin';
  end if;

  update bookings set
    status = v_next,
    checked_in_at = case when v_next = 'em_andamento' then now() else checked_in_at end,
    checked_out_at = case when v_next = 'concluida' then now() else checked_out_at end,
    updated_at = now()
  where id = b.id
  returning * into b;

  -- Captura, estorno e multa de cancelamento são feitos pela Edge Function de pagamento,
  -- disparada por um database webhook nesta tabela.
  return b;
end;
$$;

-- Avaliação ---------------------------------------------------------------------------

create function public.submit_review(p_booking_id uuid, p_rating int, p_tags text[], p_comment text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  b bookings;
  v_reviewee uuid;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found or v_user not in (b.client_id, b.caregiver_id) then raise exception 'not_allowed'; end if;
  if b.status not in ('concluida', 'avaliada') then raise exception 'booking_not_finished'; end if;

  v_reviewee := case when v_user = b.client_id then b.caregiver_id else b.client_id end;

  insert into reviews (booking_id, reviewer_id, reviewee_id, rating, tags, comment)
  values (b.id, v_user, v_reviewee, p_rating, coalesce(p_tags, '{}'), p_comment);

  update profiles p set
    rating_avg = s.avg, rating_count = s.cnt
  from (select avg(rating)::numeric(3, 2) as avg, count(*)::int as cnt from reviews where reviewee_id = v_reviewee) s
  where p.id = v_reviewee;

  if public.review_count(b.id) = 2 then
    update bookings set status = 'avaliada', updated_at = now() where id = b.id;
  end if;
end;
$$;

-- Emergência --------------------------------------------------------------------------

create function public.trigger_emergency(p_booking_id uuid, p_lat double precision, p_lng double precision)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_booking_id is not null and not public.is_booking_party(p_booking_id) then raise exception 'not_allowed'; end if;
  insert into emergency_events (booking_id, profile_id, location)
  values (p_booking_id, auth.uid(),
          case when p_lat is null then null else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end);
  -- Um database webhook nesta tabela chama a Edge Function que envia SMS aos contatos de emergência.
end;
$$;

-- O app só chama estas funções; nada de insert/update direto em reservas.
revoke all on function public.quote_price from anon;
grant execute on function public.create_booking, public.booking_transition,
  public.submit_review, public.trigger_emergency to authenticated;
