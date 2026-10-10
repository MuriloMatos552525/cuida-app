import { Redirect } from 'expo-router';

import { useSession } from '@/lib/session';

export default function Index() {
  const profile = useSession();
  if (!profile) return <Redirect href="/entrar" />;
  return <Redirect href={profile.role === 'cliente' ? '/cliente' : '/painel'} />;
}
