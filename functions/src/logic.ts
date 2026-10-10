import { randomInt } from 'node:crypto';

import type { DocumentData, Firestore, Transaction } from 'firebase-admin/firestore';
import { distanceBetween, geohashForLocation, geohashQueryBounds } from 'geofire-common';

import type {
  BillingMode,
  Booking,
  CaregiverResult,
  CaregiverSummary,
  Coordinate,
  PricingRule,
  ServiceCategory,
  Verifications,
} from './shared/models';
import { ACTIVE_STATUSES } from './shared/models';
import { localParts, PricingError, quote } from './shared/pricing';
import { BookingEvent, isCaregiverEligible, isIdentityVerified, nextStatus, TransitionError } from './shared/rules';

// Regras de negócio que precisam do banco. Recebem o Firestore como parâmetro para que os
// testes rodem contra o emulador; index.ts só faz a ponte com as Cloud Functions.

export class AppError extends Error {
  constructor(
    public code: 'unauthenticated' | 'permission-denied' | 'not-found' | 'failed-precondition' | 'invalid-argument',
    message: string,
  ) {
    super(message);
  }
}

/** Raio máximo de busca, em km (o raio de cada cuidador é aplicado depois). */
const MAX_SEARCH_RADIUS_KM = 30;

const nowIso = () => new Date().toISOString();
const today = () => localParts(new Date()).day;

/** Coordenada arredondada (~1 km) para não expor o endereço de ninguém. */
export function coarse(c: Coordinate): Coordinate {
  return { latitude: Math.round(c.latitude * 100) / 100, longitude: Math.round(c.longitude * 100) / 100 };
}

function assertCoordinate(c: unknown): asserts c is Coordinate {
  const v = c as Coordinate;
  if (
    !v || typeof v.latitude !== 'number' || typeof v.longitude !== 'number' ||
    Math.abs(v.latitude) > 90 || Math.abs(v.longitude) > 180
  ) {
    throw new AppError('invalid-argument', 'Localização inválida.');
  }
}

async function getRole(db: Firestore, uid: string): Promise<{ role: string; fullName: string; suspended: boolean }> {
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) throw new AppError('failed-precondition', 'Complete seu cadastro primeiro.');
  const data = snap.data()!;
  return { role: data.role, fullName: data.fullName, suspended: !!data.suspended };
}

async function pricingRule(db: Firestore, category: ServiceCategory, city: string): Promise<PricingRule> {
  const snap = await db.doc(`pricingRules/${category}__${city}`).get();
  if (!snap.exists) throw new AppError('failed-precondition', 'Ainda não atendemos essa cidade.');
  return snap.data() as PricingRule;
}

async function isHoliday(db: Firestore, start: Date, city: string): Promise<boolean> {
  const day = localParts(start).day;
  const [national, local] = await Promise.all([
    db.doc(`holidays/${day}__*`).get(),
    db.doc(`holidays/${day}__${city}`).get(),
  ]);
  return national.exists || local.exists;
}

function parseDate(value: unknown, field: string): Date {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new AppError('invalid-argument', `Data inválida: ${field}.`);
  return date;
}

function overlaps(aStart: string, aEnd: string, bStart: Date, bEnd: Date): boolean {
  return new Date(aStart) < bEnd && new Date(aEnd) > bStart;
}

// Cadastro do cuidador ----------------------------------------------------------------------

/** Grava a localização exata (privada) e a pública arredondada do cuidador. */
export async function setCaregiverLocation(
  db: Firestore,
  uid: string,
  input: { coordinate: unknown; city: unknown },
): Promise<void> {
  assertCoordinate(input.coordinate);
  const city = String(input.city ?? '').trim();
  if (!city) throw new AppError('invalid-argument', 'Informe a cidade.');
  const { role } = await getRole(db, uid);
  if (role !== 'cuidador') throw new AppError('permission-denied', 'Só cuidadores têm localização de atendimento.');

  const exact = input.coordinate;
  await db.doc(`caregiversPrivate/${uid}`).set({
    coordinate: exact,
    geohash: geohashForLocation([exact.latitude, exact.longitude]),
    city,
  });
  await db.doc(`caregivers/${uid}`).set({ coordinate: coarse(exact), city }, { merge: true });
}

/** Recalcula os campos que só o servidor controla quando as verificações mudam. */
export async function refreshCaregiverEligibility(db: Firestore, uid: string): Promise<void> {
  const [user, verif, caregiver] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`verifications/${uid}`).get(),
    db.doc(`caregivers/${uid}`).get(),
  ]);
  if (!caregiver.exists) return;
  const v = (verif.data() ?? {}) as Verifications;
  const background = v.antecedentes?.status === 'aprovado' ? v.antecedentes.updatedAt ?? nowIso() : null;
  await caregiver.ref.update({
    isIdentityVerified: isIdentityVerified(v),
    backgroundCheckedAt: background,
    eligible: isCaregiverEligible(v, {
      approvedByStaff: !!caregiver.data()!.approvedByStaff,
      suspended: !!user.data()?.suspended,
      today: today(),
    }),
  });
}

