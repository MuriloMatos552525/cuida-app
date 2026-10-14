import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { formatCpf } from '@shared/cpf';
import type { VerificationKind } from '@shared/models';

import { Button, Card, Field, Loading, Notice, Row, Screen, Section, Text } from '@/components/ui';
import { verificationTitles } from '@/components/verification-list';
import { api } from '@/lib/api';
import { colors, radius, space } from '@/lib/theme';
import { useFocusData } from '@/lib/useAsync';

const statusLabel = { pendente: 'Não enviado', em_analise: 'Em análise', aprovado: 'Aprovado', reprovado: 'Reprovado', expirado: 'Vencido' };

/** DD/MM/AAAA → AAAA-MM-DD. */
function isoDate(value: string): string | undefined {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

/** Análise de uma pessoa: fotos, CPF, aprovar ou reprovar cada item e liberar o cuidador. */
export default function StaffReview() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { data, error, reload } = useFocusData(() => api.staffDetails(uid), uid);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<VerificationKind | null>(null);
  const [reason, setReason] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <Screen edges={[]}><Notice tone="danger" text={error} /></Screen>;
  if (!data) return <Loading />;

  async function act(key: string, work: () => Promise<void>) {
    setBusy(key);
    setActionError(null);
    try {
      await work();
      setRejecting(null);
      setReason('');
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const kinds: VerificationKind[] = data.role === 'cuidador' ? ['cpf', 'documento', 'selfie', 'antecedentes'] : ['cpf', 'documento', 'selfie'];
  const ready = kinds.every((k) => data.verifications[k]?.status === 'aprovado');

  return (
    <Screen edges={['bottom']}>
      <View style={{ gap: 2 }}>
        <Text variant="title">{data.fullName}</Text>
        <Text variant="caption">{data.role === 'cuidador' ? 'Cuidador' : 'Cliente'}</Text>
      </View>
      {actionError ? <Notice tone="danger" text={actionError} /> : null}

      {kinds.map((kind) => {
        const item = data.verifications[kind];
        const status = item?.status ?? 'pendente';
        const file = kind === 'cpf' ? undefined : data.files[kind];
        return (
          <Section key={kind} title={verificationTitles[kind]}>
            <Card>
              <Text variant="caption" color={status === 'aprovado' ? colors.trust : status === 'em_analise' ? colors.warning : colors.textSecondary}>
                {statusLabel[status]}
                {item?.validUntil ? ` · válida até ${item.validUntil.split('-').reverse().join('/')}` : ''}
              </Text>
              {kind === 'cpf' && data.cpf ? <Text variant="heading">{formatCpf(data.cpf)}</Text> : null}
              {file ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${file}` }}
                  contentFit="contain"
                  style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.sm, backgroundColor: colors.surface }}
                />
              ) : null}
              {status === 'em_analise' ? (
                rejecting === kind ? (
                  <View style={{ gap: space.sm }}>
                    <Field label="Motivo (a pessoa vai ver)" value={reason} onChangeText={setReason} placeholder="Ex.: foto tremida, documento cortado" />
                    <Row gap={space.sm}>
                      <Button title="Cancelar" variant="secondary" onPress={() => setRejecting(null)} style={{ flex: 1 }} />
                      <Button
                        title="Reprovar"
                        variant="danger"
                        loading={busy === `${kind}-no`}
                        onPress={() => act(`${kind}-no`, () => api.staffReview({ uid, kind, approve: false, reason }))}
                        style={{ flex: 1 }}
                      />
                    </Row>
                  </View>
                ) : (
                  <View style={{ gap: space.sm }}>
                    {kind === 'antecedentes' ? (
                      <Field label="Válida até" value={validUntil} onChangeText={setValidUntil} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" maxLength={10} />
                    ) : null}
                    <Row gap={space.sm}>
                      <Button title="Reprovar" variant="secondary" onPress={() => setRejecting(kind)} disabled={!!busy} style={{ flex: 1 }} />
                      <Button
                        title="Aprovar"
                        loading={busy === `${kind}-yes`}
                        disabled={!!busy}
                        onPress={() =>
                          act(`${kind}-yes`, () => api.staffReview({ uid, kind, approve: true, validUntil: kind === 'antecedentes' ? isoDate(validUntil) : undefined }))
                        }
                        style={{ flex: 1 }}
                      />
                    </Row>
                  </View>
                )
              ) : null}
            </Card>
          </Section>
        );
      })}

      {data.role === 'cuidador' && data.approvedByStaff !== null ? (
        <Section title="Liberação">
          <Card>
            <Text variant="caption">
              {data.approvedByStaff
                ? 'Liberado: aparece na busca enquanto os documentos estiverem em dia.'
                : ready
                  ? 'Documentos aprovados. Libere depois de conferir o perfil (e, se quiser, uma entrevista).'
                  : 'Aprove todos os documentos antes de liberar.'}
            </Text>
            <Button
              title={data.approvedByStaff ? 'Bloquear cuidador' : 'Liberar cuidador'}
              variant={data.approvedByStaff ? 'danger' : 'primary'}
              disabled={!data.approvedByStaff && !ready}
              loading={busy === 'approve'}
              onPress={() => act('approve', () => api.staffApproveCaregiver(uid, !data.approvedByStaff))}
            />
          </Card>
        </Section>
      ) : null}

      <Button title="Voltar para a fila" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
