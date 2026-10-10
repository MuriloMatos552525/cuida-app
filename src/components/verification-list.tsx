import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { View } from 'react-native';

import type { VerificationKind, VerificationStatus } from '@shared/models';

import { api, Profile } from '@/lib/api';
import { colors } from '@/lib/theme';

import { Button, Card, Divider, Row, Text } from './ui';

const items: Record<VerificationKind, { title: string; detail: string }> = {
  cpf: { title: 'CPF', detail: 'Conferido na Receita Federal.' },
  documento: { title: 'Documento com foto', detail: 'RG ou CNH, frente e verso.' },
  selfie: { title: 'Selfie', detail: 'Comparada com a foto do documento.' },
  antecedentes: { title: 'Antecedentes criminais', detail: 'Certidão estadual e federal, renovada a cada 6 meses.' },
};

const statusInfo: Record<VerificationStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pendente: { label: 'Pendente', color: colors.textSecondary, icon: 'ellipse-outline' },
  em_analise: { label: 'Em análise', color: colors.warning, icon: 'time-outline' },
  aprovado: { label: 'Aprovado', color: colors.trust, icon: 'checkmark-circle' },
  reprovado: { label: 'Reprovado', color: colors.danger, icon: 'close-circle' },
  expirado: { label: 'Vencido', color: colors.danger, icon: 'alert-circle' },
};

/** Lista de verificações com o botão de envio para análise. */
export function VerificationList({ profile, kinds }: { profile: Profile; kinds: VerificationKind[] }) {
  const [sending, setSending] = useState<VerificationKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(kind: VerificationKind) {
    setSending(kind);
    setError(null);
    try {
      await api.sendVerification(kind);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(null);
    }
  }

  return (
    <Card>
      {kinds.map((kind, i) => {
        const status = profile.verifications[kind]?.status ?? 'pendente';
        const info = statusInfo[status];
        const canSend = status === 'pendente' || status === 'reprovado' || status === 'expirado';
        return (
          <View key={kind} style={{ gap: 8 }}>
            {i > 0 ? <Divider /> : null}
            <Row gap={12} style={{ paddingVertical: 4 }}>
              <Ionicons name={info.icon} size={22} color={info.color} />
              <View style={{ flex: 1 }}>
                <Text variant="label">{items[kind].title}</Text>
                <Text variant="caption">{items[kind].detail}</Text>
              </View>
              {canSend ? (
                <Button title="Enviar" variant="secondary" onPress={() => send(kind)} loading={sending === kind} style={{ minHeight: 40 }} />
              ) : (
                <Text variant="caption" color={info.color}>
                  {info.label}
                </Text>
              )}
            </Row>
          </View>
        );
      })}
      {error ? <Text color={colors.danger}>{error}</Text> : null}
    </Card>
  );
}
