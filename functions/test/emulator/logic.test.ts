import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import * as logic from '../../src/logic';
import { DEMO_CAREGIVERS, seedDemoCaregivers, seedReferenceData } from '../../src/seed';
import { quote } from '../../src/shared/pricing';
import { SAMPLE_PRICING_RULES } from '../../src/shared/seedData';

// Regras de negócio contra o Firestore do emulador (npm run test:emulator).

const projectId = 'demo-cuida-logic';
const app = initializeApp({ projectId }, 'logic-tests');
const db = getFirestore(app);

const paulista = { latitude: -23.5614, longitude: -46.6559 };
// Quarta-feira, 3 de fevereiro de 2027, 14h às 18h em São Paulo.
const start = '2027-02-03T14:00:00-03:00';
const end = '2027-02-03T18:00:00-03:00';
const approved = { status: 'aprovado' };

async function clear() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
    method: 'DELETE',
  });
}

async function verifiedClient(uid = 'cli') {
  await db.doc(`users/${uid}`).set({ fullName: 'Carla Dias', role: 'cliente' });
  await db.doc(`verifications/${uid}`).set({ cpf: approved, documento: approved, selfie: approved });
  await db.doc(`users/${uid}/addresses/casa`).set({ label: 'Casa', street: 'Rua Augusta, 100', city: 'São Paulo', coordinate: paulista });
}

const bookingInput = (over: Partial<logic.CreateBookingInput> = {}): logic.CreateBookingInput => ({
  caregiverId: 'demo-ana', addressId: 'casa', category: 'baba', start, end, mode: 'hora', ...over,
});

beforeEach(async () => {
  await clear();
  await seedReferenceData(db);
  await seedDemoCaregivers(db);
});
afterAll(() => deleteApp(app));

describe('busca', () => {
  test('encontra quem atende a categoria perto, com preço estimado', async () => {
    const results = await logic.searchCaregivers(db, { category: 'baba', coordinate: paulista, start, end, mode: 'hora' });
    // Ordenado pela nota.
    expect(results.map((r) => r.caregiver.id)).toEqual(['demo-ana', 'demo-julia']);
    const r = results[0];
    expect(r.distanceKm).toBeLessThan(2);
    expect(r.caregiver.isIdentityVerified).toBe(true);
    // Coordenada pública arredondada.
    expect(r.caregiver.coordinate).toEqual({ latitude: -23.56, longitude: -46.65 });
    expect(r.price.total).toBeGreaterThan(14_000);
  });

  test('esconde quem está com antecedentes vencidos ou indisponível', async () => {
    await db.doc('verifications/demo-ana').update({ 'antecedentes.validUntil': '2020-01-01' });
    await logic.refreshCaregiverEligibility(db, 'demo-ana');
    const ids = async (category: 'baba' | 'idoso') =>
      (await logic.searchCaregivers(db, { category, coordinate: paulista, start, end, mode: 'hora' })).map((r) => r.caregiver.id);
    expect(await ids('baba')).toEqual(['demo-julia']);

    await db.doc('caregivers/demo-helena').update({ available: false });
    expect(await ids('idoso')).toEqual(['demo-roberto']);
  });

  test('filtra por especialidade aprovada e por distância', async () => {
    const args = { category: 'pet' as const, coordinate: paulista, start, end, mode: 'hora' as const };
    expect(await logic.searchCaregivers(db, { ...args, specialtyIds: ['gatos'] })).toHaveLength(1);
    expect(await logic.searchCaregivers(db, { ...args, specialtyIds: ['medicacao-pet'] })).toHaveLength(0);
    // Campinas fica a ~90 km.
    expect(await logic.searchCaregivers(db, { ...args, coordinate: { latitude: -22.9, longitude: -47.06 } })).toHaveLength(0);
  });
});

