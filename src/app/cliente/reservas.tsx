import { View } from 'react-native';

import { ACTIVE_STATUSES } from '@shared/models';

import { BookingCard } from '@/components/booking-card';
import { Loading, Screen, Section, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { space } from '@/lib/theme';
import { useFocusData } from '@/lib/useAsync';

export default function ClientBookings() {
  const { data: bookings, error } = useFocusData(() => api.listBookings());
  if (!bookings && !error) return <Loading />;
  const upcoming = bookings?.filter((b) => ACTIVE_STATUSES.includes(b.status)) ?? [];
  const past = bookings?.filter((b) => !ACTIVE_STATUSES.includes(b.status)) ?? [];

  return (
    <Screen>
      <Text variant="display">Reservas</Text>
      {error ? <Text>{error}</Text> : null}
      {bookings?.length === 0 ? <Text>Você ainda não fez nenhuma reserva.</Text> : null}
      {upcoming.length ? (
        <Section title="Próximas">
          <View style={{ gap: space.sm }}>
            {upcoming.map((b) => (
              <BookingCard key={b.id} booking={b} viewer="cliente" />
            ))}
          </View>
        </Section>
      ) : null}
      {past.length ? (
        <Section title="Anteriores">
          <View style={{ gap: space.sm }}>
            {past.map((b) => (
              <BookingCard key={b.id} booking={b} viewer="cliente" />
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}