// Busca -------------------------------------------------------------------------------------

export interface SearchInput {
  category: ServiceCategory;
  coordinate: Coordinate;
  start: string;
  end: string;
  mode: BillingMode;
  dependents?: number;
  tripsKm?: number;
  specialtyIds?: string[];
}

export async function searchCaregivers(db: Firestore, input: SearchInput): Promise<CaregiverResult[]> {
  assertCoordinate(input.coordinate);
  const start = parseDate(input.start, 'início');
  const end = parseDate(input.end, 'término');
  const center: [number, number] = [input.coordinate.latitude, input.coordinate.longitude];
  const specialtyIds = input.specialtyIds ?? [];
  const holidays = new Map<string, boolean>();

  // Candidatos pelo geohash da localização exata (coleção privada, só o servidor lê).
  const bounds = geohashQueryBounds(center, MAX_SEARCH_RADIUS_KM * 1000);
  const snaps = await Promise.all(
    bounds.map(([from, to]) => db.collection('caregiversPrivate').orderBy('geohash').startAt(from).endAt(to).get()),
  );
  const nearby = new Map<string, { km: number; city: string }>();
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      const c = doc.data().coordinate as Coordinate;
      nearby.set(doc.id, { km: distanceBetween([c.latitude, c.longitude], center), city: doc.data().city });
    }
  }

  const results: CaregiverResult[] = [];
  const rules = new Map<string, PricingRule>();
  for (const [id, { km, city }] of nearby) {
    const snap = await db.doc(`caregivers/${id}`).get();
    const c = snap.data();
    if (!c || !c.eligible || !c.available) continue;
    if (km > c.serviceRadiusKm) continue;
    if (!(c.categories as string[]).includes(input.category)) continue;
    const approved = new Set((c.specialties as { id: string }[]).map((s) => s.id));
    if (!specialtyIds.every((s) => approved.has(s))) continue;

    const busy = await db.collection('bookings').where('caregiverId', '==', id).where('status', 'in', ACTIVE_STATUSES).get();
    if (busy.docs.some((b) => overlaps(b.data().start, b.data().end, start, end))) continue;

    if (!rules.has(city)) {
      try {
        rules.set(city, await pricingRule(db, input.category, city));
        holidays.set(city, await isHoliday(db, start, city));
      } catch {
        continue;
      }
    }
    const price = quote(
      {
        category: input.category, start, end, mode: input.mode, dependents: input.dependents ?? 1,
        distanceToLocationKm: km, tripsDuringServiceKm: input.tripsKm ?? 0,
        requiresSpecialty: specialtyIds.length > 0, isHoliday: !!holidays.get(city),
      },
      rules.get(city)!,
    );
    results.push({ caregiver: toSummary(id, c), distanceKm: Math.round(km * 10) / 10, price });
  }

  return results
    .sort((a, b) => b.caregiver.rating - a.caregiver.rating || a.distanceKm - b.distanceKm)
    .slice(0, 50);
}

function toSummary(id: string, c: DocumentData): CaregiverSummary {
  return {
    id,
    name: c.name,
    photoURL: c.photoURL ?? null,
    bio: c.bio ?? '',
    categories: c.categories ?? [],
    specialties: c.specialties ?? [],
    rating: c.rating ?? 0,
    reviewCount: c.reviewCount ?? 0,
    coordinate: c.coordinate,
    serviceRadiusKm: c.serviceRadiusKm,
    isIdentityVerified: !!c.isIdentityVerified,
    backgroundCheckedAt: c.backgroundCheckedAt ?? null,
  };
}

// Reserva -----------------------------------------------------------------------------------

export interface CreateBookingInput {
  caregiverId: string;
  addressId: string;
  category: ServiceCategory;
  start: string;
  end: string;
  mode: BillingMode;
  dependents?: number;
  tripsKm?: number;
  requiresSpecialty?: boolean;
  notes?: string;
}

