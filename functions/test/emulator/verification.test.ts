import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { seedReferenceData } from '../../src/seed';
import { isIdentityVerified } from '../../src/shared/rules';
import type { Verifications } from '../../src/shared/models';
import * as verification from '../../src/verification';

// Envio de documentos e análise da equipe contra o Firestore do emulador (npm run test:emulator).

const projectId = 'demo-cuida-verification';
const app = initializeApp({ projectId }, 'verification-tests');
const db = getFirestore(app);

const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD';
const CPF = '529.982.247-25';

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await seedReferenceData(db);
  await db.doc('users/cui').set({ fullName: 'Ana Souza', role: 'cuidador' });
  await db.doc('caregivers/cui').set({ name: 'Ana Souza', categories: ['baba'], serviceRadiusKm: 10, available: true });
  await db.doc('users/cli').set({ fullName: 'Carla Dias', role: 'cliente' });
  await db.doc('staff/equipe').set({});
});
afterAll(() => deleteApp(app));

const status = async (uid: string) => (await db.doc(`verifications/${uid}`).get()).data() as Verifications | undefined;
const queue = () => verification.staffQueue(db, 'equipe');

describe('envio', () => {
  test('CPF válido e fotos vão para análise e para a fila da equipe', async () => {
    await verification.submitVerification(db, 'cui', { kind: 'cpf', cpf: CPF });
    await verification.submitVerification(db, 'cui', { kind: 'selfie', image: JPEG });
    expect((await status('cui'))?.cpf?.status).toBe('em_analise');
    expect((await db.doc('verificationData/cui').get()).data()).toEqual({ cpf: '52998224725' });
    expect((await db.doc('verificationFiles/cui__selfie').get()).data()?.image).toBe(JPEG);
    expect(await queue()).toMatchObject([{ uid: 'cui', fullName: 'Ana Souza', kinds: ['cpf', 'selfie'], awaitingApproval: false }]);
  });

  test('recusa CPF inválido, foto que não é JPEG e reenvio do que está em análise', async () => {
    await expect(verification.submitVerification(db, 'cui', { kind: 'cpf', cpf: '111.111.111-11' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(verification.submitVerification(db, 'cui', { kind: 'documento', image: 'iVBORw0KGgo' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await verification.submitVerification(db, 'cui', { kind: 'documento', image: JPEG });
    await expect(verification.submitVerification(db, 'cui', { kind: 'documento', image: JPEG })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('um CPF só pode estar em uma conta', async () => {
    await verification.submitVerification(db, 'cui', { kind: 'cpf', cpf: CPF });
    await expect(verification.submitVerification(db, 'cli', { kind: 'cpf', cpf: '52998224725' })).rejects.toMatchObject({
      message: 'Este CPF já está em outra conta.',
    });
  });

  test('cliente não envia certidão de antecedentes', async () => {
    await expect(verification.submitVerification(db, 'cli', { kind: 'antecedentes', image: JPEG })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('equipe', () => {
  test('só quem está em staff vê a fila e analisa', async () => {
    await expect(verification.staffQueue(db, 'cui')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(verification.staffReview(db, 'cui', { uid: 'cui', kind: 'cpf', approve: true })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('aprova tudo, libera o cuidador e ele passa a aparecer na busca', async () => {
    await verification.submitVerification(db, 'cui', { kind: 'cpf', cpf: CPF });
    for (const kind of ['documento', 'selfie', 'antecedentes'] as const) await verification.submitVerification(db, 'cui', { kind, image: JPEG });

    const details = await verification.staffDetails(db, 'equipe', { uid: 'cui' });
    expect(details).toMatchObject({ cpf: '52998224725', approvedByStaff: false, files: { documento: JPEG, selfie: JPEG, antecedentes: JPEG } });

    await expect(verification.staffReview(db, 'equipe', { uid: 'cui', kind: 'antecedentes', approve: true })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    for (const kind of ['cpf', 'documento', 'selfie'] as const) await verification.staffReview(db, 'equipe', { uid: 'cui', kind, approve: true });
    await verification.staffReview(db, 'equipe', { uid: 'cui', kind: 'antecedentes', approve: true, validUntil: '2099-01-01' });

    expect((await db.doc('caregivers/cui').get()).data()).toMatchObject({ isIdentityVerified: true, eligible: false });
    expect(await queue()).toMatchObject([{ uid: 'cui', kinds: [], awaitingApproval: true }]);

    await verification.staffApproveCaregiver(db, 'equipe', { uid: 'cui', approved: true });
    expect((await db.doc('caregivers/cui').get()).data()).toMatchObject({ approvedByStaff: true, eligible: true });
    expect(await queue()).toEqual([]);
  });

  test('reprova com motivo, libera o CPF e permite reenviar', async () => {
    await verification.submitVerification(db, 'cli', { kind: 'cpf', cpf: CPF });
    await expect(verification.staffReview(db, 'equipe', { uid: 'cli', kind: 'cpf', approve: false })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await verification.staffReview(db, 'equipe', { uid: 'cli', kind: 'cpf', approve: false, reason: 'CPF não bate com o documento.' });
    expect((await status('cli'))?.cpf).toMatchObject({ status: 'reprovado', reason: 'CPF não bate com o documento.' });
    expect(await queue()).toEqual([]);
    // Outra conta pode usar o CPF liberado, e a própria pessoa pode reenviar.
    await verification.submitVerification(db, 'cli', { kind: 'cpf', cpf: '390.533.447-05' });
    expect((await status('cli'))?.cpf).toMatchObject({ status: 'em_analise', reason: null });
  });

  test('cliente com tudo aprovado fica com identidade verificada', async () => {
    await verification.submitVerification(db, 'cli', { kind: 'cpf', cpf: CPF });
    for (const kind of ['documento', 'selfie'] as const) await verification.submitVerification(db, 'cli', { kind, image: JPEG });
    for (const kind of ['cpf', 'documento', 'selfie'] as const) await verification.staffReview(db, 'equipe', { uid: 'cli', kind, approve: true });
    expect(isIdentityVerified(await status('cli'))).toBe(true);
  });
});
