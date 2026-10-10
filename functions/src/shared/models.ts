// Tipos compartilhados entre o app (Expo) e as Cloud Functions.
// Este arquivo não pode importar nada de Firebase nem de React Native.

/** Valores em dinheiro sempre em centavos, para não perder precisão. */
export type Cents = number;

export type ServiceCategory = 'baba' | 'pet' | 'idoso';
export const SERVICE_CATEGORIES: ServiceCategory[] = ['baba', 'pet', 'idoso'];

export type UserRole = 'cliente' | 'cuidador';

export type BillingMode = 'hora' | 'diaria';

export type VerificationKind = 'cpf' | 'documento' | 'selfie' | 'antecedentes';
export const VERIFICATION_KINDS: VerificationKind[] = ['cpf', 'documento', 'selfie', 'antecedentes'];

export type VerificationStatus = 'pendente' | 'em_analise' | 'aprovado' | 'reprovado' | 'expirado';

export interface VerificationItem {
  status: VerificationStatus;
  /** ISO date (AAAA-MM-DD) até quando vale; usado na certidão de antecedentes. */
  validUntil?: string | null;
  updatedAt?: string;
}

export type Verifications = Partial<Record<VerificationKind, VerificationItem>>;

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface Specialty {
  id: string;
  name: string;
  category: ServiceCategory;
}

export interface Address {
  id: string;
  label: string;
  street: string;
  city: string;
  coordinate: Coordinate;
}

/** Perfil público do cuidador, como o cliente vê na busca. */
export interface CaregiverSummary {
  id: string;
  name: string;
  photoURL: string | null;
  bio: string;
  categories: ServiceCategory[];
  specialties: Specialty[];
  rating: number;
  reviewCount: number;
  /** Arredondada (~1 km): nunca expor o endereço exato do cuidador. */
  coordinate: Coordinate;
  serviceRadiusKm: number;
  isIdentityVerified: boolean;
  /** ISO; data da última certidão de antecedentes aprovada. */
  backgroundCheckedAt: string | null;
}

export interface CaregiverResult {
  caregiver: CaregiverSummary;
  distanceKm: number;
  /** Valor sugerido para este cuidador; o servidor recalcula ao confirmar a reserva. */
  price: PriceBreakdown;
}

export type BookingStatus =
  | 'solicitada'
  | 'aceita'
  | 'a_caminho'
  | 'em_andamento'
  | 'concluida'
  | 'avaliada'
  | 'recusada'
  | 'cancelada'
  | 'em_disputa';

export const ACTIVE_STATUSES: BookingStatus[] = ['solicitada', 'aceita', 'a_caminho', 'em_andamento'];

export interface Booking {
  id: string;
  category: ServiceCategory;
  clientId: string;
  caregiverId: string;
  caregiver: CaregiverSummary;
  clientName: string;
  /** Rótulo e cidade do endereço; a rua e o ponto exato ficam em bookings/{id}/private/address. */
  addressLabel: string;
  city: string;
  start: string;
  end: string;
  mode: BillingMode;
  dependents: number;
  status: BookingStatus;
  notes: string;
  price: PriceBreakdown;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  authorName: string;
  rating: number;
  tags: string[];
  comment: string | null;
  createdAt: string;
  /** Avaliação às cegas: só aparece quando os dois avaliaram ou após 7 dias. */
  visible: boolean;
}

// Preço ---------------------------------------------------------------------------------

/**
 * Tarifas de uma categoria numa cidade (coleção pricingRules, editada só pela equipe).
 * Percentuais em pontos-base: 100 = 1%.
 */
export interface PricingRule {
  category: ServiceCategory;
  city: string;
  hourlyRate: Cents;
  dailyRate: Cents;
  minimumHours: number;
  /** A partir de quantas diárias entra o desconto de pacote longo. */
  longStayDays: number;
  longStayDiscountBp: number;
  travelBaseFee: Cents;
  perKmRate: Cents;
  nightSurchargeBp: number;
  weekendSurchargeBp: number;
  holidaySurchargeBp: number;
  /** Acréscimo por criança/pet/pessoa além da primeira. */
  extraDependentBp: number;
  specialtySurchargeBp: number;
  /** Taxa da empresa sobre o total, descontada no repasse ao cuidador. */
  platformFeeBp: number;
}

export interface QuoteRequest {
  category: ServiceCategory;
  start: Date;
  end: Date;
  mode: BillingMode;
  dependents: number;
  /** Distância de ida entre o cuidador e o endereço; o cálculo cobra ida e volta. */
  distanceToLocationKm: number;
  /** Deslocamentos durante o serviço (médico, escola, veterinário), em km totais. */
  tripsDuringServiceKm: number;
  requiresSpecialty: boolean;
  isHoliday: boolean;
}

export type SurchargeReason = 'noturno' | 'fim_de_semana' | 'feriado';

export interface PriceBreakdown {
  /** Horas cobradas (modo hora) ou diárias (modo diária). */
  billedUnits: number;
  mode: BillingMode;
  timeAmount: Cents;
  longStayDiscount: Cents;
  surcharge: Cents;
  surchargeReason: SurchargeReason | null;
  dependentsExtra: Cents;
  specialtyExtra: Cents;
  travelToLocation: Cents;
  travelDuringService: Cents;
  total: Cents;
  platformFee: Cents;
  caregiverPayout: Cents;
}
