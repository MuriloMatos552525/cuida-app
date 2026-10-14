import { Firestore } from 'firebase-admin/firestore';

import { cpfDigits, isValidCpf } from './shared/cpf';
import {
  ReviewDetails,
  ReviewQueueEntry,
  UserRole,
  VerificationKind,
  Verifications,
  VERIFICATION_KINDS,
} from './shared/models';
import { isIdentityVerified } from './shared/rules';
import { AppError, getRole, nowIso, refreshCaregiverEligibility } from './logic';

// Verificação de identidade: a pessoa envia CPF, documento, selfie e (cuidador) certidão de
// antecedentes; a equipe analisa e aprova ou reprova. As fotos ficam no Firestore, em coleções
// que o app não consegue ler (verificationFiles), para funcionar também no plano grátis.

type FileKind = Exclude<VerificationKind, 'cpf'>;
const FILE_KINDS: FileKind[] = ['documento', 'selfie', 'antecedentes'];
/** JPEG em base64; o documento do Firestore aceita até 1 MiB. */
const MAX_IMAGE_CHARS = 900_000;

export interface SubmitVerificationInput {
  kind: VerificationKind;
  cpf?: string;
  /** Foto em JPEG, em base64 (sem o prefixo data:). */
  image?: string;
}

const fileDoc = (uid: string, kind: FileKind) => `verificationFiles/${uid}__${kind}`;

export async function submitVerification(db: Firestore, uid: string, input: SubmitVerificationInput): Promise<void> {
  const { role } = await getRole(db, uid);
  const kind = input?.kind;
  if (!VERIFICATION_KINDS.includes(kind)) throw new AppError('invalid-argument', 'Item de verificação inválido.');
  if (kind === 'antecedentes' && role !== 'cuidador') {
    throw new AppError('invalid-argument', 'Só cuidadores enviam certidão de antecedentes.');
  }

  const verifRef = db.doc(`verifications/${uid}`);
  const current = ((await verifRef.get()).data() ?? {}) as Verifications;
  const status = current[kind]?.status ?? 'pendente';
  if (status === 'em_analise' || status === 'aprovado') {
    throw new AppError('failed-precondition', status === 'aprovado' ? 'Este item já foi aprovado.' : 'Este item já está em análise.');
  }

  if (kind === 'cpf') {
    const cpf = cpfDigits(String(input.cpf ?? ''));
    if (!isValidCpf(cpf)) throw new AppError('invalid-argument', 'CPF inválido. Confira os números.');
    // Um CPF por conta: impede que alguém reprovado ou suspenso volte com outra conta.
    await db.runTransaction(async (tx) => {
      const claim = db.doc(`cpfIndex/${cpf}`);
      const owner = await tx.get(claim);
      if (owner.exists && owner.data()!.uid !== uid) throw new AppError('failed-precondition', 'Este CPF já está em outra conta.');
      const previous = (await tx.get(db.doc(`verificationData/${uid}`))).data()?.cpf;
      if (previous && previous !== cpf) tx.delete(db.doc(`cpfIndex/${previous}`));
      tx.set(claim, { uid });
      tx.set(db.doc(`verificationData/${uid}`), { cpf }, { merge: true });
    });
  } else {
    const image = typeof input.image === 'string' ? input.image : '';
    // "/9j/" é o começo de todo JPEG em base64.
    if (!image.startsWith('/9j/') || !/^[A-Za-z0-9+/]+=*$/.test(image)) {
      throw new AppError('invalid-argument', 'Envie uma foto.');
    }
    if (image.length > MAX_IMAGE_CHARS) throw new AppError('invalid-argument', 'A foto ficou grande demais. Tente de novo.');
    await db.doc(fileDoc(uid, kind)).set({ image, uploadedAt: nowIso() });
  }

  await verifRef.set({ [kind]: { status: 'em_analise', updatedAt: nowIso(), validUntil: null, reason: null } }, { merge: true });
  await syncQueue(db, uid);
}

/** Mantém reviewQueue/{uid} igual ao que falta a equipe analisar dessa pessoa. */
export async function syncQueue(db: Firestore, uid: string): Promise<void> {
  const [user, verif, caregiver] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`verifications/${uid}`).get(),
    db.doc(`caregivers/${uid}`).get(),
  ]);
  const ref = db.doc(`reviewQueue/${uid}`);
  const v = (verif.data() ?? {}) as Verifications;
  const kinds = VERIFICATION_KINDS.filter((k) => v[k]?.status === 'em_analise');
  const role = user.data()?.role as UserRole | undefined;
  const awaitingApproval =
    role === 'cuidador' && caregiver.exists && !caregiver.data()!.approvedByStaff &&
    isIdentityVerified(v) && v.antecedentes?.status === 'aprovado';
  if (!user.exists || (kinds.length === 0 && !awaitingApproval)) {
    await ref.delete();
    return;
  }
  const entry: ReviewQueueEntry = { uid, fullName: user.data()!.fullName, role: role!, kinds, awaitingApproval, updatedAt: nowIso() };
  await ref.set(entry);
}

