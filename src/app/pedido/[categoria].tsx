import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { Address, BillingMode, ServiceCategory } from '@shared/models';
import { localParts } from '@shared/pricing';
import { SPECIALTIES } from '@shared/seedData';

import { Button, Chip, ChipPicker, Field, Notice, Row, Screen, Section, Stepper, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { setDraft } from '@/lib/draft';
import { formatDay } from '@/lib/format';
import { categoryInfo, space } from '@/lib/theme';
import { useFocusData } from '@/lib/useAsync';

const DAY_MS = 86_400_000;

/** Monta a data no fuso de São Paulo (UTC-3, sem horário de verão desde 2019). */
const saoPaulo = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00-03:00`);

export default function NewRequest() {
  const { categoria } = useLocalSearchParams<{ categoria: ServiceCategory }>();
  const category: ServiceCategory = categoria in categoryInfo ? categoria : 'baba';
  const info = categoryInfo[category];

  const { data: addresses } = useFocusData(() => api.listAddresses());
  const [addressId, setAddressId] = useState<string | null>(null);
  const address: Address | undefined = addresses?.find((a) => a.id === addressId) ?? addresses?.[0];

  const now = new Date();
  const days = Array.from({ length: 14 }, (_, i) => localParts(new Date(now.getTime() + i * DAY_MS)).day);
  const [day, setDay] = useState(days[0]);
  const isToday = day === days[0];
  const firstHour = isToday ? localParts(now).hour + 2 : 6;
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => h >= Math.max(6, firstHour) && h <= 23);
  const [hour, setHour] = useState(19);
  const startHour = hours.includes(hour) ? hour : hours[0];

  const [mode, setMode] = useState<BillingMode>('hora');
  const [duration, setDuration] = useState(4);
  const [dependents, setDependents] = useState(1);
  const [tripsKm, setTripsKm] = useState(0);
  const [specialtyIds, setSpecialtyIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!address || startHour === undefined) return;
    const start = saoPaulo(day, startHour);
    const end = new Date(start.getTime() + duration * (mode === 'hora' ? 3_600_000 : DAY_MS));
    setLoading(true);
    setError(null);
    try {
      const params = {
        category, coordinate: address.coordinate, start: start.toISOString(), end: end.toISOString(), mode,
        dependents, tripsKm, specialtyIds,
      };
      const results = await api.searchCaregivers(params);
      setDraft({ ...params, address, notes, results });
      router.push('/resultados');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const toggleSpecialty = (id: string) =>
    setSpecialtyIds((ids) => (ids.includes(id) ? ids.filter((s) => s !== id) : [...ids, id]));

  return (
    <Screen
      edges={[]}
      footer={
        <Button
          title="Buscar cuidadores"
          icon="search"
          onPress={search}
          loading={loading}
          disabled={!address || startHour === undefined}
        />
      }>
      <Stack.Screen options={{ title: info.title }} />

      <Section title="Onde">
        <Row style={{ flexWrap: 'wrap' }}>
          {addresses?.map((a) => (
            <Chip key={a.id} label={a.label} icon="location-outline" selected={a.id === address?.id} onPress={() => setAddressId(a.id)} />
          ))}
          <Chip label="Novo endereço" icon="add" onPress={() => router.push('/endereco')} />
        </Row>
        {address ? <Text variant="caption">{address.street}</Text> : <Text variant="caption">Cadastre o endereço do atendimento.</Text>}
      </Section>

      <Section title="Quando">
        <ChipPicker
          value={day}
          onChange={setDay}
          options={days.map((d, i) => ({ value: d, label: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : formatDay(saoPaulo(d, 12)) }))}
        />
        {hours.length ? (
          <ChipPicker
            value={startHour}
            onChange={setHour}
            options={hours.map((h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }))}
          />
        ) : (
          <Text variant="caption">Não há mais horários hoje. Escolha outro dia.</Text>
        )}
      </Section>

      <Section title="Por quanto tempo">
        <Row>
          <Chip label="Por hora" selected={mode === 'hora'} onPress={() => (setMode('hora'), setDuration(4))} />
          <Chip label="Diárias" selected={mode === 'diaria'} onPress={() => (setMode('diaria'), setDuration(1))} />
        </Row>
        {mode === 'hora' ? (
          <ChipPicker
            value={duration}
            onChange={setDuration}
            options={[2, 3, 4, 5, 6, 8, 10, 12].map((h) => ({ value: h, label: `${h} horas` }))}
          />
        ) : (
          <Stepper label="Diárias (24 horas cada)" value={duration} onChange={setDuration} max={30} />
        )}
      </Section>

      <Section title="Detalhes">
        <Stepper label={`Quantidade de ${info.dependent[1]}`} value={dependents} onChange={setDependents} max={6} />
        <View style={{ gap: space.sm }}>
          <Text variant="label">Trajetos durante o serviço</Text>
          <Text variant="caption">Escola, médico, veterinário. O deslocamento entra no valor.</Text>
          <ChipPicker
            value={tripsKm}
            onChange={setTripsKm}
            options={[
              { value: 0, label: 'Nenhum' },
              { value: 10, label: 'Até 10 km' },
              { value: 20, label: 'Até 20 km' },
              { value: 40, label: 'Até 40 km' },
            ]}
          />
        </View>
      </Section>

      <Section title="Especialidades (opcional)">
        <Row style={{ flexWrap: 'wrap' }}>
          {SPECIALTIES.filter((s) => s.category === category).map((s) => (
            <Chip key={s.id} label={s.name} selected={specialtyIds.includes(s.id)} onPress={() => toggleSpecialty(s.id)} />
          ))}
        </Row>
      </Section>

      <Field
        label="Observações para o cuidador"
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Rotina, alergias, medicamentos, horário de dormir…"
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />

      {error ? <Notice tone="danger" text={error} /> : null}
    </Screen>
  );
}
