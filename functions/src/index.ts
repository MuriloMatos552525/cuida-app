import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/https';
import { onSchedule } from 'firebase-functions/scheduler';

import * as logic from './logic';
import { TIME_ZONE } from './shared/pricing';

// Ponte entre as Cloud Functions e as regras em logic.ts.

initializeApp();
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 10 });
const db = getFirestore();

/** Exige login e converte AppError em HttpsError, que o app recebe com código e mensagem. */
function callable<In, Out>(handler: (uid: string, data: In) => Promise<Out>) {
  return onCall(async (request: CallableRequest<In>) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
    try {
      return await handler(uid, request.data);
    } catch (e) {
      if (e instanceof logic.AppError) throw new HttpsError(e.code, e.message);
      throw e;
    }
  });
}

export const setCaregiverLocation = callable((uid, data: { coordinate: unknown; city: unknown }) =>
  logic.setCaregiverLocation(db, uid, data),
);
export const searchCaregivers = callable((_uid, data: logic.SearchInput) => logic.searchCaregivers(db, data));
export const createBooking = callable((uid, data: logic.CreateBookingInput) => logic.createBooking(db, uid, data));
export const bookingTransition = callable((uid, data: Parameters<typeof logic.bookingTransition>[2]) =>
  logic.bookingTransition(db, uid, data),
);
export const submitReview = callable((uid, data: Parameters<typeof logic.submitReview>[2]) =>
  logic.submitReview(db, uid, data),
);
export const triggerEmergency = callable((uid, data: Parameters<typeof logic.triggerEmergency>[2]) =>
  logic.triggerEmergency(db, uid, data),
);

// Mudou a verificação (feita pela equipe ou pelo provedor) ou o perfil do cuidador: recalcula a elegibilidade.
export const onVerificationWritten = onDocumentWritten('verifications/{uid}', (event) =>
  logic.refreshCaregiverEligibility(db, event.params.uid),
);
export const onCaregiverWritten = onDocumentWritten('caregivers/{uid}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  // Só reage a mudanças da equipe, para não entrar em laço com a própria atualização.
  if (!after || before?.approvedByStaff === after.approvedByStaff) return;
  await logic.refreshCaregiverEligibility(db, event.params.uid);
});

export const dailyMaintenance = onSchedule({ schedule: 'every day 03:00', timeZone: TIME_ZONE }, async () => {
  await logic.dailyMaintenance(db);
});
