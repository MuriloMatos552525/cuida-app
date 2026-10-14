import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { api, Profile } from './api';

// Quem está usando o app. `undefined` enquanto carrega, `null` sem login.

const SessionContext = createContext<Profile | null | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  useEffect(() => api.onProfileChange(setProfile), []);
  return <SessionContext.Provider value={profile}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

/** Perfil de quem está logado; as telas que usam já estão atrás do login. */
export function useProfile(): Profile {
  const profile = useContext(SessionContext);
  if (!profile) throw new Error('useProfile fora de uma tela logada');
  return profile;
}
