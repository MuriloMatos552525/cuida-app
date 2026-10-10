import * as Location from 'expo-location';

import type { Coordinate } from '@shared/models';

/** Localização atual, ou null se a pessoa negar a permissão ou o GPS falhar. */
export async function currentCoordinate(): Promise<Coordinate | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return null;
  }
}

/** Ponto de referência (Av. Paulista) para o modo demonstração quando não há GPS. */
export const DEMO_COORDINATE: Coordinate = { latitude: -23.5614, longitude: -46.6559 };
