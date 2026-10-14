import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Button, Card, Divider, Rating, Row, Screen, Section, Text, TrustBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { getDraft } from '@/lib/draft';
import { brl, formatDay } from '@/lib/format';
import { categoryInfo, colors, space } from '@/lib/theme';
import { useFocusData } from '@/lib/useAsync';

export default function CaregiverProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const draft = getDraft();
  const { data: reviews } = useFocusData(() => api.listReviews(id), id);
  const chosen = draft?.chosen;
  if (!chosen || chosen.caregiver.id !== id) return <Redirect href="/cliente" />;
  const c = chosen.caregiver;

  return (
    <Screen
      edges={[]}
      footer={<Button title={`Continuar · ${brl(chosen.price.total)}`} onPress={() => router.push('/confirmar')} />}>
      <Stack.Screen options={{ title: c.name }} />
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Avatar name={c.name} size={96} />
        <Text variant="title">{c.name}</Text>
        <Rating value={c.rating} count={c.reviewCount} />
        <Text variant="caption">{c.categories.map((k) => categoryInfo[k].title).join(' · ')}</Text>
      </View>

      <Card>
        <Text variant="label">Verificações</Text>
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          <TrustBadge label={c.isIdentityVerified ? 'CPF, documento e selfie' : 'Identidade em análise'} />
          {c.backgroundCheckedAt ? (
            <TrustBadge label={`Antecedentes ok em ${formatDay(c.backgroundCheckedAt)}`} icon="document-text" />
          ) : null}
        </Row>
      </Card>

      {c.bio ? (
        <Section title="Sobre">
          <Text>{c.bio}</Text>
        </Section>
      ) : null}

      {c.specialties.length ? (
        <Section title="Especialidades">
          {c.specialties.map((s) => (
            <Row key={s.id}>
              <Ionicons name="ribbon-outline" size={18} color={colors.trust} />
              <Text>{s.name}</Text>
            </Row>
          ))}
        </Section>
      ) : null}

      <Section title="Avaliações">
        {reviews?.length ? (
          <Card>
            {reviews.map((r, i) => (
              <View key={r.id} style={{ gap: 4 }}>
                {i > 0 ? <Divider /> : null}
                <Row style={{ justifyContent: 'space-between', paddingTop: i > 0 ? space.sm : 0 }}>
                  <Text variant="label">{r.authorName}</Text>
                  <Rating value={r.rating} />
                </Row>
                {r.comment ? <Text>{r.comment}</Text> : null}
                {r.tags.length ? <Text variant="caption">{r.tags.join(' · ')}</Text> : null}
              </View>
            ))}
          </Card>
        ) : (
          <Text variant="caption">Ainda sem avaliações publicadas.</Text>
        )}
      </Section>
    </Screen>
  );
}
