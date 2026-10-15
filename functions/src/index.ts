import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/https';
import { onSchedule } from 'firebase-functions/scheduler';

import { CallName, calls } from './calls';
import * as logic from './logic';
import { TIME_ZONE } from './shared/pricing';

// Ponte entre as Cloud Functions e as regras em logic.ts.

initializeApp();
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 10 });
const db = getFirestore();

/** Exige login e converte AppError em HttpsError, que o app recebe com código e mensagem. */
function callable(name: CallName) {
  return onCall(async (request: CallableRequest<never>) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
    try {
      return await calls[name](db, uid, request.data);
    } catch (e) {
      if (e instanceof logic.AppError) throw new HttpsError(e.code, e.message);
      throw e;
    }
  });
}

export const setCaregiverLocation = callable('setCaregiverLocation');
export const searchCaregivers = callable('searchCaregivers');
export const createBooking = callable('createBooking');
export const bookingTransition = callable('bookingTransition');
export const submitReview = callable('submitReview');
export const triggerEmergency = callable('triggerEmergency');
export const submitVerification = callable('submitVerification');
export const staffQueue = callable('staffQueue');
export const staffDetails = callable('staffDetails');
export const staffReview = callable('staffReview');
export const staffApproveCaregiver = callable('staffApproveCaregiver');

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