export async function createBooking(db: Firestore, clientId: string, input: CreateBookingInput): Promise<Booking> {
  const start = parseDate(input.start, 'início');
  const end = parseDate(input.end, 'término');
  if (start.getTime() < Date.now()) throw new AppError('invalid-argument', 'O início precisa ser no futuro.');

  const client = await getRole(db, clientId);
  if (client.role !== 'cliente' || client.suspended) throw new AppError('permission-denied', 'Conta sem permissão para reservar.');
  const clientVerif = (await db.doc(`verifications/${clientId}`).get()).data() as Verifications | undefined;
  if (!isIdentityVerified(clientVerif)) {
    throw new AppError('failed-precondition', 'Verifique sua identidade (CPF e selfie) antes de reservar.');
  }

  const addressSnap = await db.doc(`users/${clientId}/addresses/${input.addressId}`).get();
  if (!addressSnap.exists) throw new AppError('not-found', 'Endereço não encontrado.');
  const address = addressSnap.data() as { label: string; street: string; city: string; coordinate: Coordinate };

  const [caregiverSnap, privateSnap] = await Promise.all([
    db.doc(`caregivers/${input.caregiverId}`).get(),
    db.doc(`caregiversPrivate/${input.caregiverId}`).get(),
  ]);
  const caregiver = caregiverSnap.data();
  if (!caregiver || !caregiver.eligible || !(caregiver.categories as string[]).includes(input.category) || !privateSnap.exists) {
    throw new AppError('failed-precondition', 'Este cuidador não está disponível.');
  }
  const exact = privateSnap.data()!.coordinate as Coordinate;
  const km = distanceBetween([exact.latitude, exact.longitude], [address.coordinate.latitude, address.coordinate.longitude]);
  if (km > caregiver.serviceRadiusKm) throw new AppError('failed-precondition', 'Endereço fora da área do cuidador.');

  const rule = await pricingRule(db, input.category, address.city);
  let price;
  try {
    price = quote(
      {
        category: input.category, start, end, mode: input.mode, dependents: input.dependents ?? 1,
        distanceToLocationKm: km, tripsDuringServiceKm: input.tripsKm ?? 0,
        requiresSpecialty: !!input.requiresSpecialty, isHoliday: await isHoliday(db, start, address.city),
      },
      rule,
    );
  } catch (e) {
    if (e instanceof PricingError) throw new AppError('invalid-argument', 'Horário ou dados da reserva inválidos.');
    throw e;
  }

  const ref = db.collection('bookings').doc();
  const now = nowIso();
  const booking: Booking = {
    id: ref.id,
    category: input.category,
    clientId,
    caregiverId: input.caregiverId,
    caregiver: toSummary(input.caregiverId, caregiver),
    clientName: client.fullName.split(' ')[0],
    addressLabel: address.label,
    city: address.city,
    start: start.toISOString(),
    end: end.toISOString(),
    mode: input.mode,
    dependents: input.dependents ?? 1,
    status: 'solicitada',
    notes: String(input.notes ?? '').slice(0, 1000),
    price,
    createdAt: now,
    updatedAt: now,
  };

  // Checagem de conflito e gravação na mesma transação: dois clientes não reservam o mesmo horário.
  await db.runTransaction(async (tx: Transaction) => {
    const busy = await tx.get(
      db.collection('bookings').where('caregiverId', '==', input.caregiverId).where('status', 'in', ACTIVE_STATUSES),
    );
    if (busy.docs.some((b) => overlaps(b.data().start, b.data().end, start, end))) {
      throw new AppError('failed-precondition', 'O cuidador já tem uma reserva nesse horário.');
    }
    tx.set(ref, booking);
    tx.set(ref.collection('private').doc('pin'), { pin: String(randomInt(0, 10_000)).padStart(4, '0') });
    tx.set(ref.collection('private').doc('address'), { street: address.street, coordinate: address.coordinate });
    // O pagamento é autorizado pela integração com o gateway a partir deste registro.
    tx.set(db.doc(`payments/${ref.id}`), {
      status: 'pendente', amount: price.total, platformFee: price.platformFee, caregiverPayout: price.caregiverPayout,
    });
  });

  return booking;
}

