import { FirebaseOptions, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  or,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { connectFunctionsEmulator, FunctionsError, getFunctions, httpsCallable, httpsCallableFromURL } from 'firebase/functions';

import type {
  Address,
  Booking,
  CaregiverResult,
  CaregiverSummary,
  Review,
  ReviewDetails,
  ReviewQueueEntry,
  UserRole,
  VerificationKind,
  Verifications,
} from '@shared/models';

import { createAuth } from './auth';
import { Api, ApiError, CaregiverProfile, NewBooking, Profile, SearchParams } from './types';

// Implementação com Firebase. Leituras vão direto ao Firestore (protegidas pelas regras);
// tudo que grava reserva, preço, avaliação ou verificação passa pelas Cloud Functions ou, no plano
// grátis do Firebase, pela API HTTP em `apiUrl` (functions/src/http.ts), que fala o mesmo protocolo.

const firebaseErrors: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/network-request-failed': 'Sem conexão. Tente de novo.',
};

// Mensagens para os códigos que o SDK devolve sem explicação ("internal", "not-found"...).
function callError(code: string, apiUrl?: string) {
  const where = apiUrl ? `a API (${apiUrl})` : 'as Cloud Functions';
  switch (code) {
    case 'functions/not-found':
      return apiUrl
        ? `A API em ${apiUrl} não tem esta função. Confira se o endereço é o de produção da Vercel e se ela publicou a última versão.`
        : 'O servidor não está publicado. No plano grátis, coloque EXPO_PUBLIC_API_URL no arquivo .env.local e reinicie o Expo.';
    case 'functions/unauthenticated':
      return 'O servidor não aceitou seu login. Saia e entre de novo. Se continuar, desligue a proteção de deploy da Vercel.';
    case 'functions/deadline-exceeded':
      return `O servidor demorou demais para responder (${where}). Tente de novo.`;
    default:
      return `Não conseguimos falar com ${where}. Confira a internet e o endereço da API.`;
  }
}

/** Converte erros do Firebase em mensagens para a pessoa. */
async function friendly<T>(work: Promise<T>, apiUrl?: string): Promise<T> {
  try {
    return await work;
  } catch (e) {
    // Aparece no terminal do `npx expo start`, para saber o que houve de verdade.
    console.warn('[Cuida]', e);
    if (e instanceof FunctionsError) {
      // O SDK acrescenta o status HTTP no fim da mensagem ("... [400]").
      const message = e.message.replace(/ \[\d+\]$/, '');
      // Sem mensagem própria do servidor, o SDK repete só o código ("internal", "not-found").
      const generic = message === e.code.replace('functions/', '') || message.startsWith('Backend error status');
      throw new ApiError(generic ? callError(e.code, apiUrl) : message);
    }
    const code = (e as { code?: string }).code;
    if (code && firebaseErrors[code]) throw new ApiError(firebaseErrors[code]);
    if (code === 'permission-denied') throw new ApiError('Você não tem acesso a isso.');
    if (code === 'unavailable') throw new ApiError('Sem conexão com o banco de dados. Confira a internet e tente de novo.');
    throw e;
  }
}

/** Gravações no Firestore só terminam quando o servidor confirma; sem rede, não esperam para sempre. */
function withTimeout<T>(work: Promise<T>, ms = 20000): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new ApiError('O banco de dados não respondeu. Confira a internet e tente de novo.')), ms),
    ),
  ]);
}

export class FirebaseApi implements Api {
  readonly demo = false;

  private app;
  private auth;
  private db;
  private functions;
  private user: User | null = null;
  private profile: Profile | null = null;
  private listeners = new Set<(p: Profile | null) => void>();

