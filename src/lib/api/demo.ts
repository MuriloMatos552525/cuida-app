import type {
  Address,
  Booking,
  CaregiverSummary,
  PricingRule,
  Review,
  UserRole,
  Verifications,
} from '@shared/models';
import { ACTIVE_STATUSES } from '@shared/models';
import { distanceKm, localParts, quote } from '@shared/pricing';
import { isIdentityVerified, nextStatus, TransitionError } from '@shared/rules';
import { DEMO_CAREGIVERS, NATIONAL_HOLIDAYS, SAMPLE_PRICING_RULES, SPECIALTIES } from '@shared/seedData';

import { Api, ApiError, CaregiverProfile, NewBooking, Profile, SearchParams } from './types';

// Modo demonstração: roda sem servidor, com os mesmos cálculos e regras do backend.
// Serve para mostrar o app e para testar as telas antes de configurar o Firebase.

const approved = { status: 'aprovado' as const, updatedAt: '2026-10-01T12:00:00.000Z' };
const fullyVerified: Verifications = {
  cpf: approved,
  documento: approved,
  selfie: approved,
  antecedentes: { ...approved, validUntil: '2027-10-01' },
};

const roundCoordinate = (c: { latitude: number; longitude: number }) => ({
  latitude: Math.round(c.latitude * 100) / 100,
  longitude: Math.round(c.longitude * 100) / 100,
});

interface DemoUser extends Profile {
  password: string;
  addresses: Address[];
  ratingCount: number;
}

interface DemoCaregiverState extends CaregiverProfile {
  exact: { latitude: number; longitude: number };
}

export interface DemoOptions {
  /** Simula o cuidador aceitando, indo e concluindo as reservas do cliente. */
  simulate?: boolean;
  /** Intervalo entre os passos simulados, em ms. */
  stepMs?: number;
}

export class DemoApi implements Api {
  readonly demo = true;

  private users = new Map<string, DemoUser>();
  private caregivers = new Map<string, DemoCaregiverState>();
  private bookings = new Map<string, Booking>();
  private pins = new Map<string, string>();
  private streets = new Map<string, string>();
  private reviews: Review[] = [];
  private current: DemoUser | null = null;
  private profileListeners = new Set<(p: Profile | null) => void>();
  private bookingListeners = new Map<string, Set<(b: Booking | null) => void>>();
  private seq = 1;

  constructor(private options: DemoOptions = {}) {
    const home: Address = {
      id: 'casa',
      label: 'Casa',
      street: 'Rua Augusta, 1200 - Consolação',
      city: 'São Paulo',
      coordinate: { latitude: -23.5587, longitude: -46.6589 },
    };
    this.users.set('demo-cliente', {
      uid: 'demo-cliente', fullName: 'Carla Dias', email: 'cliente@demo.com', password: 'demo', role: 'cliente',
      verifications: { cpf: approved, documento: approved, selfie: approved }, ratingAvg: 4.9, ratingCount: 12,
      addresses: [home],
    });
    for (const c of DEMO_CAREGIVERS) {
      this.caregivers.set(c.id, {
        id: c.id, name: c.name, photoURL: null, bio: c.bio, categories: c.categories,
        specialties: SPECIALTIES.filter((s) => c.specialtyIds.includes(s.id)),
        rating: c.rating, reviewCount: c.reviewCount, coordinate: roundCoordinate(c.coordinate), serviceRadiusKm: 15,
        isIdentityVerified: true, backgroundCheckedAt: '2026-10-01T12:00:00.000Z',
        available: true, eligible: true, city: 'São Paulo', exact: c.coordinate,
      });
      this.users.set(c.id, {
        uid: c.id, fullName: c.name, email: `${c.id.replace('demo-', '')}@demo.com`, password: 'demo', role: 'cuidador',
        verifications: fullyVerified, ratingAvg: c.rating, ratingCount: c.reviewCount, addresses: [],
      });
    }
    this.reviews.push(
      this.review('r1', 'demo-ana', 'Fernanda C.', 5, ['Pontual', 'Atenciosa'], 'A Ana é maravilhosa, meus filhos adoraram.'),
      this.review('r2', 'demo-ana', 'Lucas M.', 5, ['Comunicativa'], 'Mandou fotos e notícias a tarde toda.'),
      this.review('r3', 'demo-marcos', 'Bia S.', 5, ['Cuidadoso'], 'O Thor voltou do passeio feliz e cansado.'),
      this.review('r4', 'demo-helena', 'Paulo R.', 5, ['Experiente'], 'Cuidou do meu pai no pós-operatório com muito carinho.'),
    );

    // Uma solicitação esperando a Ana, para o lado do cuidador ter o que mostrar.
    const tomorrow = new Date(Date.now() + 86_400_000);
    tomorrow.setHours(19, 0, 0, 0);
    this.seedBooking('demo-ana', 'demo-paula', 'Paula', tomorrow, 4, 2);
  }

