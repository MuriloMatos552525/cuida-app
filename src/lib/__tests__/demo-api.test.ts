/// <reference types="jest" />

import { DemoApi } from '../api/demo';
import { brl, formatRange } from '../format';

// O modo demonstração usa as mesmas regras do servidor; estes testes garantem que o fluxo
// que aparece nas telas (buscar, reservar, PIN, avaliar) funciona de ponta a ponta.

const inDays = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour + 3, 0, 0, 0);
  return d.toISOString();
};

async function asClient() {
  const api = new DemoApi({ simulate: false });
  await api.signIn('cliente@demo.com', 'demo');
  return api;
}

const search = (api: DemoApi, specialtyIds: string[] = []) =>
  api.searchCaregivers({
    category: 'baba', coordinate: { latitude: -23.5587, longitude: -46.6589 }, start: inDays(3, 14), end: inDays(3, 18),
    mode: 'hora', dependents: 1, tripsKm: 0, specialtyIds,
  });

test('senha errada não entra', async () => {
  await expect(new DemoApi().signIn('cliente@demo.com', 'x')).rejects.toThrow('incorretos');
});

test('busca babás por nota, com especialidade', async () => {
  const api = await asClient();
  expect((await search(api)).map((r) => r.caregiver.id)).toEqual(['demo-ana', 'demo-julia']);
  expect((await search(api, ['neurodivergentes'])).map((r) => r.caregiver.id)).toEqual(['demo-julia']);
});

test('reserva, PIN, conclusão e avaliação às cegas', async () => {
  const client = await asClient();
  const [ana] = await search(client);
  const booking = await client.createBooking({
    caregiverId: ana.caregiver.id, addressId: 'casa', category: 'baba', start: inDays(3, 14), end: inDays(3, 18),
    mode: 'hora', dependents: 1, tripsKm: 0, requiresSpecialty: false, notes: '',
  });
  expect(booking.price).toEqual(ana.price);
  // Horário ocupado some da busca.
  expect((await search(client)).map((r) => r.caregiver.id)).toEqual(['demo-julia']);

  const pin = (await client.bookingPin(booking.id))!;
  expect(pin).toMatch(/^\d{4}$/);
  await expect(client.transition(booking.id, 'accept')).rejects.toThrow('não é possível');

  // O mesmo objeto atende as duas pessoas: troca de conta para a cuidadora.
  await client.signOut();
  await client.signIn('ana@demo.com', 'demo');
  expect(await client.bookingAddress(booking.id)).toBeNull();
  expect(await client.bookingPin(booking.id)).toBeNull();
  await client.transition(booking.id, 'accept');
  expect((await client.bookingAddress(booking.id))?.street).toContain('Rua Augusta');
  await expect(client.transition(booking.id, 'start', pin === '0000' ? '1111' : '0000')).rejects.toThrow('Código incorreto');
  await client.transition(booking.id, 'start', pin);
  await client.transition(booking.id, 'finish');
  await client.submitReview(booking.id, { rating: 5, tags: [], comment: '' });
  expect((await client.myReview(booking.id))?.visible).toBe(false);

  await client.signOut();
  await client.signIn('cliente@demo.com', 'demo');
  await client.submitReview(booking.id, { rating: 4, tags: ['Pontual'], comment: 'Ótima' });
  expect((await client.myReview(booking.id))?.visible).toBe(true);
  expect((await client.listReviews('demo-ana')).some((r) => r.comment === 'Ótima')).toBe(true);
});

test('cliente novo precisa verificar a identidade antes de reservar', async () => {
  const api = new DemoApi({ simulate: false, stepMs: 1 });
  await api.signUp({ fullName: 'Rafa Melo', email: 'rafa@x.com', password: '123456', role: 'cliente' });
  const address = await api.addAddress({ label: 'Casa', street: 'Rua B', city: 'São Paulo', coordinate: { latitude: -23.56, longitude: -46.66 } });
  const input = {
    caregiverId: 'demo-ana', addressId: address.id, category: 'baba' as const, start: inDays(2, 14), end: inDays(2, 18),
    mode: 'hora' as const, dependents: 1, tripsKm: 0, requiresSpecialty: false, notes: '',
  };
  await expect(api.createBooking(input)).rejects.toThrow('Verifique sua identidade');
  for (const kind of ['cpf', 'documento', 'selfie'] as const) await api.sendVerification(kind);
  await new Promise((r) => setTimeout(r, 20));
  await expect(api.createBooking(input)).resolves.toMatchObject({ status: 'solicitada' });
});

test('formatação em português', () => {
  expect(brl(15_700)).toBe('R$ 157,00');
  expect(formatRange('2026-10-07T17:00:00.000Z', '2026-10-07T21:00:00.000Z')).toMatch(/14:00–18:00$/);
});
