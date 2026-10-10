import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { SessionProvider, useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.background, primary: colors.text } };

function Routes() {
  const profile = useSession();
  useEffect(() => {
    if (profile !== undefined) SplashScreen.hideAsync();
  }, [profile]);
  if (profile === undefined) return null;

  return (
    <Stack screenOptions={{ headerShown: false, headerBackTitle: 'Voltar', headerShadowVisible: false, headerTintColor: colors.text }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!profile}>
        <Stack.Screen name="entrar" />
      </Stack.Protected>
      <Stack.Protected guard={profile?.role === 'cliente'}>
        <Stack.Screen name="cliente" />
        <Stack.Screen name="pedido/[categoria]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="resultados" options={{ headerShown: true, title: 'Cuidadores disponíveis' }} />
        <Stack.Screen name="perfil/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="confirmar" options={{ headerShown: true, title: 'Confirmar reserva' }} />
        <Stack.Screen name="endereco" options={{ headerShown: true, title: 'Novo endereço', presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={profile?.role === 'cuidador'}>
        <Stack.Screen name="painel" />
      </Stack.Protected>
      <Stack.Protected guard={!!profile}>
        <Stack.Screen name="reserva/[id]" options={{ headerShown: true, title: 'Reserva' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <SessionProvider>
        <StatusBar style="dark" />
        <Routes />
      </SessionProvider>
    </ThemeProvider>
  );
}