// Equipe -------------------------------------------------------------------------------------

/** Quem é da equipe tem um documento staff/{uid}, criado à mão no Console do Firebase. */
export async function isStaff(db: Firestore, uid: string): Promise<boolean> {
  return (await db.doc(`staff/${uid}`).get()).exists;
}

async function requireStaff(db: Firestore, uid: string) {
  if (!(await isStaff(db, uid))) throw new AppError('permission-denied', 'Só a equipe pode fazer isso.');
}

function targetOf(input: { uid?: unknown } | undefined): string {
  const target = input?.uid;
  if (typeof target !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(target)) throw new AppError('invalid-argument', 'Pessoa inválida.');
  return target;
}

export async function staffQueue(db: Firestore, uid: string): Promise<ReviewQueueEntry[]> {
  await requireStaff(db, uid);
  const snap = await db.collection('reviewQueue').orderBy('updatedAt').limit(100).get();
  return snap.docs.map((d) => d.data() as ReviewQueueEntry);
}

export async function staffDetails(db: Firestore, uid: string, input: { uid: string }): Promise<ReviewDetails> {
  await requireStaff(db, uid);
  const target = targetOf(input);
  const [user, verif, data, caregiver, ...files] = await db.getAll(
    db.doc(`users/${target}`),
    db.doc(`verifications/${target}`),
    db.doc(`verificationData/${target}`),
    db.doc(`caregivers/${target}`),
    ...FILE_KINDS.map((k) => db.doc(fileDoc(target, k))),
  );
  if (!user.exists) throw new AppError('not-found', 'Pessoa não encontrada.');
  const out: ReviewDetails = {
    uid: target,
    fullName: user.data()!.fullName,
    role: user.data()!.role,
    cpf: data.data()?.cpf ?? null,
    verifications: (verif.data() ?? {}) as Verifications,
    files: {},
    approvedByStaff: caregiver.exists ? !!caregiver.data()!.approvedByStaff : null,
  };
  FILE_KINDS.forEach((k, i) => {
    if (files[i].exists) out.files[k] = files[i].data()!.image;
  });
  return out;
}

export interface StaffReviewInput {
  uid: string;
  kind: VerificationKind;
  approve: boolean;
  /** Obrigatório ao reprovar; aparece para a pessoa. */
  reason?: string;
  /** AAAA-MM-DD; obrigatório ao aprovar a certidão de antecedentes. */
  validUntil?: string;
}

export async function staffReview(db: Firestore, uid: string, input: StaffReviewInput): Promise<void> {
  await requireStaff(db, uid);
  const target = targetOf(input);
  const { kind, approve } = input;
  if (!VERIFICATION_KINDS.includes(kind)) throw new AppError('invalid-argument', 'Item de verificação inválido.');

  const ref = db.doc(`verifications/${target}`);
  const v = ((await ref.get()).data() ?? {}) as Verifications;
  if (v[kind]?.status !== 'em_analise') throw new AppError('failed-precondition', 'Este item não está esperando análise.');

  let item;
  if (approve) {
    let validUntil: string | null = null;
    if (kind === 'antecedentes') {
      validUntil = String(input.validUntil ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || validUntil <= nowIso().slice(0, 10)) {
        throw new AppError('invalid-argument', 'Informe a validade da certidão (data futura).');
      }
    }
    item = { status: 'aprovado', validUntil, reason: null, updatedAt: nowIso() };
  } else {
    const reason = String(input.reason ?? '').trim();
    if (reason.length < 3) throw new AppError('invalid-argument', 'Escreva o motivo da reprovação.');
    item = { status: 'reprovado', validUntil: null, reason: reason.slice(0, 300), updatedAt: nowIso() };
    if (kind === 'cpf') {
      // Libera o CPF para ser enviado de novo (por exemplo, corrigido).
      const cpf = (await db.doc(`verificationData/${target}`).get()).data()?.cpf;
      if (cpf) await db.doc(`cpfIndex/${cpf}`).delete();
    }
  }
  await ref.set({ [kind]: item }, { merge: true });
  await refreshCaregiverEligibility(db, target);
  await syncQueue(db, target);
}

export async function staffApproveCaregiver(db: Firestore, uid: string, input: { uid: string; approved: boolean }): Promise<void> {
  await requireStaff(db, uid);
  const target = targetOf(input);
  const caregiver = db.doc(`caregivers/${target}`);
  if (!(await caregiver.get()).exists) throw new AppError('not-found', 'Esta pessoa ainda não criou o perfil de cuidador.');
  await caregiver.update({ approvedByStaff: !!input.approved });
  await refreshCaregiverEligibility(db, target);
  await syncQueue(db, target);
}
