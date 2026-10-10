import * as Haptics from 'expo-haptics';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar, Button, Card, Notice, PriceDetails, Row, Screen, Section, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { getDraft, setDraft } from '@/lib/draft';
import { dependentsLabel, formatRange } from '@/lib/format';
import { categoryInfo, space } from '@/lib/theme';

export default function Confirm() {
  const draft = getDraft();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!draft?.chosen) return <Redirect href="/cliente" />;
  const { chosen } = draft;

  async function confirm() {
    if (!draft || !chosen) return;
    setLoading(true);
    setError(null);
    try {
      const booking = await api.createBooking({
        caregiverId: chosen.caregiver.id, addressId: draft.address.id, category: draft.category, start: draft.start,
        end: draft.end, mode: draft.mode, dependents: draft.dependents, tripsKm: draft.tripsKm,
        requiresSpecialty: draft.specialtyIds.length > 0, notes: draft.notes,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDraft(null);
      router.dismissAll();
      router.push(`/reserva/${booking.id}`);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <Screen edges={[]} footer={<Button title="Confirmar reserva" onPress={confirm} loading={loading} />}>
      <Card>
        <Row gap={space.md}>
          <Avatar name={chosen.caregiver.name} size={48} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{chosen.caregiver.name}</Text>
            <Text variant="caption">{categoryInfo[draft.category].title}</Text>
          </View>
        </Row>
        <Text>{formatRange(draft.start, draft.end)}</Text>
        <Text variant="caption">
          {draft.address.label} · {dependentsLabel(draft.category, draft.dependents)}
        </Text>
      </Card>

      <Section title="Valor sugerido">
        <PriceDetails price={chosen.price} viewer="cliente" />
      </Section>

      <Notice
        tone="trust"
        text="Quando o cuidador chegar, passe a ele o código de 4 dígitos que vai aparecer na reserva. Sem o código o serviço não começa."
      />
      {error ? <Notice tone="danger" text={error} /> : null}
    </Screen>
  );
}
