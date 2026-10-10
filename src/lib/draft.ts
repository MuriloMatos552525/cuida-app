import type { Address, BillingMode, CaregiverResult, ServiceCategory } from '@shared/models';

// Pedido em montagem, compartilhado entre as telas pedido → resultados → perfil → confirmar.

export interface BookingDraft {
  category: ServiceCategory;
  address: Address;
  start: string;
  end: string;
  mode: BillingMode;
  dependents: number;
  tripsKm: number;
  specialtyIds: string[];
  notes: string;
  results?: CaregiverResult[];
  chosen?: CaregiverResult;
}

let current: BookingDraft | null = null;

export const getDraft = () => current;
export function setDraft(draft: BookingDraft | null) {
  current = draft;
}
export function updateDraft(changes: Partial<BookingDraft>) {
  if (current) current = { ...current, ...changes };
}
