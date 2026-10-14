import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { BookingCard } from '@/components/booking-card';
import { Card, Loading, Notice, Row, Screen, Section, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { brl, firstName } from '@/lib/format';
import { useProfile } from '@/lib/session';
import { colors, space } from '@/lib/theme';
import { useFocusData } from '@/lib/useAsync';

export default function CaregiverHome() {
  const profile = useProfile();
  const { data, reload } = useFocusData(() => Promise.all([api.myCaregiverProfile(), api.listBookings()]), profile);
  const [saving, setSaving] = useState(false);
  if (!data) return <Loading />;
  const [caregiver, bookings] = data;

  const requests = bookings.filter((b) => b.status === 'solicitada');
  const upcoming = bookings.filter((b) => ['aceita', 'a_caminho', 'em_andamento'].includes(b.status));
  const history = bookings.filter((b) => !['solicitada', 'aceita', 'a_caminho', 'em_andamento'].includes(b.status));
  const earned = history.filter((b) => b.status === 'concluida' || b.status === 'avaliada').reduce((sum, b) => sum + b.price.caregiverPayout, 0);

  async function toggle(available: boolean) {
    setSaving(true);
    await api.updateCaregiverProfile({ available }).catch(() => undefined);
    setSaving(false);
    reload();
  }

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Text color={colors.textSecondary}>Olá, {firstName(profile.fullName)}</Text>
        <Text variant="display">Seus pedidos</Text>
      </View>

      {caregiver && !caregiver.eligible ? (
        <Card onPress={() => router.push('/painel/perfil')}>
          <Notice text="Complete a verificação de identidade e antecedentes no seu perfil para começar a receber pedidos." />
        </Card>
      ) : null}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text variant="heading">{caregiver?.available ? 'Disponível' : 'Indisponível'}</Text>
            <Text variant="caption">{caregiver?.available ? 'Você aparece nas buscas.' : 'Você não aparece nas buscas.'}</Text>
          </View>
          <Switch value={!!caregiver?.available} onValueChange={toggle} disabled={saving} trackColor={{ true: colors.trust }} />
        </Row>
      </Card>

      <Section title={`Novos pedidos${requests.length ? ` (${requests.length})` : ''}`}>
        {requests.length ? (
          <View style={{ gap: space.sm }}>
            {requests.map((b) => (
              <BookingCard key={b.id} booking={b} viewer="cuidador" />
            ))}
          </View>
        ) : (
          <Text variant="caption">Nenhum pedido novo agora.</Text>
        )}
      </Section>

      {upcoming.length ? (
        <Section title="Próximos atendimentos">
          <View style={{ gap: space.sm }}>
            {upcoming.map((b) => (
              <BookingCard key={b.id} booking={b} viewer="cuidador" />
            ))}
          </View>
        </Section>
      ) : null}

      {history.length ? (
        <Section title="Histórico" action={<Text variant="caption">Recebido: {brl(earned)}</Text>}>
          <View style={{ gap: space.sm }}>
            {history.map((b) => (
              <BookingCard key={b.id} booking={b} viewer="cuidador" />
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}
