-- Funções de leitura usadas pelo app. Devolvem JSON no mesmo formato dos modelos Swift
-- (Caregiver, Booking, Review), para o app decodificar direto.

-- Coordenada arredondada (~1 km) para não expor o endereço exato de ninguém.
create function public.coarse_coordinate(p extensions.geography) returns jsonb
language sql immutable set search_path = public, extensions as $$
  select jsonb_build_object(
    'latitude', round(st_y(p::geometry)::numeric, 2),
    'longitude', round(st_x(p::geometry)::numeric, 2));
$$;

create function public.exact_coordinate(p extensions.geography) returns jsonb
language sql immutable set search_path = public, extensions as $$
  select jsonb_build_object('latitude', st_y(p::geometry), 'longitude', st_x(p::geometry));
$$;

create function public.caregiver_json(p_caregiver uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.full_name,
    'photoURL', null,
    'bio', cp.bio,
    'categories', coalesce((select jsonb_agg(cc.category) from caregiver_categories cc where cc.caregiver_id = p.id), '[]'),
    'specialties', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'category', s.category))
                               from caregiver_specialties cs join specialties s on s.id = cs.specialty_id
                              where cs.caregiver_id = p.id and cs.approved), '[]'),
    'rating', p.rating_avg,
    'reviewCount', p.rating_count,
    'coordinate', coarse_coordinate(cp.location),
    'serviceRadiusKm', cp.service_radius_km,
    'isIdentityVerified', is_identity_verified(p.id),
    'backgroundCheckedAt', (select max(v.updated_at) from verifications v
                             where v.profile_id = p.id and v.kind = 'antecedentes' and v.status = 'aprovado'))
  from profiles p join caregiver_profiles cp on cp.profile_id = p.id
  where p.id = p_caregiver;
$$;

-- Reserva vista por uma das partes. O PIN só aparece para o cliente; o endereço exato
-- só aparece para o cuidador depois do aceite.
create function public.booking_json(b public.bookings, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', b.id,
    'category', b.category,
    'caregiver', caregiver_json(b.caregiver_id),
    'clientName', (select split_part(full_name, ' ', 1) from profiles where id = b.client_id),
    'address', jsonb_build_object(
      'id', a.id,
      'label', a.label,
      'city', a.city,
      'street', case when p_viewer = b.client_id
                       or b.status in ('aceita', 'a_caminho', 'em_andamento') then a.street
                     else 'Endereço liberado após aceitar' end,
      'coordinate', case when p_viewer = b.client_id
                           or b.status in ('aceita', 'a_caminho', 'em_andamento') then exact_coordinate(a.location)
                         else coarse_coordinate(a.location) end),
    'start', b.starts_at,
    'end', b.ends_at,
    'status', b.status,
    'startPin', case when p_viewer = b.client_id then b.start_pin else '' end,
    'notes', b.notes,
    'price', b.price)
  from addresses a
  where a.id = b.address_id;
$$;

create function public.my_bookings() returns setof jsonb
language sql stable security definer set search_path = public as $$
  select booking_json(b, auth.uid()) from bookings b
   where auth.uid() in (b.client_id, b.caregiver_id)
   order by b.starts_at desc
   limit 100;
$$;

create function public.booking_detail(p_booking_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select booking_json(b, auth.uid()) from bookings b
   where b.id = p_booking_id and auth.uid() in (b.client_id, b.caregiver_id);
$$;

-- Busca: só cuidadores elegíveis, no raio, livres no horário e com as especialidades pedidas.
create function public.search_caregivers(
  p_category public.service_category,
  p_lat double precision,
  p_lng double precision,
  p_start timestamptz,
  p_end timestamptz,
  p_mode public.billing_mode,
  p_dependents int default 1,
  p_trips_km numeric default 0,
  p_specialty_ids text[] default '{}'
) returns setof jsonb
language sql stable security definer set search_path = public, extensions as $$
  with origin as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as point
  ), candidates as (
    select cp.profile_id, p.rating_avg, (st_distance(cp.location, o.point) / 1000)::numeric as km, pr as rule
      from caregiver_profiles cp
      join profiles p on p.id = cp.profile_id
      join caregiver_categories cc on cc.caregiver_id = cp.profile_id and cc.category = p_category
      join pricing_rules pr on pr.category = p_category and pr.city = cp.city
      cross join origin o
     where public.is_caregiver_eligible(cp.profile_id)
       and st_dwithin(cp.location, o.point, cp.service_radius_km * 1000)
       and (select count(*) from caregiver_specialties cs
             where cs.caregiver_id = cp.profile_id and cs.approved and cs.specialty_id = any (p_specialty_ids))
           = coalesce(array_length(p_specialty_ids, 1), 0)
       and not exists (select 1 from bookings b
                        where b.caregiver_id = cp.profile_id
                          and b.status in ('solicitada', 'aceita', 'a_caminho', 'em_andamento')
                          and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_start, p_end))
  )
  select jsonb_build_object(
    'caregiver', caregiver_json(c.profile_id),
    'distanceKm', round(c.km, 1),
    'estimatedTotal', (quote_price(c.rule, p_start, p_end, p_mode, p_dependents, c.km, p_trips_km,
                                   coalesce(array_length(p_specialty_ids, 1), 0) > 0) ->> 'total')::int)
  from candidates c
  order by c.rating_avg desc, c.km asc
  limit 50;
$$;

-- Avaliações recebidas por um cuidador, respeitando a regra às cegas.
create function public.caregiver_reviews(p_caregiver uuid) returns setof jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id,
    'authorName', split_part(p.full_name, ' ', 1) || ' ' || left(split_part(p.full_name, ' ', 2), 1) || '.',
    'rating', r.rating,
    'tags', to_jsonb(r.tags),
    'comment', r.comment,
    'createdAt', r.created_at)
  from reviews r join profiles p on p.id = r.reviewer_id
  where r.reviewee_id = p_caregiver
    and (r.created_at < now() - interval '7 days' or review_count(r.booking_id) = 2)
  order by r.created_at desc
  limit 30;
$$;

grant execute on function public.search_caregivers, public.my_bookings, public.booking_detail,
  public.caregiver_reviews to authenticated;