  // Sessão -----------------------------------------------------------------------------------

  onProfileChange(listener: (profile: Profile | null) => void) {
    this.profileListeners.add(listener);
    listener(this.publicProfile());
    return () => {
      this.profileListeners.delete(listener);
    };
  }

  async signIn(email: string, password: string) {
    const user = [...this.users.values()].find((u) => u.email === email.trim().toLowerCase());
    if (!user || user.password !== password) throw new ApiError('E-mail ou senha incorretos. No modo demonstração a senha é "demo".');
    this.current = user;
    this.emitProfile();
  }

  async signUp(input: { fullName: string; email: string; password: string; role: UserRole }) {
    const email = input.email.trim().toLowerCase();
    if ([...this.users.values()].some((u) => u.email === email)) throw new ApiError('Já existe uma conta com este e-mail.');
    if (input.password.length < 6) throw new ApiError('A senha precisa ter pelo menos 6 caracteres.');
    const uid = `u${this.seq++}`;
    const user: DemoUser = {
      uid, fullName: input.fullName.trim(), email, password: input.password, role: input.role,
      verifications: {}, ratingAvg: null, ratingCount: 0, addresses: [],
    };
    this.users.set(uid, user);
    if (input.role === 'cuidador') {
      this.caregivers.set(uid, {
        id: uid, name: user.fullName, photoURL: null, bio: '', categories: [], specialties: [], rating: 0, reviewCount: 0,
        coordinate: { latitude: 0, longitude: 0 }, serviceRadiusKm: 10, isIdentityVerified: false, backgroundCheckedAt: null,
        available: false, eligible: false, city: null, exact: { latitude: 0, longitude: 0 },
      });
    }
    this.current = user;
    this.emitProfile();
  }

  async signOut() {
    this.current = null;
    this.emitProfile();
  }

  async reloadProfile() {
    this.emitProfile();
  }

  // Endereços e busca ------------------------------------------------------------------------

  async listAddresses() {
    return [...this.me().addresses];
  }

  async addAddress(input: Omit<Address, 'id'>) {
    const address = { ...input, id: `end${this.seq++}` };
    this.me().addresses.push(address);
    return address;
  }

  private async pricingRule(category: PricingRule['category'], city: string) {
    return SAMPLE_PRICING_RULES.find((r) => r.category === category && r.city === city) ?? null;
  }

  async searchCaregivers(params: SearchParams) {
    const start = new Date(params.start);
    const end = new Date(params.end);
    const results = [];
    for (const c of this.caregivers.values()) {
      if (!c.eligible || !c.available || !c.categories.includes(params.category)) continue;
      const km = distanceKm(c.exact, params.coordinate);
      if (km > c.serviceRadiusKm) continue;
      if (!params.specialtyIds.every((id) => c.specialties.some((s) => s.id === id))) continue;
      if (this.isBusy(c.id, start, end)) continue;
      const rule = await this.pricingRule(params.category, c.city ?? '');
      if (!rule) continue;
      const price = quote(
        {
          category: params.category, start, end, mode: params.mode, dependents: params.dependents,
          distanceToLocationKm: km, tripsDuringServiceKm: params.tripsKm,
          requiresSpecialty: params.specialtyIds.length > 0, isHoliday: !!NATIONAL_HOLIDAYS[localParts(start).day],
        },
        rule,
      );
      results.push({ caregiver: this.summary(c), distanceKm: Math.round(km * 10) / 10, price });
    }
    return results.sort((a, b) => b.caregiver.rating - a.caregiver.rating || a.distanceKm - b.distanceKm);
  }

