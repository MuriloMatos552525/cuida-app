-- Estrutura inicial do banco do app de cuidadores.
-- Regras de segurança: o app nunca escreve status de verificação, preço ou status de reserva
-- diretamente; isso só acontece nas funções do backend (security definer) ou via webhooks.

create extension if not exists postgis with schema extensions;

-- Tipos -------------------------------------------------------------------------------

create type public.user_role as enum ('cliente', 'cuidador');
create type public.service_category as enum ('baba', 'pet', 'idoso');
create type public.verification_kind as enum ('cpf', 'documento', 'selfie', 'antecedentes');
create type public.verification_status as enum ('pendente', 'em_analise', 'aprovado', 'reprovado', 'expirado');
create type public.billing_mode as enum ('hora', 'diaria');
create type public.booking_status as enum (
  'solicitada', 'aceita', 'a_caminho', 'em_andamento', 'concluida', 'avaliada', 'recusada', 'cancelada', 'em_disputa'
);
create type public.payment_status as enum ('pendente', 'autorizado', 'capturado', 'repassado', 'estornado', 'falhou');
create type public.report_status as enum ('aberta', 'em_analise', 'resolvida', 'descartada');

-- Perfis ------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  phone text,
  photo_path text,
  rating_avg numeric(3, 2) not null default 0,
  rating_count int not null default 0,
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);

-- CPF fica separado e só o backend lê (nenhuma policy de select para usuários).
create table public.private_identity (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  cpf_encrypted bytea not null,
  birth_date date,
  updated_at timestamptz not null default now()
);

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind public.verification_kind not null,
  status public.verification_status not null default 'pendente',
  provider text,
  provider_reference text,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, kind)
);

-- Cuidadores --------------------------------------------------------------------------

create table public.caregiver_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  bio text not null default '',
  city text not null,
  location extensions.geography(point, 4326) not null,
  service_radius_km numeric(5, 1) not null default 10 check (service_radius_km between 1 and 50),
  available_now boolean not null default false,
  approved boolean not null default false, -- liberado pela equipe depois da verificação completa
  payout_account_id text                   -- id da conta de recebimento no gateway
);

create index caregiver_profiles_location_idx on public.caregiver_profiles using gist (location);

create table public.caregiver_categories (
  caregiver_id uuid references public.caregiver_profiles (profile_id) on delete cascade,
  category public.service_category not null,
  primary key (caregiver_id, category)
);

create table public.specialties (
  id text primary key,
  name text not null,
  category public.service_category not null
);

create table public.caregiver_specialties (
  caregiver_id uuid references public.caregiver_profiles (profile_id) on delete cascade,
  specialty_id text references public.specialties (id),
  certificate_path text,
  approved boolean not null default false,
  primary key (caregiver_id, specialty_id)
);

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregiver_profiles (profile_id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

-- Clientes ----------------------------------------------------------------------------

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  street text not null,
  city text not null,
  location extensions.geography(point, 4326) not null,
  created_at timestamptz not null default now()
);

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  phone text not null
);

-- Preço -------------------------------------------------------------------------------

-- Valores em centavos; percentuais em pontos-base (100 = 1%).
create table public.pricing_rules (
  category public.service_category not null,
  city text not null,
  hourly_rate int not null,
  daily_rate int not null,
  minimum_hours int not null,
  long_stay_days int not null,
  long_stay_discount_bp int not null,
  travel_base_fee int not null,
  per_km_rate int not null,
  night_surcharge_bp int not null,
  weekend_surcharge_bp int not null,
  holiday_surcharge_bp int not null,
  extra_dependent_bp int not null,
  specialty_surcharge_bp int not null,
  platform_fee_bp int not null,
  updated_at timestamptz not null default now(),
  primary key (category, city)
);

create table public.holidays (
  day date not null,
  city text not null default '*', -- '*' = feriado nacional
  name text not null,
  primary key (day, city)
);

-- Reservas ----------------------------------------------------------------------------

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id),
  caregiver_id uuid not null references public.caregiver_profiles (profile_id),
  address_id uuid not null references public.addresses (id),
  category public.service_category not null,
  mode public.billing_mode not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  dependents int not null default 1 check (dependents >= 1),
  notes text not null default '',
  status public.booking_status not null default 'solicitada',
  start_pin char(4) not null,
  price jsonb not null,           -- detalhamento: tempo, deslocamento, adicionais, taxa
  total_cents int not null,
  platform_fee_cents int not null,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index bookings_client_idx on public.bookings (client_id, starts_at desc);
create index bookings_caregiver_idx on public.bookings (caregiver_id, starts_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  gateway text not null,
  gateway_reference text,
  status public.payment_status not null default 'pendente',
  amount_cents int not null,
  platform_fee_cents int not null,
  caregiver_payout_cents int not null,
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  reviewer_id uuid not null references public.profiles (id),
  reviewee_id uuid not null references public.profiles (id),
  rating smallint not null check (rating between 1 and 5),
  tags text[] not null default '{}',
  comment text,
  created_at timestamptz not null default now(),
  unique (booking_id, reviewer_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id),
  author_id uuid not null references public.profiles (id),
  reported_id uuid references public.profiles (id),
  category text not null,
  description text not null,
  status public.report_status not null default 'aberta',
  created_at timestamptz not null default now()
);

create table public.emergency_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id),
  profile_id uuid not null references public.profiles (id),
  location extensions.geography(point, 4326),
  created_at timestamptz not null default now()
);

-- Regras de elegibilidade -------------------------------------------------------------

