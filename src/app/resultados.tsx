import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Card, Notice, Rating, Row, Screen, Text, TrustBadge } from '@/components/ui';
import { getDraft, updateDraft } from '@/lib/draft';
import { brl, dependentsLabel, formatRange } from '@/lib/format';
import { categoryInfo, colors, space } from '@/lib/theme';

export default function Results() {
  const draft = getDraft();
  if (!draft?.results) return <Redirect href="/cliente" />;
  const { results } = draft;

  return (
    <Screen edges={[]}>
      <Text variant="caption">
        {categoryInfo[draft.category].title} · {formatRange(draft.start, draft.end)} · {dependentsLabel(draft.category, draft.dependents)}
      </Text>

      {results.length === 0 ? (
        <Notice text="Ninguém disponível nesse horário perto de você. Tente outro horário ou tire alguma especialidade." />
      ) : null}

      <View style={{ gap: space.md }}>
        {results.map((r) => (
          <Card
            key={r.caregiver.id}
            onPress={() => {
              updateDraft({ chosen: r });
              router.push(`/perfil/${r.caregiver.id}`);
            }}>
            <Row gap={space.md}>
              <Avatar name={r.caregiver.name} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="heading">{r.caregiver.name}</Text>
                <Row gap={space.sm}>
                  <Rating value={r.caregiver.rating} count={r.caregiver.reviewCount} />
                  <Text variant="caption">· {r.distanceKm.toString().replace('.', ',')} km</Text>
                </Row>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="heading">{brl(r.price.total)}</Text>
                <Text variant="caption">estimado</Text>
              </View>
            </Row>
            <Row style={{ flexWrap: 'wrap' }} gap={6}>
              {r.caregiver.isIdentityVerified ? <TrustBadge label="Identidade verificada" /> : null}
              {r.caregiver.backgroundCheckedAt ? <TrustBadge label="Antecedentes ok" icon="document-text" /> : null}
              {r.caregiver.specialties.slice(0, 2).map((s) => (
                <Row key={s.id} gap={4}>
                  <Ionicons name="ribbon-outline" size={14} color={colors.textSecondary} />
                  <Text variant="caption">{s.name}</Text>
                </Row>
              ))}
            </Row>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
