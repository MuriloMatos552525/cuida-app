import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { View } from 'react-native';

import { ACTIVE_STATUSES, SERVICE_CATEGORIES } from '@shared/models';
import { isIdentityVerified } from '@shared/rules';

import { BookingCard } from '@/components/booking-card';
import { Card, Notice, Row, Screen, Text, TrustBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { firstName } from '@/lib/format';
import { useProfile } from '@/lib/session';
import { categoryInfo, colors, radius, space } from '@/lib/theme';
import { useFocusData } from '@/lib/useAsync';

export default function ClientHome() {
  const profile = useProfile();
  const { data: bookings } = useFocusData(() => api.listBookings());
  const active = bookings?.find((b) => ACTIVE_STATUSES.includes(b.status));

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Text color={colors.textSecondary}>Olá, {firstName(profile.fullName)}</Text>
        <Text variant="display">Do que você precisa hoje?</Text>
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

      <View style={{ gap: space.md }}>
        {SERVICE_CATEGORIES.map((category) => {
          const info = categoryInfo[category];
          return (
            <Card
              key={category}
              onPress={() => router.push(`/pedido/${category}`)}
              style={{ backgroundColor: info.tint, padding: space.lg, borderRadius: radius.lg }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ gap: 4 }}>
                  <Text variant="title">{info.title}</Text>
                  <Text color={colors.textSecondary}>{info.subtitle}</Text>
                </View>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={info.icon} size={32} color={colors.text} />
                </View>
              </Row>
            </Card>
          );
        })}
      </View>

      <Card>
        <TrustBadge label="Segurança em primeiro lugar" />
        <Text variant="caption">
          Todo cuidador passa por checagem de CPF, documento com selfie e antecedentes criminais. O serviço só começa com o
          código que aparece no seu app, e você tem um botão de emergência durante todo o atendimento.
        </Text>
      </Card>
    </Screen>
  );
}
