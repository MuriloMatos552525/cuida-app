import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { View } from 'react-native';

import type { UserRole } from '@shared/models';

import { Button, Card, Chip, Field, Notice, Row, Screen, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, space } from '@/lib/theme';

export default function SignIn() {
  const [mode, setMode] = useState<'entrar' | 'criar'>('entrar');
  const [role, setRole] = useState<UserRole>('cliente');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(override?: { email: string; password: string }) {
    setLoading(true);
    setError(null);
    try {
      if (override) await api.signIn(override.email, override.password);
      else if (mode === 'entrar') await api.signIn(email, password);
      else {
        if (fullName.trim().split(' ').length < 2) throw new Error('Informe nome e sobrenome.');
        await api.signUp({ fullName, email, password, role });
      }
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: space.sm, marginTop: space.xl }}>
        <Row gap={10}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="heart" size={24} color={colors.background} />
          </View>
          <Text variant="display">Cuida</Text>
        </Row>
        <Text variant="title">Cuidado de confiança, na hora que você precisa.</Text>
        <Text color={colors.textSecondary}>Babás, pet sitters e cuidadores de idosos verificados perto de você.</Text>
      </View>

      <Row>
        <Chip label="Entrar" selected={mode === 'entrar'} onPress={() => setMode('entrar')} />
        <Chip label="Criar conta" selected={mode === 'criar'} onPress={() => setMode('criar')} />
      </Row>

      {mode === 'criar' ? (
        <View style={{ gap: space.md }}>
          <Text variant="label">Como você vai usar o Cuida?</Text>
          <Row>
            <Chip label="Quero contratar" icon="search" selected={role === 'cliente'} onPress={() => setRole('cliente')} />
            <Chip label="Quero trabalhar" icon="briefcase-outline" selected={role === 'cuidador'} onPress={() => setRole('cuidador')} />
          </Row>
          <Field label="Nome completo" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" />
        </View>
      ) : null}

      <View style={{ gap: space.md }}>
        <Field
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Field
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType={mode === 'criar' ? 'newPassword' : 'password'}
          onSubmitEditing={() => submit()}
        />
        {error ? <Notice tone="danger" text={error} /> : null}
        <Button title={mode === 'entrar' ? 'Entrar' : 'Criar conta'} onPress={() => submit()} loading={loading} />
      </View>

      {api.demo ? (
        <Card>
          <Text variant="label">Modo demonstração</Text>
          <Text variant="caption">O Firebase ainda não está configurado. Experimente o app com contas de exemplo:</Text>
          <Row>
            <Chip label="Sou cliente" icon="person-outline" onPress={() => submit({ email: 'cliente@demo.com', password: 'demo' })} />
            <Chip label="Sou cuidadora" icon="briefcase-outline" onPress={() => submit({ email: 'ana@demo.com', password: 'demo' })} />
          </Row>
        </Card>
      ) : null}

      <Text variant="caption" style={{ textAlign: 'center' }}>
        Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade (LGPD).
      </Text>
    </Screen>
  );
}
