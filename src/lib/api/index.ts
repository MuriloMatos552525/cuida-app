import { firebaseConfig } from '../firebase-config';
import { DemoApi } from './demo';
import { FirebaseApi } from './firebase';
import type { Api } from './types';

export * from './types';

/** Usa o Firebase; EXPO_PUBLIC_DEMO=true volta para o modo demonstração, sem servidor. */
export const api: Api =
  process.env.EXPO_PUBLIC_DEMO === 'true'
    ? new DemoApi({ simulate: true })
    : new FirebaseApi(firebaseConfig, process.env.EXPO_PUBLIC_USE_EMULATORS === 'true', process.env.EXPO_PUBLIC_API_URL || undefined);