  async getCaregiver(id: string) {
    const c = this.caregivers.get(id);
    return c ? this.summary(c) : null;
  }

  async listReviews(revieweeId: string) {
    return this.reviews.filter((r) => r.revieweeId === revieweeId && r.visible);
  }

  // Reservas ---------------------------------------------------------------------------------

  async createBooking(input: NewBooking) {
    const client = this.me();
    if (client.role !== 'cliente') throw new ApiError('Só clientes fazem reservas.');
    if (!isIdentityVerified(client.verifications)) {
      throw new ApiError('Verifique sua identidade (CPF, documento e selfie) antes de reservar.');
    }
    const address = client.addresses.find((a) => a.id === input.addressId);
    if (!address) throw new ApiError('Endereço não encontrado.');
    const c = this.caregivers.get(input.caregiverId);
    if (!c || !c.eligible || !c.categories.includes(input.category)) throw new ApiError('Este cuidador não está disponível.');
    const start = new Date(input.start);
    const end = new Date(input.end);
    if (start.getTime() < Date.now()) throw new ApiError('O início precisa ser no futuro.');
    if (this.isBusy(c.id, start, end)) throw new ApiError('O cuidador já tem uma reserva nesse horário.');
    const rule = await this.pricingRule(input.category, address.city);
    if (!rule) throw new ApiError('Ainda não atendemos essa cidade.');

    const price = quote(
      {
        category: input.category, start, end, mode: input.mode, dependents: input.dependents,
        distanceToLocationKm: distanceKm(c.exact, address.coordinate), tripsDuringServiceKm: input.tripsKm,
        requiresSpecialty: input.requiresSpecialty, isHoliday: !!NATIONAL_HOLIDAYS[localParts(start).day],
      },
      rule,
    );
    const now = new Date().toISOString();
    const booking: Booking = {
      id: `res${this.seq++}`, category: input.category, clientId: client.uid, caregiverId: c.id, caregiver: this.summary(c),
      clientName: client.fullName.split(' ')[0], addressLabel: address.label, city: address.city,
      start: start.toISOString(), end: end.toISOString(), mode: input.mode, dependents: input.dependents,
      status: 'solicitada', notes: input.notes, price, createdAt: now, updatedAt: now,
    };
    this.bookings.set(booking.id, booking);
    this.pins.set(booking.id, String(Math.floor(Math.random() * 10_000)).padStart(4, '0'));
    this.streets.set(booking.id, address.street);
    if (this.options.simulate) this.simulateCaregiver(booking.id);
    return booking;
  }

  async listBookings() {
    const me = this.me();
    return [...this.bookings.values()]
      .filter((b) => b.clientId === me.uid || b.caregiverId === me.uid)
      .sort((a, b) => b.start.localeCompare(a.start));
  }

  watchBooking(id: string, listener: (booking: Booking | null) => void) {
    const set = this.bookingListeners.get(id) ?? new Set();
    set.add(listener);
    this.bookingListeners.set(id, set);
    listener(this.bookings.get(id) ?? null);
    return () => {
      set.delete(listener);
    };
  }

  async bookingPin(id: string) {
    const b = this.bookings.get(id);
    return b && b.clientId === this.me().uid ? this.pins.get(id) ?? null : null;
  }

  async bookingAddress(id: string) {
    const b = this.bookings.get(id);
    if (!b) return null;
    const me = this.me().uid;
    const allowed = b.clientId === me || (b.caregiverId === me && ['aceita', 'a_caminho', 'em_andamento'].includes(b.status));
    return allowed ? { street: this.streets.get(id) ?? '' } : null;
  }

  async transition(id: string, event: Parameters<Api['transition']>[1], pin?: string) {
    this.applyTransition(this.me().uid, id, event, pin);
  }