-- Pessoa com CPF, documento e selfie aprovados (e não suspensa).
create function public.is_identity_verified(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select suspended from profiles where id = p_profile), true)
     and (select count(*) from verifications
           where profile_id = p_profile
             and kind in ('cpf', 'documento', 'selfie')
             and status = 'aprovado') = 3;
$$;

-- Cuidador só aparece na busca com identidade, antecedentes válidos e aprovação da equipe.
create function public.is_caregiver_eligible(p_caregiver uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_identity_verified(p_caregiver)
     and exists (select 1 from verifications
                  where profile_id = p_caregiver and kind = 'antecedentes'
                    and status = 'aprovado' and valid_until >= current_date)
     and coalesce((select approved from caregiver_profiles where profile_id = p_caregiver), false);
$$;

create function public.is_booking_party(p_booking uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bookings
                  where id = p_booking and auth.uid() in (client_id, caregiver_id));
$$;

-- Row Level Security ------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.private_identity enable row level security;
alter table public.verifications enable row level security;
alter table public.caregiver_profiles enable row level security;
alter table public.caregiver_categories enable row level security;
alter table public.specialties enable row level security;
alter table public.caregiver_specialties enable row level security;
alter table public.availability enable row level security;
alter table public.addresses enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.holidays enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.emergency_events enable row level security;

-- private_identity e payments: sem policies = só o backend (service role) acessa.

-- O dono edita só os próprios dados básicos; nota, suspensão e papel ficam com o backend.
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, role, full_name, phone, photo_path) on public.profiles to authenticated;
grant update (full_name, phone, photo_path) on public.profiles to authenticated;

create policy "perfil: dono lê e edita" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy "perfil: cuidadores elegíveis são públicos" on public.profiles
  for select using (public.is_caregiver_eligible(id));
create policy "perfil: partes de uma reserva se veem" on public.profiles
  for select using (exists (
    select 1 from public.bookings b
     where auth.uid() in (b.client_id, b.caregiver_id) and profiles.id in (b.client_id, b.caregiver_id)));

create policy "verificação: dono só lê" on public.verifications
  for select using (profile_id = auth.uid());

create policy "cuidador: dono lê e edita" on public.caregiver_profiles
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid() and approved = false);
create policy "cuidador: elegíveis são públicos" on public.caregiver_profiles
  for select using (public.is_caregiver_eligible(profile_id));

create policy "categorias do cuidador: dono edita" on public.caregiver_categories
  for all using (caregiver_id = auth.uid()) with check (caregiver_id = auth.uid());
create policy "categorias do cuidador: públicas" on public.caregiver_categories
  for select using (true);

create policy "especialidades: públicas" on public.specialties for select using (true);

create policy "especialidades do cuidador: dono envia" on public.caregiver_specialties
  for all using (caregiver_id = auth.uid()) with check (caregiver_id = auth.uid() and approved = false);
create policy "especialidades do cuidador: aprovadas são públicas" on public.caregiver_specialties
  for select using (approved);

create policy "agenda: dono edita" on public.availability
  for all using (caregiver_id = auth.uid()) with check (caregiver_id = auth.uid());
create policy "agenda: pública" on public.availability for select using (true);

create policy "endereço: dono" on public.addresses
  for all using (client_id = auth.uid()) with check (client_id = auth.uid());
-- Cuidador vê o endereço exato só depois de aceitar.
create policy "endereço: cuidador após aceite" on public.addresses
  for select using (exists (
    select 1 from public.bookings b
     where b.address_id = addresses.id and b.caregiver_id = auth.uid()
       and b.status in ('aceita', 'a_caminho', 'em_andamento', 'concluida')));

create policy "contatos de emergência: dono" on public.emergency_contacts
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "tarifas: públicas" on public.pricing_rules for select using (true);
create policy "feriados: públicos" on public.holidays for select using (true);

-- Reservas são criadas e alteradas só pelas funções do backend.
create policy "reserva: partes leem" on public.bookings
  for select using (auth.uid() in (client_id, caregiver_id));

create policy "mensagens: partes leem" on public.messages
  for select using (public.is_booking_party(booking_id));
create policy "mensagens: partes escrevem" on public.messages
  for insert with check (author_id = auth.uid() and public.is_booking_party(booking_id));

-- Avaliação às cegas: a nota recebida só aparece depois de avaliar também, ou após 7 dias.
-- As contagens ficam em funções security definer para a policy não consultar a própria tabela.
create function public.review_count(p_booking uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from reviews where booking_id = p_booking;
$$;

create function public.has_reviewed(p_booking uuid, p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from reviews where booking_id = p_booking and reviewer_id = p_profile);
$$;

create policy "avaliação: autor lê a sua" on public.reviews
  for select using (reviewer_id = auth.uid());
create policy "avaliação: recebida após avaliar ou 7 dias" on public.reviews
  for select using (
    reviewee_id = auth.uid()
    and (public.has_reviewed(booking_id, auth.uid()) or created_at < now() - interval '7 days'));
create policy "avaliação: pública se mútua ou após 7 dias" on public.reviews
  for select using (
    public.is_caregiver_eligible(reviewee_id)
    and (created_at < now() - interval '7 days' or public.review_count(booking_id) = 2));

create policy "denúncia: autor cria e lê" on public.reports
  for all using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy "emergência: dono registra" on public.emergency_events
  for insert with check (profile_id = auth.uid());

-- Fotos e documentos ficam em buckets privados do Storage, com policies por pasta do usuário.
