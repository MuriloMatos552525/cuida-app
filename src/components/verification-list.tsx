import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { View } from 'react-native';

import { formatCpf } from '@shared/cpf';
import type { VerificationKind, VerificationStatus } from '@shared/models';

import { api, Profile } from '@/lib/api';
import { pickPhoto, PhotoSource } from '@/lib/photo';
import { colors } from '@/lib/theme';

import { Button, Card, Divider, Field, Row, Text } from './ui';

const items: Record<VerificationKind, { title: string; detail: string; hint?: string }> = {
  cpf: { title: 'CPF', detail: 'Um CPF por conta.' },
  documento: { title: 'Documento com foto', detail: 'RG ou CNH aberto, com a foto e os dados legíveis.' },
  selfie: { title: 'Selfie', detail: 'Comparada com a foto do documento.', hint: 'Rosto inteiro, sem óculos escuros ou boné.' },
  antecedentes: {
    title: 'Antecedentes criminais',
    detail: 'Certidão estadual e federal, renovada a cada 6 meses.',
    hint: 'Emita grátis no site do Tribunal de Justiça do seu estado e da Justiça Federal.',
  },
};

const statusInfo: Record<VerificationStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pendente: { label: 'Pendente', color: colors.textSecondary, icon: 'ellipse-outline' },
  em_analise: { label: 'Em análise', color: colors.warning, icon: 'time-outline' },
  aprovado: { label: 'Aprovado', color: colors.trust, icon: 'checkmark-circle' },
  reprovado: { label: 'Reprovado', color: colors.danger, icon: 'close-circle' },
  expirado: { label: 'Vencido', color: colors.danger, icon: 'alert-circle' },
};

/** Nome de cada item, usado também nas telas da equipe. */
export const verificationTitles = Object.fromEntries(
  Object.entries(items).map(([k, v]) => [k, v.title]),
) as Record<VerificationKind, string>;

/** Lista de verificações: CPF digitado e fotos tiradas na hora ou escolhidas da galeria. */
export function VerificationList({ profile, kinds }: { profile: Profile; kinds: VerificationKind[] }) {
  const [open, setOpen] = useState<VerificationKind | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [cpf, setCpf] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function send(kind: VerificationKind, work: () => Promise<{ cpf?: string; image?: string } | null>, key: string) {
    setSending(key);
    setError(null);
    try {
      const input = await work();
      if (!input) return;
      await api.sendVerification(kind, input);
      setOpen(null);
      setCpf('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(null);
    }
  }

  const photo = (kind: VerificationKind, source: PhotoSource) =>
    send(kind, async () => {
      const image = await pickPhoto(source, kind === 'selfie');
      return image ? { image } : null;
    }, `${kind}-${source}`);

  return (
    <Card>
      {kinds.map((kind, i) => {
        const item = profile.verifications[kind];
        const status = item?.status ?? 'pendente';
        const info = statusInfo[status];
        const canSend = status === 'pendente' || status === 'reprovado' || status === 'expirado';
        const expanded = open === kind && canSend;
        return (
          <View key={kind} style={{ gap: 8 }}>
            {i > 0 ? <Divider /> : null}
            <Row gap={12} style={{ paddingVertical: 4 }}>
              <Ionicons name={info.icon} size={22} color={info.color} />
              <View style={{ flex: 1 }}>
                <Text variant="label">{items[kind].title}</Text>
                <Text variant="caption">{items[kind].detail}</Text>
              </View>
              {canSend && !expanded ? (
                <Button
                  title={status === 'pendente' ? 'Enviar' : 'Reenviar'}
                  variant="secondary"
                  onPress={() => {
                    setOpen(kind);
                    setError(null);
                  }}
                  style={{ minHeight: 40 }}
                />
              ) : !canSend ? (
                <Text variant="caption" color={info.color}>
                  {info.label}
                </Text>
              ) : null}
            </Row>
            {status === 'reprovado' && item?.reason ? (
              <Text variant="caption" color={colors.danger}>
                Motivo: {item.reason}
              </Text>
            ) : null}
            {expanded ? (
              <View style={{ gap: 8 }}>
                {items[kind].hint ? <Text variant="caption">{items[kind].hint}</Text> : null}
                {kind === 'cpf' ? (
                  <>
                    <Field
                      label="Seu CPF"
                      value={cpf}
                      onChangeText={(t) => setCpf(formatCpf(t))}
                      placeholder="000.000.000-00"
                      keyboardType="number-pad"
                      maxLength={14}
                    />
                    <Button title="Enviar CPF" onPress={() => send('cpf', async () => ({ cpf }), 'cpf')} loading={sending === 'cpf'} />
                  </>
                ) : (
                  <Row gap={8}>
                    <Button
                      title={kind === 'selfie' ? 'Tirar selfie' : 'Tirar foto'}
                      icon="camera-outline"
                      onPress={() => photo(kind, 'camera')}
                      loading={sending === `${kind}-camera`}
                      disabled={!!sending}
                      style={{ flex: 1 }}
                    />
                    {kind !== 'selfie' ? (
                      <Button
                        title="Galeria"
                        icon="images-outline"
                        variant="secondary"
                        onPress={() => photo(kind, 'galeria')}
                        loading={sending === `${kind}-galeria`}
                        disabled={!!sending}
                        style={{ flex: 1 }}
                      />
                    ) : null}
                  </Row>
                )}
                <Button title="Cancelar" variant="ghost" onPress={() => setOpen(null)} />
              </View>
            ) : null}
          </View>
        );
      })}
      {error ? <Text color={colors.danger}>{error}</Text> : null}
    </Card>
  );
}
