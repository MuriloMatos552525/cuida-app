-- Fluxo completo de uma reserva com as regras de segurança ligadas (RLS).
-- Precisa das migrations e do seed. Simula usuários via a configuração test.uid
-- (no Supabase real, auth.uid() vem do login).

\set client   '''11111111-1111-1111-1111-111111111111'''
\set nanny    '''22222222-2222-2222-2222-222222222222'''
\set stranger '''33333333-3333-3333-3333-333333333333'''

insert into auth.users values (:client), (:nanny), (:stranger);
insert into profiles (id, role, full_name) values
  (:client, 'cliente', 'Carla Cliente'), (:nanny, 'cuidador', 'Ana Babá'), (:stranger, 'cliente', 'Outro');
insert into verifications (profile_id, kind, status, valid_until)
select p, k::verification_kind, 'aprovado', current_date + 180
  from unnest(array[:client, :nanny]::uuid[]) p, unnest(array['cpf', 'documento', 'selfie']) k;
insert into caregiver_profiles (profile_id, city, location, service_radius_km, approved)
values (:nanny, 'São Paulo', extensions.st_setsrid(extensions.st_makepoint(-46.6820, -23.5610), 4326), 10, true);
insert into caregiver_categories values (:nanny, 'baba');
insert into addresses (id, client_id, label, street, city, location)
values ('44444444-4444-4444-4444-444444444444', :client, 'Casa', 'Rua Harmonia, 100', 'São Paulo',
        extensions.st_setsrid(extensions.st_makepoint(-46.6880, -23.5537), 4326));

do $$
declare
  n int; b bookings; booking_id uuid; pin text;
  start_at timestamptz := date_trunc('day', now()) + interval '2 days 14 hours';
begin
  -- Sem antecedentes aprovados, a babá não aparece na busca.
  select count(*) into n from search_caregivers('baba', -23.5537, -46.6880, start_at, start_at + interval '4 hours', 'hora');
  assert n = 0, 'cuidadora sem antecedentes apareceu na busca';

  insert into verifications (profile_id, kind, status, valid_until)
  values ('22222222-2222-2222-2222-222222222222', 'antecedentes', 'aprovado', current_date + 180);
  select count(*) into n from search_caregivers('baba', -23.5537, -46.6880, start_at, start_at + interval '4 hours', 'hora');
  assert n = 1, 'cuidadora verificada não apareceu na busca';

  -- Cliente cria a reserva; o preço e o PIN vêm do servidor.
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  b := create_booking('22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444',
                      'baba', start_at, start_at + interval '4 hours', 'hora');
  booking_id := b.id; pin := b.start_pin;
  assert b.status = 'solicitada' and b.total_cents > 0 and length(b.start_pin) = 4, 'reserva criada errada: ' || row_to_json(b);
  assert (select amount_cents from payments where payments.booking_id = b.id) = b.total_cents, 'pagamento não registrado';

  -- O mesmo horário não pode ser reservado de novo.
  begin
    perform create_booking('22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444',
                           'baba', start_at + interval '1 hour', start_at + interval '3 hours', 'hora');
    assert false, 'permitiu reserva em horário ocupado';
  exception when raise_exception then
    assert sqlerrm = 'caregiver_busy', 'erro inesperado: ' || sqlerrm;
  end;

  -- Cliente não pode aceitar a própria reserva.
  begin
    perform booking_transition(booking_id, 'accept');
    assert false, 'cliente aceitou a reserva';
  exception when raise_exception then
    assert sqlerrm = 'transition_not_allowed', 'erro inesperado: ' || sqlerrm;
  end;

  -- Cuidadora aceita, vai e só começa com o PIN certo.
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
  perform booking_transition(booking_id, 'accept');
  perform booking_transition(booking_id, 'start_trip');
  begin
    perform booking_transition(booking_id, 'start', '0000');
    if pin <> '0000' then assert false, 'começou com PIN errado'; end if;
  exception when raise_exception then
    assert sqlerrm = 'wrong_pin', 'erro inesperado: ' || sqlerrm;
  end;
  b := booking_transition(booking_id, 'start', pin);
  assert b.status = 'em_andamento' and b.checked_in_at is not null, 'não iniciou';
  b := booking_transition(booking_id, 'finish');
  assert b.status = 'concluida' and b.checked_out_at is not null, 'não concluiu';

  -- Avaliação mútua.
  perform submit_review(booking_id, 5, array['pontual'], 'Família muito querida');
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform submit_review(booking_id, 5, array['carinhosa'], null);
  assert (select status from bookings where id = booking_id) = 'avaliada', 'não ficou avaliada';
  assert (select rating_count from profiles where id = '22222222-2222-2222-2222-222222222222') = 1, 'nota não atualizada';

  -- O que o app recebe: o cliente vê o PIN; a cuidadora não.
  assert (select count(*) from my_bookings() j where j->>'startPin' = pin) = 1, 'cliente não vê o PIN';
  assert (select count(*) from caregiver_reviews('22222222-2222-2222-2222-222222222222')) = 1, 'avaliação mútua não aparece';
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
  assert (select count(*) from my_bookings() j where j->>'startPin' = '') = 1, 'cuidadora vê o PIN';
  assert (select j->'caregiver'->'coordinate'->>'latitude' from my_bookings() j) = '-23.56', 'coordenada não arredondada';

  raise notice 'booking_flow_test: funções passaram';
end;
$$;

-- Regras de acesso (RLS) como usuário logado comum.
set role authenticated;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  assert (select count(*) from bookings) = 0, 'estranho vê reserva alheia';
  assert (select count(*) from addresses) = 0, 'estranho vê endereço alheio';
  assert (select count(*) from private_identity) = 0, 'estranho vê CPF';
  assert (select count(*) from messages) = 0, 'estranho vê mensagens';
end $$;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  -- Depois de avaliada, o endereço volta a ficar oculto para a cuidadora.
  assert (select count(*) from addresses) = 0, 'cuidadora ainda vê o endereço após o fim';
end $$;
reset role;
update bookings set status = 'em_andamento';
set role authenticated;
do $$ begin
  assert (select count(*) from addresses) = 1, 'cuidadora não vê o endereço durante o serviço';
  begin
    update bookings set status = 'solicitada';
    assert (select count(*) from bookings where status = 'solicitada') = 0, 'cuidadora alterou status direto';
  exception when insufficient_privilege then null;
  end;
  begin
    update profiles set rating_avg = 5, suspended = false where id = auth.uid();
    assert false, 'usuário alterou a própria nota';
  exception when insufficient_privilege then null;
  end;
  begin
    update verifications set status = 'aprovado';
    assert not found, 'usuário alterou verificação';
  exception when insufficient_privilege then null;
  end;
  raise notice 'booking_flow_test: regras de acesso passaram';
end $$;
reset role;
