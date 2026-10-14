import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, TextInput, View } from 'react-native';

import type { Booking, Review } from '@shared/models';
import { availableEvents, BookingEvent } from '@shared/rules';

import {
  Avatar,
  Button,
  Card,
  Chip,
  Field,
  Loading,
  Notice,
  PriceDetails,
  Row,
  Screen,
  Section,
  StarPicker,
  Text,
} from '@/components/ui';
import { api } from '@/lib/api';
import { dependentsLabel, formatRange, statusLabel } from '@/lib/format';
import { currentCoordinate } from '@/lib/location';
import { useProfile } from '@/lib/session';
import { categoryInfo, colors, radius, space } from '@/lib/theme';

const steps = ['solicitada', 'aceita', 'a_caminho', 'em_andamento', 'concluida'] as const;
const stepLabel = { solicitada: 'Pedido', aceita: 'Aceito', a_caminho: 'A caminho', em_andamento: 'Iniciado', concluida: 'Concluído' };

const eventButton: Record<BookingEvent, { title: string; variant: 'primary' | 'secondary' | 'danger' }> = {
  accept: { title: 'Aceitar', variant: 'primary' },
  decline: { title: 'Recusar', variant: 'secondary' },
  start_trip: { title: 'Estou a caminho', variant: 'primary' },
  start: { title: 'Iniciar serviço', variant: 'primary' },
  finish: { title: 'Encerrar serviço', variant: 'primary' },
  cancel: { title: 'Cancelar reserva', variant: 'secondary' },
  dispute: { title: 'Abrir disputa', variant: 'secondary' },
};

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile();
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [pin, setPin] = useState<string | null>(null);
  const [street, setStreet] = useState<string | null>(null);
  const [typedPin, setTypedPin] = useState('');
  const [busy, setBusy] = useState<BookingEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sos, setSos] = useState<'fechado' | 'confirmar' | 'enviado'>('fechado');

  useEffect(() => api.watchBooking(id, setBooking), [id]);
  const status = booking?.status;
  useEffect(() => {
    if (!status) return;
    api.bookingPin(id).then(setPin);
    api.bookingAddress(id).then((a) => setStreet(a?.street ?? null));
  }, [id, status]);

  if (booking === undefined) return <Loading />;
  if (booking === null) {
    return (
      <Screen edges={[]}>
        <Text>Reserva não encontrada.</Text>
      </Screen>
    );
  }

  const viewer = booking.caregiverId === profile.uid ? 'cuidador' : 'cliente';
  const events = availableEvents(booking.status, viewer);
  const stepIndex = steps.indexOf(booking.status as (typeof steps)[number]);
  const live = ['aceita', 'a_caminho', 'em_andamento'].includes(booking.status);
  const other = viewer === 'cliente' ? booking.caregiver.name : booking.clientName;

  async function run(event: BookingEvent) {
    setBusy(event);
    setError(null);
    try {
      await api.transition(id, event, event === 'start' ? typedPin : undefined);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function emergency() {
    setSos('enviado');
    const coordinate = await currentCoordinate();
    await api.triggerEmergency(id, coordinate).catch(() => undefined);
  }

  return (
    <Screen edges={[]}>
      <View style={{ gap: space.xs }}>
        <Text variant="caption">{categoryInfo[booking.category].title}</Text>
        <Text variant="display">{statusLabel[booking.status]}</Text>
      </View>

      {stepIndex >= 0 ? (
        <Row gap={4}>
          {steps.map((s, i) => (
            <View key={s} style={{ flex: 1, gap: 4 }}>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= stepIndex ? colors.text : colors.border }} />
              <Text variant="caption" style={{ fontSize: 11 }}>
                {stepLabel[s]}
              </Text>
            </View>
          ))}
        </Row>
      ) : null}

      {viewer === 'cliente' && pin && live && booking.status !== 'em_andamento' ? (
        <Card style={{ backgroundColor: colors.trustSoft, alignItems: 'center' }}>
          <Text variant="label" color={colors.trust}>
            Código de início
          </Text>
          <Text style={{ fontSize: 44, fontWeight: '700', letterSpacing: 10, color: colors.trust }}>{pin}</Text>
          <Text variant="caption" style={{ textAlign: 'center' }}>
            Passe este código ao cuidador só quando ele chegar e você conferir que é a mesma pessoa da foto.
          </Text>
        </Card>
      ) : null}

      <Card>
        <Row gap={space.md}>
          <Avatar name={other} size={48} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{other}</Text>
            <Text variant="caption">{viewer === 'cliente' ? 'Cuidador' : 'Cliente'}</Text>
          </View>
        </Row>
        <Text>{formatRange(booking.start, booking.end)}</Text>
        <Text variant="caption">{dependentsLabel(booking.category, booking.dependents)}</Text>
        <Row gap={6}>
          <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
          <Text variant="caption" style={{ flex: 1 }}>
            {street ? `${booking.addressLabel} · ${street}` : `${booking.addressLabel} · ${booking.city} (endereço liberado após aceitar)`}
          </Text>
        </Row>
        {booking.notes ? <Text variant="caption">“{booking.notes}”</Text> : null}
      </Card>

      {events.length ? (
        <View style={{ gap: space.sm }}>
          {events.includes('start') && viewer === 'cuidador' ? (
            <View style={{ gap: space.xs }}>
              <Text variant="label">Código do cliente</Text>
              {api.demo ? <Text variant="caption">Na demonstração, o código da Paula é 4821.</Text> : null}
              <TextInput
                value={typedPin}
                onChangeText={(t) => setTypedPin(t.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                placeholder="0000"
                placeholderTextColor={colors.textSecondary}
                style={{
                  backgroundColor: colors.surface, borderRadius: radius.sm, padding: space.md,
                  fontSize: 28, letterSpacing: 8, textAlign: 'center', color: colors.text,
                }}
              />
            </View>
          ) : null}
          {events.map((event) => (
            <Button
              key={event}
              title={eventButton[event].title}
              variant={eventButton[event].variant}
              onPress={() => run(event)}
              loading={busy === event}
              disabled={event === 'start' && typedPin.length !== 4}
            />
          ))}
          {error ? <Notice tone="danger" text={error} /> : null}
        </View>
      ) : null}

      {live ? (
        <Card style={{ backgroundColor: colors.dangerSoft }}>
          {sos === 'fechado' ? (
            <Button title="Emergência" icon="warning" variant="danger" onPress={() => setSos('confirmar')} />
          ) : sos === 'confirmar' ? (
            <>
              <Text color={colors.danger}>Avisar a central do Cuida e seus contatos de emergência com sua localização?</Text>
              <Row>
                <Button title="Sim, avisar" variant="danger" onPress={emergency} style={{ flex: 1 }} />
                <Button title="Voltar" variant="secondary" onPress={() => setSos('fechado')} style={{ flex: 1 }} />
              </Row>
            </>
          ) : (
            <Text color={colors.danger}>Alerta enviado. Nossa central vai entrar em contato agora.</Text>
          )}
          <Button title="Ligar 190 (Polícia)" icon="call" variant="ghost" onPress={() => Linking.openURL('tel:190')} />
        </Card>
      ) : null}

      <Section title={viewer === 'cliente' ? 'Valor' : 'Seus ganhos'}>
        <PriceDetails price={booking.price} viewer={viewer} />
      </Section>

      {booking.status === 'concluida' || booking.status === 'avaliada' ? <ReviewBox bookingId={id} name={other} /> : null}
    </Screen>
  );
}

const reviewTags = ['Pontual', 'Atencioso', 'Comunicativo', 'Cuidadoso', 'Educado'];

function ReviewBox({ bookingId, name }: { bookingId: string; name: string }) {
  const [mine, setMine] = useState<Review | null | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.myReview(bookingId).then(setMine);
  }, [bookingId]);

  if (mine === undefined) return null;
  if (mine) {
    return (
      <Notice
        tone="trust"
        icon="star"
        text={
          mine.visible
            ? 'Avaliações publicadas. Obrigado!'
            : 'Obrigado! Sua avaliação aparece quando a outra pessoa também avaliar (ou em 7 dias).'
        }
      />
    );
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      await api.submitReview(bookingId, { rating, tags, comment });
      setMine(await api.myReview(bookingId));
    } catch (e) {
      setError((e as Error).message);
      setSending(false);
    }
  }

  return (
    <Section title={`Como foi com ${name.split(' ')[0]}?`}>
      <Card style={{ gap: space.md }}>
        <StarPicker value={rating} onChange={setRating} />
        <Row style={{ flexWrap: 'wrap' }}>
          {reviewTags.map((t) => (
            <Chip
              key={t}
              label={t}
              selected={tags.includes(t)}
              onPress={() => setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]))}
            />
          ))}
        </Row>
        <Field label="Comentário (opcional)" value={comment} onChangeText={setComment} multiline />
        <Text variant="caption">A avaliação é às cegas: ninguém vê a nota do outro antes de dar a sua.</Text>
        <Button title="Enviar avaliação" onPress={send} loading={sending} disabled={!rating} />
        {error ? <Notice tone="danger" text={error} /> : null}
      </Card>
    </Section>
  );
}
