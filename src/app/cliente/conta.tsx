import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Button, Card, Divider, Rating, Row, Screen, Section, Text } from '@/components/ui';
import { VerificationList } from '@/components/verification-list';
import { api } from '@/lib/api';
import { useProfile } from '@/lib/session';
import { colors, space } from '@/lib/theme';
import { useFocusData } from '@/lib/useAsync';

export default function ClientAccount() {
  const profile = useProfile();
  const { data: addresses } = useFocusData(() => api.listAddresses());

  return (
    <Screen>
      <Row gap={space.md}>
        <Avatar name={profile.fullName} size={64} />
        <View style={{ gap: 2 }}>
          <Text variant="title">{profile.fullName}</Text>
          <Text variant="caption">{profile.email}</Text>
          {profile.ratingAvg ? <Rating value={profile.ratingAvg} /> : null}
        </View>
      </Row>

      <Section title="Verificação de identidade">
        <Text variant="caption">Necessária para reservar. Seus dados ficam protegidos conforme a LGPD.</Text>
        <VerificationList profile={profile} kinds={['cpf', 'documento', 'selfie']} />
      </Section>

      <Section title="Endereços">
        <Card>
          {addresses?.map((a, i) => (
            <View key={a.id} style={{ gap: space.sm }}>
              {i > 0 ? <Divider /> : null}
              <Row gap={12}>
                <Ionicons name="location-outline" size={20} color={colors.text} />
                <View style={{ flex: 1 }}>
                  <Text variant="label">{a.label}</Text>
                  <Text variant="caption">
                    {a.street}, {a.city}
                  </Text>
                </View>
              </Row>
            </View>
          ))}
          <Button title="Adicionar endereço" icon="add" variant="ghost" onPress={() => router.push('/endereco')} />
        </Card>
      </Section>

      <Button title="Sair" variant="secondary" onPress={() => api.signOut()} />
    </Screen>
  );
}
