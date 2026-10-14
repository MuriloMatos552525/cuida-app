// Configuração do app Web do projeto Firebase "cuida-cdd3d".
// Estes valores são públicos (vão dentro do app); quem protege os dados são as regras do
// Firestore e as Cloud Functions. Variáveis EXPO_PUBLIC_FIREBASE_* no .env.local têm prioridade.
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyBJHXFjW8GRZMKTOL8sa3H8FNVHDS8Pams',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'cuida-cdd3d.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'cuida-cdd3d',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'cuida-cdd3d.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '910454433631',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:910454433631:web:04c18f136c079ddfea78ea',
};
