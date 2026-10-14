import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/** Carrega dados sempre que a tela volta a ficar visível ou quando `key` muda. */
export function useFocusData<T>(load: () => Promise<T>, key?: unknown) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load()
        .then((value) => active && (setData(value), setError(null)))
        .catch((e: Error) => active && setError(e.message));
      return () => {
        active = false;
      };
      // `load` é recriada a cada render; quem decide quando recarregar é `key`.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, version]),
  );

  return { data, error, reload: () => setVersion((v) => v + 1) };
}
