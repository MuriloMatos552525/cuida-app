import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FirebaseApp } from 'firebase/app';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';

// iOS e Android: a sessão fica salva no AsyncStorage para não pedir login toda vez.
export function createAuth(app: FirebaseApp) {
  return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}