  async submitReview(bookingId: string, input: { rating: number; tags: string[]; comment: string }) {
    const me = this.me();
    const b = this.bookings.get(bookingId);
    if (!b || (b.clientId !== me.uid && b.caregiverId !== me.uid)) throw new ApiError('Reserva de outra pessoa.');
    if (b.status !== 'concluida' && b.status !== 'avaliada') throw new ApiError('Só dá para avaliar depois do serviço.');
    if (this.reviews.some((r) => r.bookingId === bookingId && r.reviewerId === me.uid)) throw new ApiError('Você já avaliou esta reserva.');
    const revieweeId = me.uid === b.clientId ? b.caregiverId : b.clientId;
    const other = this.reviews.find((r) => r.bookingId === bookingId && r.reviewerId === revieweeId);
    const [first, last] = me.fullName.split(' ');
    this.reviews.push({
      id: `${bookingId}__${me.uid}`, bookingId, reviewerId: me.uid, revieweeId,
      authorName: `${first}${last ? ` ${last[0]}.` : ''}`, rating: input.rating, tags: input.tags,
      comment: input.comment || null, createdAt: new Date().toISOString(), visible: !!other,
    });
    if (other) {
      other.visible = true;
      this.update(bookingId, { status: 'avaliada' });
    }
    const reviewee = this.users.get(revieweeId);
    if (reviewee) {
      reviewee.ratingCount += 1;
      reviewee.ratingAvg = Math.round((((reviewee.ratingAvg ?? 0) * (reviewee.ratingCount - 1) + input.rating) / reviewee.ratingCount) * 100) / 100;
      const c = this.caregivers.get(revieweeId);
      if (c) Object.assign(c, { rating: reviewee.ratingAvg, reviewCount: reviewee.ratingCount });
    }
  }

  async myReview(bookingId: string) {
    return this.reviews.find((r) => r.bookingId === bookingId && r.reviewerId === this.me().uid) ?? null;
  }

  async triggerEmergency() {
    // No app real, a central é avisada e os contatos de emergência recebem SMS com a localização.
  }

  // Cuidador ---------------------------------------------------------------------------------

  async sendVerification(kind: keyof Verifications) {
    const me = this.me();
    me.verifications = { ...me.verifications, [kind]: { status: 'em_analise', updatedAt: new Date().toISOString() } };
    this.emitProfile();
    // Na demonstração, a análise "aprova" em seguida.
    setTimeout(() => {
      const validUntil = kind === 'antecedentes' ? '2027-10-01' : undefined;
      me.verifications = { ...me.verifications, [kind]: { status: 'aprovado', validUntil, updatedAt: new Date().toISOString() } };
      this.refreshEligibility(me.uid);
      this.emitProfile();
    }, this.options.stepMs ?? 1500);
  }

  async myCaregiverProfile() {
    const c = this.caregivers.get(this.me().uid);
    if (!c) return null;
    const { exact: _exact, ...profile } = c;
    return profile;
  }

  async updateCaregiverProfile(changes: Partial<Pick<CaregiverProfile, 'bio' | 'categories' | 'serviceRadiusKm' | 'available'>>) {
    const c = this.caregivers.get(this.me().uid);
    if (!c) throw new ApiError('Perfil de cuidador não encontrado.');
    Object.assign(c, changes);
  }

  async setCaregiverLocation(coordinate: { latitude: number; longitude: number }, city: string) {
    const c = this.caregivers.get(this.me().uid);
    if (!c) throw new ApiError('Perfil de cuidador não encontrado.');
    Object.assign(c, { exact: coordinate, coordinate: roundCoordinate(coordinate), city });
  }

  // Internos ---------------------------------------------------------------------------------

  private me(): DemoUser {
    if (!this.current) throw new ApiError('Entre na sua conta.');
    return this.current;
  }

  private publicProfile(): Profile | null {
    if (!this.current) return null;
    const { password: _p, addresses: _a, ratingCount: _r, ...profile } = this.current;
    return { ...profile };
  }

  private emitProfile() {
    const profile = this.publicProfile();
    for (const l of this.profileListeners) l(profile);
  }

  private summary(c: DemoCaregiverState): CaregiverSummary {
    const { exact: _e, available: _a, eligible: _el, city: _c, ...summary } = c;
    return { ...summary };
  }

