import { router } from 'expo-router';
import { useState } from 'react';

import type { Coordinate } from '@shared/models';

import { Button, Field, Notice, Screen, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { currentCoordinate, DEMO_COORDINATE } from '@/lib/location';

export default function NewAddress() {
  const [label, setLabel] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('São Paulo');
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function locate() {
    setLocating(true);
    setError(null);
    const c = (await currentCoordinate()) ?? (api.demo ? DEMO_COORDINATE : null);
    if (!c) setError('Não conseguimos sua localização. Permita o acesso nas configurações.');
    setCoordinate(c);
    setLocating(false);
  }

  async function save() {
    if (!coordinate) return;
    setSaving(true);
    try {
      await api.addAddress({ label: label.trim() || 'Endereço', street: street.trim(), city: city.trim(), coordinate });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Screen
      edges={['bottom']}
      footer={<Button title="Salvar endereço" onPress={save} loading={saving} disabled={!coordinate || !street.trim() || !city.trim()} />}>
      <Field label="Nome" placeholder="Casa, Trabalho, Casa da vó…" value={label} onChangeText={setLabel} />
      <Field label="Rua, número e complemento" value={street} onChangeText={setStreet} autoComplete="street-address" />
      <Field label="Cidade" value={city} onChangeText={setCity} />
      <Button
        title={coordinate ? 'Localização marcada' : 'Usar minha localização atual'}
        icon={coordinate ? 'checkmark-circle' : 'locate'}
        variant="secondary"
        onPress={locate}
        loading={locating}
      />
      <Text variant="caption">
        Use a localização estando no endereço do atendimento. O endereço exato só é mostrado ao cuidador depois que ele aceita a
        reserva.
      </Text>
      {error ? <Notice tone="danger" text={error} /> : null}
    </Screen>
  );
}