export async function bookingTransition(
  db: Firestore,
  uid: string,
  input: { bookingId: string; event: BookingEvent; pin?: string },
): Promise<Booking> {
  const ref = db.doc(`bookings/${input.bookingId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AppError('not-found', 'Reserva não encontrada.');
    const booking = snap.data() as Booking;
    const actor = booking.caregiverId === uid ? 'cuidador' : booking.clientId === uid ? 'cliente' : null;
    if (!actor) throw new AppError('permission-denied', 'Reserva de outra pessoa.');

    const pinSnap = await tx.get(ref.collection('private').doc('pin'));
    let status;
    try {
      status = nextStatus(booking.status, input.event, actor, { given: input.pin, expected: pinSnap.data()?.pin });
    } catch (e) {
      if (e instanceof TransitionError) {
        throw new AppError(
          'failed-precondition',
          e.code === 'wrong_pin' ? 'Código incorreto. Confira o código no app do cliente.' : 'Essa ação não é possível agora.',
        );
      }
      throw e;
    }

    const now = nowIso();
    const update: Record<string, string> = { status, updatedAt: now };
    if (status === 'em_andamento') update.checkedInAt = now;
    if (status === 'concluida') update.checkedOutAt = now;
    tx.update(ref, update);
    // Captura, estorno e multa de cancelamento ficam com a integração de pagamento (gatilho em bookings).
    return { ...booking, ...update } as Booking;
  });
}

export async function submitReview(
  db: Firestore,
  uid: string,
  input: { bookingId: string; rating: number; tags?: string[]; comment?: string | null },
): Promise<void> {
  const rating = Math.round(Number(input.rating));
  if (!(rating >= 1 && rating <= 5)) throw new AppError('invalid-argument', 'A nota vai de 1 a 5.');
  const bookingRef = db.doc(`bookings/${input.bookingId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    const booking = snap.data() as Booking | undefined;
    if (!booking || (uid !== booking.clientId && uid !== booking.caregiverId)) {
      throw new AppError('permission-denied', 'Reserva de outra pessoa.');
    }
    if (booking.status !== 'concluida' && booking.status !== 'avaliada') {
      throw new AppError('failed-precondition', 'Só dá para avaliar depois do serviço.');
    }
    const revieweeId = uid === booking.clientId ? booking.caregiverId : booking.clientId;
    const mine = db.doc(`reviews/${input.bookingId}__${uid}`);
    const other = db.doc(`reviews/${input.bookingId}__${revieweeId}`);
    const [mineSnap, otherSnap, reviewer, revieweeUser] = await Promise.all([
      tx.get(mine), tx.get(other), tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`users/${revieweeId}`)),
    ]);
    if (mineSnap.exists) throw new AppError('failed-precondition', 'Você já avaliou esta reserva.');

    const name = String(reviewer.data()?.fullName ?? '').split(' ');
    const both = otherSnap.exists;
    tx.set(mine, {
      id: mine.id, bookingId: booking.id, reviewerId: uid, revieweeId,
      authorName: `${name[0] ?? ''} ${name[1]?.[0] ? `${name[1][0]}.` : ''}`.trim(),
      rating, tags: (input.tags ?? []).slice(0, 5), comment: input.comment ? String(input.comment).slice(0, 1000) : null,
      createdAt: nowIso(), visible: both,
    });
    if (both) {
      tx.update(other, { visible: true });
      tx.update(bookingRef, { status: 'avaliada', updatedAt: nowIso() });
    }

    // Média de quem recebeu a nota (no perfil e, se for cuidador, no perfil público).
    const prev = revieweeUser.data() ?? {};
    const count = (prev.ratingCount ?? 0) + 1;
    const avg = Math.round((((prev.ratingAvg ?? 0) * (count - 1) + rating) / count) * 100) / 100;
    tx.set(db.doc(`users/${revieweeId}`), { ratingAvg: avg, ratingCount: count }, { merge: true });
    if (revieweeId === booking.caregiverId) {
      tx.set(db.doc(`caregivers/${revieweeId}`), { rating: avg, reviewCount: count }, { merge: true });
    }
  });
}

export async function triggerEmergency(
  db: Firestore,
  uid: string,
  input: { bookingId?: string | null; coordinate?: Coordinate | null },
): Promise<void> {
  if (input.bookingId) {
    const booking = (await db.doc(`bookings/${input.bookingId}`).get()).data();
    if (!booking || (booking.clientId !== uid && booking.caregiverId !== uid)) {
      throw new AppError('permission-denied', 'Reserva de outra pessoa.');
    }
  }
  if (input.coordinate) assertCoordinate(input.coordinate);
  // Um gatilho nesta coleção envia SMS aos contatos de emergência (integração a fazer).
  await db.collection('emergencies').add({
    profileId: uid, bookingId: input.bookingId ?? null, coordinate: input.coordinate ?? null, createdAt: nowIso(),
  });
}

/** Rotina diária: vence certidões de antecedentes e libera avaliações com mais de 7 dias. */
export async function dailyMaintenance(db: Firestore): Promise<{ expired: number; revealed: number }> {
  const day = today();
  let expired = 0;
  const verifs = await db.collection('verifications').where('antecedentes.validUntil', '<', day).get();
  for (const doc of verifs.docs) {
    if (doc.data().antecedentes?.status !== 'aprovado') continue;
    await doc.ref.update({ 'antecedentes.status': 'expirado', 'antecedentes.updatedAt': nowIso() });
    await refreshCaregiverEligibility(db, doc.id);
    expired++;
  }
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const hidden = await db.collection('reviews').where('visible', '==', false).where('createdAt', '<', weekAgo).get();
  for (const doc of hidden.docs) await doc.ref.update({ visible: true });
  return { expired, revealed: hidden.size };
}