  private refreshEligibility(uid: string) {
    const c = this.caregivers.get(uid);
    const user = this.users.get(uid);
    if (!c || !user) return;
    c.isIdentityVerified = isIdentityVerified(user.verifications);
    // Na demonstração não há aprovação manual da equipe.
    c.eligible = c.isIdentityVerified && user.verifications.antecedentes?.status === 'aprovado';
    if (c.eligible) c.backgroundCheckedAt = new Date().toISOString();
  }

  private isBusy(caregiverId: string, start: Date, end: Date) {
    return [...this.bookings.values()].some(
      (b) =>
        b.caregiverId === caregiverId && ACTIVE_STATUSES.includes(b.status) &&
        new Date(b.start) < end && new Date(b.end) > start,
    );
  }

  private applyTransition(uid: string, id: string, event: Parameters<Api['transition']>[1], pin?: string) {
    const b = this.bookings.get(id);
    if (!b) throw new ApiError('Reserva não encontrada.');
    const actor = b.caregiverId === uid ? 'cuidador' : b.clientId === uid ? 'cliente' : null;
    if (!actor) throw new ApiError('Reserva de outra pessoa.');
    try {
      const status = nextStatus(b.status, event, actor, { given: pin, expected: this.pins.get(id) ?? '' });
      this.update(id, { status });
    } catch (e) {
      if (e instanceof TransitionError) {
        throw new ApiError(e.code === 'wrong_pin' ? 'Código incorreto. Confira o código no app do cliente.' : 'Essa ação não é possível agora.');
      }
      throw e;
    }
  }

  private update(id: string, changes: Partial<Booking>) {
    const b = this.bookings.get(id);
    if (!b) return;
    const next = { ...b, ...changes, updatedAt: new Date().toISOString() };
    this.bookings.set(id, next);
    for (const l of this.bookingListeners.get(id) ?? []) l(next);
  }

  private simulateCaregiver(id: string) {
    const step = this.options.stepMs ?? 4000;
    const caregiverId = this.bookings.get(id)!.caregiverId;
    const steps: [Parameters<Api['transition']>[1], boolean][] = [
      ['accept', false], ['start_trip', false], ['start', true], ['finish', false],
    ];
    steps.forEach(([event, needsPin], i) => {
      setTimeout(() => {
        try {
          this.applyTransition(caregiverId, id, event, needsPin ? this.pins.get(id) : undefined);
        } catch {
          // Cancelada no meio da simulação.
        }
      }, step * (i + 1));
    });
  }

  private review(id: string, revieweeId: string, authorName: string, rating: number, tags: string[], comment: string): Review {
    return {
      id, bookingId: id, reviewerId: `autor-${id}`, revieweeId, authorName, rating, tags, comment,
      createdAt: '2026-09-20T12:00:00.000Z', visible: true,
    };
  }

  private seedBooking(caregiverId: string, clientId: string, clientName: string, start: Date, hours: number, dependents: number) {
    const c = this.caregivers.get(caregiverId)!;
    const end = new Date(start.getTime() + hours * 3_600_000);
    const rule = SAMPLE_PRICING_RULES.find((r) => r.category === c.categories[0])!;
    const price = quote(
      {
        category: c.categories[0], start, end, mode: 'hora', dependents, distanceToLocationKm: 2.4,
        tripsDuringServiceKm: 0, requiresSpecialty: false, isHoliday: false,
      },
      rule,
    );
    const id = `res${this.seq++}`;
    const now = new Date().toISOString();
    this.bookings.set(id, {
      id, category: c.categories[0], clientId, caregiverId, caregiver: this.summary(c), clientName,
      addressLabel: 'Casa', city: 'São Paulo', start: start.toISOString(), end: end.toISOString(), mode: 'hora',
      dependents, status: 'solicitada', notes: 'O mais novo dorme às 20h.', price, createdAt: now, updatedAt: now,
    });
    this.pins.set(id, '4821');
    this.streets.set(id, 'Rua Haddock Lobo, 400 - Cerqueira César');
  }
}