describe('reserva', () => {
  test('cliente sem identidade verificada não reserva', async () => {
    await db.doc('users/cli').set({ fullName: 'Carla Dias', role: 'cliente' });
    await expect(logic.createBooking(db, 'cli', bookingInput())).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('preço calculado no servidor, PIN e endereço privados, sem horário duplicado', async () => {
    await verifiedClient();
    const booking = await logic.createBooking(db, 'cli', bookingInput({ dependents: 2 }));
    expect(booking.status).toBe('solicitada');
    expect(booking.clientName).toBe('Carla');
    expect(booking.price.dependentsExtra).toBe(3_500);
    expect(booking.price.platformFee).toBe(Math.round(booking.price.total * 0.18));
    expect(JSON.stringify(booking)).not.toContain('Rua Augusta');

    const pin = (await db.doc(`bookings/${booking.id}/private/pin`).get()).data()!.pin;
    expect(pin).toMatch(/^\d{4}$/);
    expect((await db.doc(`payments/${booking.id}`).get()).data()).toMatchObject({ status: 'pendente', amount: booking.price.total });

    await verifiedClient('cli2');
    await expect(
      logic.createBooking(db, 'cli2', bookingInput({ start: '2027-02-03T17:00:00-03:00', end: '2027-02-03T20:00:00-03:00' })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    // E some da busca no mesmo horário.
    const after = await logic.searchCaregivers(db, { category: 'baba', coordinate: paulista, start, end, mode: 'hora' });
    expect(after.map((r) => r.caregiver.id)).toEqual(['demo-julia']);
  });

  test('feriado vem da tabela de feriados', async () => {
    await verifiedClient();
    const booking = await logic.createBooking(
      db, 'cli', bookingInput({ start: '2027-04-21T14:00:00-03:00', end: '2027-04-21T18:00:00-03:00' }),
    );
    expect(booking.price.surchargeReason).toBe('feriado');
  });

  test('o valor da busca é o mesmo da reserva', async () => {
    await verifiedClient();
    const [ana] = await logic.searchCaregivers(db, { category: 'baba', coordinate: paulista, start, end, mode: 'hora' });
    const booking = await logic.createBooking(db, 'cli', bookingInput());
    expect(booking.price).toEqual(ana.price);
    const rule = SAMPLE_PRICING_RULES.find((r) => r.category === 'baba')!;
    const km = (booking.price.travelToLocation - rule.travelBaseFee) / (rule.perKmRate * 2);
    const local = quote(
      { category: 'baba', start: new Date(start), end: new Date(end), mode: 'hora', dependents: 1,
        distanceToLocationKm: km, tripsDuringServiceKm: 0, requiresSpecialty: false, isHoliday: false },
      rule,
    );
    expect(booking.price.total).toBe(local.total);
  });

  test('fluxo completo: aceitar, PIN, concluir e avaliar às cegas', async () => {
    await verifiedClient();
    const { id } = await logic.createBooking(db, 'cli', bookingInput());
    const pin = (await db.doc(`bookings/${id}/private/pin`).get()).data()!.pin as string;

    await expect(logic.bookingTransition(db, 'cli', { bookingId: id, event: 'accept' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    await expect(logic.bookingTransition(db, 'intruso', { bookingId: id, event: 'cancel' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await logic.bookingTransition(db, 'demo-ana', { bookingId: id, event: 'accept' });
    await logic.bookingTransition(db, 'demo-ana', { bookingId: id, event: 'start_trip' });
    const wrong = pin === '0000' ? '1111' : '0000';
    await expect(logic.bookingTransition(db, 'demo-ana', { bookingId: id, event: 'start', pin: wrong })).rejects.toThrow(
      /Código incorreto/,
    );
    const started = await logic.bookingTransition(db, 'demo-ana', { bookingId: id, event: 'start', pin });
    expect(started.status).toBe('em_andamento');
    await logic.bookingTransition(db, 'demo-ana', { bookingId: id, event: 'finish' });

    await logic.submitReview(db, 'cli', { bookingId: id, rating: 5, tags: ['Pontual'] });
    expect((await db.doc(`reviews/${id}__cli`).get()).data()!.visible).toBe(false);
    await expect(logic.submitReview(db, 'cli', { bookingId: id, rating: 4 })).rejects.toMatchObject({ code: 'failed-precondition' });

    await logic.submitReview(db, 'demo-ana', { bookingId: id, rating: 4 });
    expect((await db.doc(`reviews/${id}__cli`).get()).data()!.visible).toBe(true);
    expect((await db.doc(`reviews/${id}__demo-ana`).get()).data()!.visible).toBe(true);
    expect((await db.doc(`bookings/${id}`).get()).data()!.status).toBe('avaliada');
    expect((await db.doc('users/cli').get()).data()).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
  });

  test('não avalia antes de terminar', async () => {
    await verifiedClient();
    const { id } = await logic.createBooking(db, 'cli', bookingInput());
    await expect(logic.submitReview(db, 'cli', { bookingId: id, rating: 5 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('rotina diária', () => {
  test('vence certidão de antecedentes e tira o cuidador da busca', async () => {
    await db.doc('verifications/demo-marcos').update({ 'antecedentes.validUntil': '2026-01-01' });
    const result = await logic.dailyMaintenance(db);
    expect(result.expired).toBe(1);
    expect((await db.doc('verifications/demo-marcos').get()).data()!.antecedentes.status).toBe('expirado');
    expect((await db.doc('caregivers/demo-marcos').get()).data()!.eligible).toBe(false);
  });

  test('cuidadores de demonstração estão elegíveis', async () => {
    for (const c of DEMO_CAREGIVERS) expect((await db.doc(`caregivers/${c.id}`).get()).data()!.eligible).toBe(true);
  });
});

describe('emergência', () => {
  test('registra o alerta de quem participa da reserva', async () => {
    await verifiedClient();
    const { id } = await logic.createBooking(db, 'cli', bookingInput());
    await logic.triggerEmergency(db, 'cli', { bookingId: id, coordinate: paulista });
    await expect(logic.triggerEmergency(db, 'intruso', { bookingId: id })).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await db.collection('emergencies').get()).size).toBe(1);
  });
});
