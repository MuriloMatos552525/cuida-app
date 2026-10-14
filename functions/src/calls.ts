import type { Firestore } from 'firebase-admin/firestore';

import * as logic from './logic';
import * as verification from './verification';

// Operações que o app chama. Usadas pelas Cloud Functions (index.ts) e pela API HTTP (http.ts).

type Call = (db: Firestore, uid: string, data: never) => Promise<unknown>;

export const calls = {
  setCaregiverLocation: (db, uid, data: { coordinate: unknown; city: unknown }) => logic.setCaregiverLocation(db, uid, data),
  searchCaregivers: (db, _uid, data: logic.SearchInput) => logic.searchCaregivers(db, data),
  createBooking: (db, uid, data: logic.CreateBookingInput) => logic.createBooking(db, uid, data),
  bookingTransition: (db, uid, data: Parameters<typeof logic.bookingTransition>[2]) => logic.bookingTransition(db, uid, data),
  submitReview: (db, uid, data: Parameters<typeof logic.submitReview>[2]) => logic.submitReview(db, uid, data),
  triggerEmergency: (db, uid, data: Parameters<typeof logic.triggerEmergency>[2]) => logic.triggerEmergency(db, uid, data),
  submitVerification: (db, uid, data: verification.SubmitVerificationInput) => verification.submitVerification(db, uid, data),
  staffQueue: (db, uid) => verification.staffQueue(db, uid),
  staffDetails: (db, uid, data: { uid: string }) => verification.staffDetails(db, uid, data),
  staffReview: (db, uid, data: verification.StaffReviewInput) => verification.staffReview(db, uid, data),
  staffApproveCaregiver: (db, uid, data: { uid: string; approved: boolean }) => verification.staffApproveCaregiver(db, uid, data),
} satisfies Record<string, Call>;

export type CallName = keyof typeof calls;
