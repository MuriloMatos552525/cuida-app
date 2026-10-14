import type { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Web: o Firebase guarda a sessão no navegador.
export function createAuth(app: FirebaseApp) {
  return getAuth(app);
}
