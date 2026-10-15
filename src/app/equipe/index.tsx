import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Card, Loading, Notice, Row, Screen, Text } from '@/components/ui';
import { verificationTitles } from '@/components/verification-list';
import { api } from '@/lib/api';
import { colors, space } from '@/lib/theme';
import { useFocusData } from '@/lib/useAsync';

/** Fila da equipe: quem enviou documentos e cuidadores esperando liberação. */
export default function StaffQueue() {
  const { data, error } = useFocusData(() => api.staffQueue(), undefined, 'staffQueue');

  return (
    <Screen edges={[]}>
      {error ? <Notice tone="danger" text={error} /> : null}
      {!data && !error ? <Loading /> : null}
      {data?.length === 0 ? <Notice tone="trust" icon="checkmark-circle" text="Nada esperando análise." /> : null}
      {data?.map((entry) => (
        <Card key={entry.uid} onPress={() => router.push(`/equipe/${entry.uid}`)}>
          <Row gap={space.md}>
            <Avatar name={entry.fullName} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">{entry.fullName}</Text>
              <Text variant="caption">
                {entry.role === 'cuidador' ? 'Cuidador' : 'Cliente'}
                {entry.kinds.length ? ` · ${entry.kinds.map((k) => verificationTitles[k]).join(', ')}` : ''}
              </Text>
              {entry.awaitingApproval ? (
                <Text variant="caption" color={colors.trust}>
                  Documentos aprovados, esperando liberação
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
