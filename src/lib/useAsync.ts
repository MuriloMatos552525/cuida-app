import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

// Últimos dados de cada lista, para a tela abrir na hora com o que já se sabe enquanto atualiza.
const cache = new Map<string, unknown>();

/** Esquece os dados guardados (ao sair da conta). */
export function clearFocusCache() {
  cache.clear();
}

/**
 * Carrega dados sempre que a tela volta a ficar visível ou quando `key` muda. Com `cacheKey`, a tela
 * mostra na hora o último resultado (de qualquer tela com a mesma chave) e atualiza por baixo.
 */
export function useFocusData<T>(load: () => Promise<T>, key?: unknown, cacheKey?: string) {
  const [data, setData] = useState<T | undefined>(() => (cacheKey ? (cache.get(cacheKey) as T | undefined) : undefined));
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load()
        .then((value) => {
          if (cacheKey) cache.set(cacheKey, value);
          if (active) {
            setData(value);
            setError(null);
          }
        })
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