  constructor(config: FirebaseOptions, useEmulators = false, private apiUrl?: string) {
    // A API da Vercel "dorme" sem uso e demora alguns segundos no primeiro pedido; acorda já.
    if (apiUrl) {
      fetch(`${apiUrl.replace(/\/$/, '')}/api/ping`)
        .then((r) => {
          if (!r.ok) console.warn(`[Cuida] A API em ${apiUrl} respondeu ${r.status} ao teste. Confira o endereço.`);
        })
        .catch((e) => console.warn(`[Cuida] Não conseguimos acessar a API em ${apiUrl}:`, e));
    }
    if (__DEV__) console.log(`[Cuida] Servidor: ${apiUrl ? `API ${apiUrl}` : 'Cloud Functions (EXPO_PUBLIC_API_URL vazio)'}`);
    this.app = initializeApp(config);
    this.auth = createAuth(this.app);
    this.db = getFirestore(this.app);
    this.functions = getFunctions(this.app, 'southamerica-east1');
    if (useEmulators) {
      connectAuthEmulator(this.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(this.db, '127.0.0.1', 8080);
      connectFunctionsEmulator(this.functions, '127.0.0.1', 5001);
    }
    onAuthStateChanged(this.auth, (user) => {
      this.user = user;
      void this.reloadProfile();
    });
  }

  // Sessão -----------------------------------------------------------------------------------

  onProfileChange(listener: (profile: Profile | null) => void) {
    this.listeners.add(listener);
    if (this.profile || this.auth.currentUser === null) listener(this.profile);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async signIn(email: string, password: string) {
    await friendly(signInWithEmailAndPassword(this.auth, email.trim(), password));
  }

  async signUp(input: { fullName: string; email: string; password: string; role: UserRole }) {
    const { user } = await friendly(createUserWithEmailAndPassword(this.auth, input.email.trim(), input.password));
    await friendly(withTimeout(setDoc(doc(this.db, 'users', user.uid), {
      fullName: input.fullName.trim(),
      role: input.role,
      createdAt: new Date().toISOString(),
    })));
    if (input.role === 'cuidador') {
      await friendly(withTimeout(setDoc(doc(this.db, 'caregivers', user.uid), {
        name: input.fullName.trim(), photoURL: null, bio: '', categories: [], serviceRadiusKm: 10, available: false,
      })));
    }
    await this.reloadProfile();
  }

  async signOut() {
    await signOut(this.auth);
  }

  async reloadProfile() {
    const user = this.user;
    if (!user) {
      this.profile = null;
    } else {
      const [profile, verifications, staff] = await Promise.all([
        getDoc(doc(this.db, 'users', user.uid)),
        getDoc(doc(this.db, 'verifications', user.uid)),
        // Com regras antigas publicadas, ler `staff` é negado; trata como "não é da equipe".
        getDoc(doc(this.db, 'staff', user.uid)).catch(() => null),
      ]);
      // Logo após criar a conta o perfil ainda pode não existir; signUp chama de novo.
      if (!profile.exists()) return;
      const data = profile.data();
      this.profile = {
        uid: user.uid,
        email: user.email ?? '',
        fullName: data.fullName,
        role: data.role,
        ratingAvg: data.ratingAvg ?? null,
        verifications: (verifications.data() ?? {}) as Verifications,
        staff: !!staff?.exists(),
      };
    }
    for (const l of this.listeners) l(this.profile);
  }

  // Endereços e busca ------------------------------------------------------------------------

  async listAddresses() {
    const snap = await getDocs(collection(this.db, 'users', this.uid(), 'addresses'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Address);
  }

  async addAddress(input: Omit<Address, 'id'>) {
    const ref = await friendly(withTimeout(addDoc(collection(this.db, 'users', this.uid(), 'addresses'), input)));
    return { ...input, id: ref.id };
  }

  async searchCaregivers(params: SearchParams) {
    return this.call<CaregiverResult[]>('searchCaregivers', params);
  }

  async getCaregiver(id: string) {
    const snap = await getDoc(doc(this.db, 'caregivers', id));
    return snap.exists() ? ({ id, ...snap.data() } as CaregiverSummary) : null;
  }

  async listReviews(revieweeId: string) {
    const snap = await getDocs(
      query(
        collection(this.db, 'reviews'),
        where('revieweeId', '==', revieweeId),
        where('visible', '==', true),
        orderBy('createdAt', 'desc'),
        limit(20),
      ),
    );
    return snap.docs.map((d) => d.data() as Review);
  }

  // Reservas ---------------------------------------------------------------------------------

  async createBooking(input: NewBooking) {
    return this.call<Booking>('createBooking', input);
  }

  async listBookings() {
    const uid = this.uid();
    const snap = await getDocs(
      query(
        collection(this.db, 'bookings'),
        or(where('clientId', '==', uid), where('caregiverId', '==', uid)),
        orderBy('start', 'desc'),
        limit(50),
      ),
    );
    return snap.docs.map((d) => d.data() as Booking);
  }

  watchBooking(id: string, listener: (booking: Booking | null) => void) {
    return onSnapshot(
      doc(this.db, 'bookings', id),
      (snap) => listener(snap.exists() ? (snap.data() as Booking) : null),
      () => listener(null),
    );
  }

  async bookingPin(id: string) {
    try {
      const snap = await getDoc(doc(this.db, 'bookings', id, 'private', 'pin'));
      return snap.data()?.pin ?? null;
    } catch {
      return null;
    }
  }

  async bookingAddress(id: string) {
    try {
      const snap = await getDoc(doc(this.db, 'bookings', id, 'private', 'address'));
      return snap.exists() ? { street: snap.data().street as string } : null;
    } catch {
      return null;
    }
  }

  async transition(bookingId: string, event: Parameters<Api['transition']>[1], pin?: string) {
    await this.call('bookingTransition', { bookingId, event, pin });
  }

  async submitReview(bookingId: string, input: { rating: number; tags: string[]; comment: string }) {
    await this.call('submitReview', { bookingId, ...input });
  }

  async myReview(bookingId: string) {
    const snap = await getDoc(doc(this.db, 'reviews', `${bookingId}__${this.uid()}`));
    return snap.exists() ? (snap.data() as Review) : null;
  }

  async triggerEmergency(bookingId: string | null, coordinate: { latitude: number; longitude: number } | null) {
    await this.call('triggerEmergency', { bookingId, coordinate });
  }

  // Cuidador ---------------------------------------------------------------------------------

  async sendVerification(kind: keyof Verifications, input: { cpf?: string; image?: string }) {
    // CPF e fotos vão para o servidor, que guarda em coleções que o app não lê.
    await this.call('submitVerification', { kind, ...input });
    await this.reloadProfile();
  }


  async myCaregiverProfile() {
    const snap = await getDoc(doc(this.db, 'caregivers', this.uid()));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      id: snap.id, name: d.name, photoURL: d.photoURL ?? null, bio: d.bio ?? '', categories: d.categories ?? [],
      specialties: d.specialties ?? [], rating: d.rating ?? 0, reviewCount: d.reviewCount ?? 0,
      coordinate: d.coordinate ?? { latitude: 0, longitude: 0 }, serviceRadiusKm: d.serviceRadiusKm ?? 10,
      isIdentityVerified: !!d.isIdentityVerified, backgroundCheckedAt: d.backgroundCheckedAt ?? null,
      available: !!d.available, eligible: !!d.eligible, city: d.city ?? null,
    } satisfies CaregiverProfile;
  }

  async updateCaregiverProfile(changes: Partial<Pick<CaregiverProfile, 'bio' | 'categories' | 'serviceRadiusKm' | 'available'>>) {
    await friendly(withTimeout(updateDoc(doc(this.db, 'caregivers', this.uid()), changes)));
  }

  async setCaregiverLocation(coordinate: { latitude: number; longitude: number }, city: string) {
    await this.call('setCaregiverLocation', { coordinate, city });
  }

  // Equipe -----------------------------------------------------------------------------------

  staffQueue() {
    return this.call<ReviewQueueEntry[]>('staffQueue', {});
  }

  staffDetails(uid: string) {
    return this.call<ReviewDetails>('staffDetails', { uid });
  }

  async staffReview(input: { uid: string; kind: VerificationKind; approve: boolean; reason?: string; validUntil?: string }) {
    await this.call('staffReview', input);
  }

  async staffApproveCaregiver(uid: string, approved: boolean) {
    await this.call('staffApproveCaregiver', { uid, approved });
  }

  // Internos ---------------------------------------------------------------------------------

  private uid() {
    if (!this.user) throw new ApiError('Entre na sua conta.');
    return this.user.uid;
  }

  private async call<T>(name: string, data: unknown): Promise<T> {
    const fn = this.apiUrl
      ? httpsCallableFromURL<unknown, T>(this.functions, `${this.apiUrl.replace(/\/$/, '')}/api/${name}`, { timeout: 30000 })
      : httpsCallable<unknown, T>(this.functions, name, { timeout: 30000 });
    const result = await friendly(fn(data), this.apiUrl);
    return result.data;
  }
}
