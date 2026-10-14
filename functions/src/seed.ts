import type { Firestore } from 'firebase-admin/firestore';

import { coarse, refreshCaregiverEligibility, setCaregiverLocation } from './logic';
import { DEMO_CAREGIVERS, NATIONAL_HOLIDAYS, SAMPLE_PRICING_RULES, SPECIALTIES } from './shared/seedData';

export { DEMO_CAREGIVERS };

// Dados iniciais: tabelas da equipe (tarifas, feriados, especialidades) e, para testes e
// demonstração, alguns cuidadores já verificados perto da Av. Paulista.

export async function seedReferenceData(db: Firestore): Promise<void> {
  const batch = db.batch();
  for (const rule of SAMPLE_PRICING_RULES) batch.set(db.doc(`pricingRules/${rule.category}__${rule.city}`), rule);
  for (const [day, name] of Object.entries(NATIONAL_HOLIDAYS)) batch.set(db.doc(`holidays/${day}__*`), { day, name, city: null });
  for (const s of SPECIALTIES) batch.set(db.doc(`specialties/${s.id}`), s);
  await batch.commit();
}

export async function seedDemoCaregivers(db: Firestore, city = 'São Paulo'): Promise<void> {
  const approved = { status: 'aprovado', updatedAt: '2026-10-01T12:00:00.000Z' };
  for (const c of DEMO_CAREGIVERS) {
    await db.doc(`users/${c.id}`).set({ fullName: c.name, role: 'cuidador', createdAt: '2026-10-01T12:00:00.000Z' });
    await db.doc(`caregivers/${c.id}`).set({
      name: c.name, photoURL: null, bio: c.bio, categories: c.categories,
      specialties: SPECIALTIES.filter((s) => c.specialtyIds.includes(s.id)),
      rating: c.rating, reviewCount: c.reviewCount, serviceRadiusKm: 15, available: true, approvedByStaff: true,
      coordinate: coarse(c.coordinate), city,
    });
    await db.doc(`verifications/${c.id}`).set({
      cpf: approved, documento: approved, selfie: approved, antecedentes: { ...approved, validUntil: '2099-12-31' },
    });
    await setCaregiverLocation(db, c.id, { coordinate: c.coordinate, city });
    await refreshCaregiverEligibility(db, c.id);
  }
}
