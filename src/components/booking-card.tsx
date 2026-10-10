import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { View } from 'react-native';

import type { Booking } from '@shared/models';

import { brl, dependentsLabel, formatRange, statusLabel } from '@/lib/format';
import { categoryInfo, colors, radius } from '@/lib/theme';

import { Card, Row, Text } from './ui';

export function BookingCard({ booking, viewer }: { booking: Booking; viewer: 'cliente' | 'cuidador' }) {
  const info = categoryInfo[booking.category];
  const who = viewer === 'cliente' ? booking.caregiver.name : booking.clientName;
  const value = viewer === 'cliente' ? booking.price.total : booking.price.caregiverPayout;
  const active = ['solicitada', 'aceita', 'a_caminho', 'em_andamento'].includes(booking.status);
  return (
    <Card onPress={() => router.push(`/reserva/${booking.id}`)}>
      <Row gap={12}>
        <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: info.tint, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={info.icon} size={22} color={colors.text} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">
            {info.title} · {who}
          </Text>
          <Text variant="caption">{formatRange(booking.start, booking.end)}</Text>
          <Text variant="caption">
            {dependentsLabel(booking.category, booking.dependents)} · {booking.addressLabel}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text variant="label">{brl(value)}</Text>
          <Text variant="caption" color={active ? colors.trust : colors.textSecondary}>
            {statusLabel[booking.status]}
          </Text>
        </View>
      </Row>
    </Card>
  );
}
