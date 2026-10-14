import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ACTIVE_STATUSES, SERVICE_CATEGORIES } from '@shared/models';
import { isIdentityVerified } from '@shared/rules';

import { BookingCard } from '@/components/booking-card';
import { Card, Notice, Row, Screen, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { firstName } from '@/lib/format';
import { useProfile } from '@/lib/session';
import { categoryInfo, colors, radius, shadow, space } from '@/lib/theme';
import { useFocusData } from '@/lib/useAsync';

const safety: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'id-card-outline', text: 'CPF, documento e selfie conferidos' },
  { icon: 'document-text-outline', text: 'Antecedentes criminais renovados a cada 6 meses' },
  { icon: 'keypad-outline', text: 'Serviço só começa com o código do seu app' },
  { icon: 'warning-outline', text: 'Botão de emergência durante todo o atendimento' },
];

export default function ClientHome() {
  const profile = useProfile();
  const { data: bookings } = useFocusData(() => api.listBookings());
  const active = bookings?.find((b) => ACTIVE_STATUSES.includes(b.status));

  return (
    <Screen
      hero={
        <>
          <Text color={colors.onHeroSecondary}>Olá, {firstName(profile.fullName)} 👋</Text>
          <Text variant="display" color={colors.onHero}>
            Quem vai cuidar hoje?
          </Text>
        </>
      }>
      <View style={{ gap: space.md, marginTop: -space.xl }}>
        {SERVICE_CATEGORIES.map((category) => {
          const info = categoryInfo[category];
          return (
            <Pressable
              key={category}
              onPress={() => router.push(`/pedido/${category}`)}
              style={({ pressed }) => [
                {
                  backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md, opacity: pressed ? 0.85 : 1,
                  flexDirection: 'row', alignItems: 'center', gap: space.md,
                },
                shadow,
              ]}>
              <View style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: info.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={info.icon} size={32} color={info.ink} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">{info.title}</Text>
                <Text variant="caption">{info.subtitle}</Text>
              </View>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
              </View>
            </Pressable>
          );
        })}
      </View>

      {!isIdentityVerified(profile.verifications) ? (
        <Card onPress={() => router.push('/cliente/conta')}>
          <Notice text="Verifique sua identidade para fazer reservas. Os cuidadores também querem saber quem vão atender." />
        </Card>
      ) : null}

      {active ? (
        <View style={{ gap: space.sm }}>
          <Text variant="heading">Em andamento</Text>
          <BookingCard booking={active} viewer="cliente" />
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Text variant="heading">Por que é seguro</Text>
        <Card style={{ gap: space.md }}>
          {safety.map((item) => (
            <Row key={item.icon} gap={12}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.trustSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={item.icon} size={18} color={colors.trust} />
              </View>
              <Text style={{ flex: 1 }}>{item.text}</Text>
            </Row>
          ))}
        </Card>
      </View>
    </Screen>
  );
}
