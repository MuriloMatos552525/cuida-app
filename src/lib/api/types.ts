import type {
  Address,
  BillingMode,
  Booking,
  CaregiverResult,
  CaregiverSummary,
  Coordinate,
  Review,
  ServiceCategory,
  UserRole,
  VerificationKind,
  Verifications,
} from '@shared/models';
import type { BookingEvent } from '@shared/rules';

// Tudo que as telas precisam do servidor. Há duas implementações: Firebase (de verdade) e
// demonstração (em memória), escolhida em api/index.ts conforme a configuração.

export interface Profile {
  uid: string;
  fullName: string;
  email: string;
  role: UserRole;
  verifications: Verifications;
  ratingAvg: number | null;
}

export interface CaregiverProfile extends CaregiverSummary {
  available: boolean;
  eligible: boolean;
  city: string | null;
}

export interface SearchParams {
  category: ServiceCategory;
  coordinate: Coordinate;
  start: string;
  end: string;
  mode: BillingMode;
  dependents: number;
  tripsKm: number;
  specialtyIds: string[];
}

export interface NewBooking {
  caregiverId: string;
  addressId: string;
  category: ServiceCategory;
  start: string;
  end: string;
  mode: BillingMode;
  dependents: number;
  tripsKm: number;
  requiresSpecialty: boolean;
  notes: string;
}

export interface Api {
  /** Verdadeiro no modo demonstração (sem Firebase configurado). */
  readonly demo: boolean;

  onProfileChange(listener: (profile: Profile | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: { fullName: string; email: string; password: string; role: UserRole }): Promise<void>;
  signOut(): Promise<void>;
  reloadProfile(): Promise<void>;

  listAddresses(): Promise<Address[]>;
  addAddress(input: Omit<Address, 'id'>): Promise<Address>;

  searchCaregivers(params: SearchParams): Promise<CaregiverResult[]>;
  getCaregiver(id: string): Promise<CaregiverSummary | null>;
  listReviews(revieweeId: string): Promise<Review[]>;

  createBooking(input: NewBooking): Promise<Booking>;
  listBookings(): Promise<Booking[]>;
  watchBooking(id: string, listener: (booking: Booking | null) => void): () => void;
  /** Só para o cliente; o cuidador recebe o código pessoalmente. */
  bookingPin(id: string): Promise<string | null>;
  /** Endereço exato; o cuidador só consegue depois de aceitar. */
  bookingAddress(id: string): Promise<{ street: string } | null>;
  transition(id: string, event: BookingEvent, pin?: string): Promise<void>;
  submitReview(id: string, input: { rating: number; tags: string[]; comment: string }): Promise<void>;
  myReview(bookingId: string): Promise<Review | null>;
  triggerEmergency(bookingId: string | null, coordinate: Coordinate | null): Promise<void>;

  sendVerification(kind: VerificationKind): Promise<void>;
  myCaregiverProfile(): Promise<CaregiverProfile | null>;
  updateCaregiverProfile(
    changes: Partial<Pick<CaregiverProfile, 'bio' | 'categories' | 'serviceRadiusKm' | 'available'>>,
  ): Promise<void>;
  setCaregiverLocation(coordinate: Coordinate, city: string): Promise<void>;
}

export class ApiError extends Error {}
