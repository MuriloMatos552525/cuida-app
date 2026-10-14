import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { SERVICE_CATEGORIES, ServiceCategory } from '@shared/models';

import { Avatar, Button, Chip, ChipPicker, Field, Loading, Notice, Rating, Row, Screen, Section, Text, TrustBadge } from '@/components/ui';
import { VerificationList } from '@/components/verification-list';
import { api, CaregiverProfile } from '@/lib/api';
import { currentCoordinate, DEMO_COORDINATE } from '@/lib/location';
import { useProfile } from '@/lib/session';
import { categoryInfo, space } from '@/lib/theme';

export default function CaregiverProfileTab() {
  const profile = useProfile();
  const [caregiver, setCaregiver] = useState<CaregiverProfile | null>(null);
  const [bio, setBio] = useState('');
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [radiusKm, setRadiusKm] = useState(10);
  const [city, setCity] = useState('São Paulo');
  const [message, setMessage] = useState<{ tone: 'trust' | 'danger'; text: string } | null>(null);
  const [saving, setSaving] = useState<'perfil' | 'local' | null>(null);

  useEffect(() => {
    api.myCaregiverProfile().then((c) => {
      setCaregiver(c);
      if (!c) return;
      setBio(c.bio);
      setCategories(c.categories);
      setRadiusKm(c.serviceRadiusKm);
      if (c.city) setCity(c.city);
    });
  }, [profile]);

  if (!caregiver) return <Loading />;

  async function save() {
    setSaving('perfil');
    try {
      await api.updateCaregiverProfile({ bio: bio.trim(), categories, serviceRadiusKm: radiusKm });
      setMessage({ tone: 'trust', text: 'Perfil salvo.' });
    } catch (e) {
      setMessage({ tone: 'danger', text: (e as Error).message });
    }
    setSaving(null);
  }

  async function locate() {
    setSaving('local');
    const c = (await currentCoordinate()) ?? (api.demo ? DEMO_COORDINATE : null);
    try {
      if (!c) throw new Error('Não conseguimos sua localização. Permita o acesso nas configurações.');
      await api.setCaregiverLocation(c, city.trim());
      setMessage({ tone: 'trust', text: 'Região de atendimento atualizada. Clientes veem só o bairro, nunca seu endereço.' });
    } catch (e) {
      setMessage({ tone: 'danger', text: (e as Error).message });
    }
    setSaving(null);
  }

  return (
    <Screen>
      <Row gap={space.md}>
        <Avatar name={profile.fullName} size={64} />
        <View style={{ gap: 4 }}>
          <Text variant="title">{profile.fullName}</Text>
          <Rating value={caregiver.rating} count={caregiver.reviewCount} />
          {caregiver.eligible ? <TrustBadge label="Perfil verificado" /> : null}
        </View>
      </Row>

      <Section title="Verificação">
        <Text variant="caption">
          Exigida para aparecer nas buscas. A certidão de antecedentes vence a cada 6 meses e precisa ser renovada.
        </Text>
        <VerificationList profile={profile} kinds={['cpf', 'documento', 'selfie', 'antecedentes']} />
      </Section>

      <Section title="Serviços">
        <Row style={{ flexWrap: 'wrap' }}>
          {SERVICE_CATEGORIES.map((k) => (
            <Chip
              key={k}
              label={categoryInfo[k].title}
              icon={categoryInfo[k].icon}
              selected={categories.includes(k)}
              onPress={() => setCategories((cs) => (cs.includes(k) ? cs.filter((x) => x !== k) : [...cs, k]))}
            />
          ))}
        </Row>
        <Text variant="caption">Especialidades são aprovadas pela equipe depois de conferir seus certificados.</Text>
      </Section>

      <Section title="Até onde você vai">
        <ChipPicker
          value={radiusKm}
          onChange={setRadiusKm}
          options={[5, 10, 15, 20, 30].map((km) => ({ value: km, label: `${km} km` }))}
        />
        <Field label="Cidade" value={city} onChangeText={setCity} />
        <Button title="Usar minha localização como base" icon="locate" variant="secondary" onPress={locate} loading={saving === 'local'} />
      </Section>

      <Field
        label="Sobre você"
        value={bio}
        onChangeText={setBio}
        multiline
        placeholder="Experiência, formação, como você trabalha…"
        style={{ minHeight: 100, textAlignVertical: 'top' }}
      />
      {message ? <Notice tone={message.tone} text={message.text} /> : null}
      <Button title="Salvar perfil" onPress={save} loading={saving === 'perfil'} />
      <Button title="Sair" variant="secondary" onPress={() => api.signOut()} />
    </Screen>
  );
}
