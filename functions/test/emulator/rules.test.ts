import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, setLogLevel, updateDoc } from 'firebase/firestore';

// Regras de segurança do Firestore contra o emulador (npm run test:emulator).

let env: RulesTestEnvironment;
setLogLevel('error');

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cuida-rules',
    firestore: { rules: readFileSync(resolve(__dirname, '../../../firestore.rules'), 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/cli'), { fullName: 'Carla Dias', role: 'cliente' });
    await setDoc(doc(db, 'users/cui'), { fullName: 'Ana Souza', role: 'cuidador' });
    await setDoc(doc(db, 'bookings/b1'), { clientId: 'cli', caregiverId: 'cui', status: 'solicitada' });
    await setDoc(doc(db, 'bookings/b1/private/pin'), { pin: '1234' });
    await setDoc(doc(db, 'bookings/b1/private/address'), { street: 'Rua A, 10' });
    await setDoc(doc(db, 'reviews/b1__cli'), { reviewerId: 'cli', revieweeId: 'cui', visible: false });
    await setDoc(doc(db, 'reviews/b0__cli'), { reviewerId: 'cli', revieweeId: 'cui', visible: true });
    await setDoc(doc(db, 'caregiversPrivate/cui'), { coordinate: { latitude: -23.5, longitude: -46.6 } });
  });
});

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

describe('perfil', () => {
  test('cria o próprio perfil, mas não se suspende nem se dá nota', async () => {
    await assertSucceeds(setDoc(doc(as('novo'), 'users/novo'), { fullName: 'Rafa Melo', role: 'cliente' }));
    await assertFails(setDoc(doc(as('x'), 'users/x'), { fullName: 'Rafa', role: 'cliente', ratingAvg: 5 }));
    await assertFails(setDoc(doc(as('y'), 'users/y'), { fullName: 'Rafa', role: 'admin' }));
  });

  test('não troca o papel nem lê o perfil de outra pessoa', async () => {
    await assertSucceeds(updateDoc(doc(as('cli'), 'users/cli'), { phone: '11999990000' }));
    await assertFails(updateDoc(doc(as('cli'), 'users/cli'), { role: 'cuidador' }));
    await assertFails(updateDoc(doc(as('cli'), 'users/cli'), { suspended: false }));
    await assertFails(getDoc(doc(as('cli'), 'users/cui')));
  });
});

describe('verificações', () => {
  test('envia para análise, mas não aprova', async () => {
    const db = as('cui');
    await assertSucceeds(setDoc(doc(db, 'verifications/cui'), { cpf: { status: 'em_analise' } }));
    await assertFails(setDoc(doc(db, 'verifications/cui'), { cpf: { status: 'aprovado' } }));
    await assertFails(
      setDoc(doc(db, 'verifications/cui'), { cpf: { status: 'em_analise' }, antecedentes: { status: 'em_analise', validUntil: '2099-01-01' } }),
    );
    await assertFails(setDoc(doc(as('cli'), 'verifications/cui'), { cpf: { status: 'em_analise' } }));
  });

  test('não reenvia o que já está aprovado', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'verifications/cui'), { cpf: { status: 'aprovado' } }),
    );
    await assertFails(updateDoc(doc(as('cui'), 'verifications/cui'), { cpf: { status: 'em_analise' } }));
    await assertSucceeds(updateDoc(doc(as('cui'), 'verifications/cui'), { selfie: { status: 'em_analise' } }));
  });
});

describe('cuidador', () => {
  const profile = { name: 'Ana Souza', photoURL: null, bio: 'Oi', categories: ['baba'], serviceRadiusKm: 10, available: true };

  test('cria o perfil público sem campos de confiança', async () => {
    await assertSucceeds(setDoc(doc(as('cui'), 'caregivers/cui'), profile));
    await assertFails(updateDoc(doc(as('cui'), 'caregivers/cui'), { eligible: true }));
    await assertFails(updateDoc(doc(as('cui'), 'caregivers/cui'), { rating: 5 }));
    await assertSucceeds(updateDoc(doc(as('cui'), 'caregivers/cui'), { available: false }));
  });

  test('cliente não vira cuidador e ninguém lê a localização exata', async () => {
    await assertFails(setDoc(doc(as('cli'), 'caregivers/cli'), profile));
    await assertFails(getDoc(doc(as('cui'), 'caregiversPrivate/cui')));
  });
});

describe('reserva', () => {
  test('só as partes leem, ninguém grava pelo app', async () => {
    await assertSucceeds(getDoc(doc(as('cli'), 'bookings/b1')));
    await assertSucceeds(getDoc(doc(as('cui'), 'bookings/b1')));
    await assertFails(getDoc(doc(as('outro'), 'bookings/b1')));
    await assertFails(updateDoc(doc(as('cli'), 'bookings/b1'), { status: 'concluida' }));
    await assertFails(updateDoc(doc(as('cui'), 'bookings/b1'), { status: 'em_andamento' }));
  });

  test('PIN só para o cliente', async () => {
    await assertSucceeds(getDoc(doc(as('cli'), 'bookings/b1/private/pin')));
    await assertFails(getDoc(doc(as('cui'), 'bookings/b1/private/pin')));
  });

  test('endereço exato só depois que o cuidador aceita', async () => {
    await assertFails(getDoc(doc(as('cui'), 'bookings/b1/private/address')));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'bookings/b1'), { status: 'aceita' }));
    await assertSucceeds(getDoc(doc(as('cui'), 'bookings/b1/private/address')));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'bookings/b1'), { status: 'concluida' }));
    await assertFails(getDoc(doc(as('cui'), 'bookings/b1/private/address')));
  });
});

describe('avaliações às cegas', () => {
  test('quem recebeu só vê depois de liberada; quem escreveu sempre vê', async () => {
    await assertFails(getDoc(doc(as('cui'), 'reviews/b1__cli')));
    await assertSucceeds(getDoc(doc(as('cli'), 'reviews/b1__cli')));
    await assertSucceeds(getDoc(doc(as('cui'), 'reviews/b0__cli')));
    await assertFails(getDoc(doc(as(null), 'reviews/b0__cli')));
    await assertFails(setDoc(doc(as('cli'), 'reviews/b2__cli'), { rating: 5, visible: true }));
  });
});
