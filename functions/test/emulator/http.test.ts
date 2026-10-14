import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { Deps, handle } from '../../src/http';
import { seedDemoCaregivers, seedReferenceData } from '../../src/seed';

// API HTTP do plano grátis contra o Firestore do emulador (npm run test:emulator).

const projectId = 'demo-cuida-http';
const app = initializeApp({ projectId }, 'http-tests');
const db = getFirestore(app);
const deps: Deps = {
  db,
  verifyToken: async (token) => {
    if (token !== 'token-cli') throw new Error('token inválido');
    return 'cli';
  },
  cronSecret: 'segredo',
};

const search = {
  category: 'baba',
  coordinate: { latitude: -23.5614, longitude: -46.6559 },
  start: '2027-02-03T14:00:00-03:00',
  end: '2027-02-03T18:00:00-03:00',
  mode: 'hora',
};
const post = (name: string, data: unknown, authorization: string | undefined = 'Bearer token-cli') =>
  handle({ method: 'POST', name, authorization, body: { data } }, deps);

beforeAll(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await seedReferenceData(db);
  await seedDemoCaregivers(db);
});
afterAll(() => deleteApp(app));

test('responde no formato das funções callable', async () => {
  const out = await post('searchCaregivers', search);
  expect(out.status).toBe(200);
  const result = (out.body as { result: { caregiver: { id: string } }[] }).result;
  expect(result.map((r) => r.caregiver.id)).toEqual(['demo-ana', 'demo-julia']);
});

test('exige login válido', async () => {
  for (const authorization of ['', 'Bearer outro']) {
    const out = await post('searchCaregivers', search, authorization);
    expect(out).toEqual({ status: 401, body: { error: { status: 'UNAUTHENTICATED', message: 'Entre na sua conta.' } } });
  }
});

test('converte erros de regra de negócio e recusa operações desconhecidas', async () => {
  const booking = await post('createBooking', { caregiverId: 'demo-ana', addressId: 'casa', ...search });
  expect(booking.status).toBe(400);
  expect(booking.body).toMatchObject({ error: { status: 'FAILED_PRECONDITION' } });
  expect((await post('constructor', {})).status).toBe(404);
  expect((await handle({ method: 'GET', name: 'searchCaregivers', body: null }, deps)).status).toBe(400);
});

test('rotina diária exige a senha e recalcula quem aparece na busca', async () => {
  const run = (authorization?: string) => handle({ method: 'GET', name: 'manutencao', authorization, body: null }, deps);
  expect((await run('Bearer errada')).status).toBe(401);

  // A equipe tira a aprovação pelo Console; sem gatilhos, a rotina é que esconde a cuidadora.
  await db.doc('caregivers/demo-ana').update({ approvedByStaff: false });
  const out = await run('Bearer segredo');
  expect(out.status).toBe(200);
  expect((await db.doc('caregivers/demo-ana').get()).data()?.eligible).toBe(false);
  const ids = ((await post('searchCaregivers', search)).body as { result: { caregiver: { id: string } }[] }).result;
  expect(ids.map((r) => r.caregiver.id)).toEqual(['demo-julia']);
});
