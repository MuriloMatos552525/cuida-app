import { Platform } from 'react-native';

import type { ServiceCategory } from '@shared/models';

// Identidade visual. Todas as telas usam só estes tokens, então trocar o estilo é trocar o
// tema aqui. EXPO_PUBLIC_THEME escolhe entre as opções enquanto a definitiva não é escolhida.

type ThemeName = 'coral' | 'violeta' | 'azul';

interface Theme {
  colors: {
    background: string;
    card: string;
    surface: string;
    border: string;
    text: string;
    textSecondary: string;
    primary: string;
    onPrimary: string;
    primarySoft: string;
    hero: string;
    onHero: string;
    onHeroSecondary: string;
    trust: string;
    trustSoft: string;
    danger: string;
    dangerSoft: string;
    warning: string;
    warningSoft: string;
    star: string;
  };
  categories: Record<ServiceCategory, { tint: string; ink: string }>;
  font: { regular: string; medium: string; semibold: string; bold: string; extrabold: string };
  radius: { sm: number; md: number; lg: number; pill: number };
}

const common = {
  danger: '#D92D20',
  dangerSoft: '#FDECEA',
  warning: '#B54708',
  warningSoft: '#FEF4E6',
  star: '#F5A524',
};

const nunito = {
  regular: 'Nunito_400Regular',
  medium: 'Nunito_600SemiBold',
  semibold: 'Nunito_700Bold',
  bold: 'Nunito_800ExtraBold',
  extrabold: 'Nunito_900Black',
};

const jakarta = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

const themes: Record<ThemeName, Theme> = {
  // Acolhedor: tons quentes, cantos bem redondos e fonte arredondada.
  coral: {
    colors: {
      ...common,
      background: '#FFF8F3',
      card: '#FFFFFF',
      surface: '#FBEFE7',
      border: '#F1E2D7',
      text: '#2B1A12',
      textSecondary: '#8A7266',
      primary: '#F0603C',
      onPrimary: '#FFFFFF',
      primarySoft: '#FFE4DA',
      hero: '#F0603C',
      onHero: '#FFFFFF',
      onHeroSecondary: '#FFE0D5',
      trust: '#13957A',
      trustSoft: '#DDF4EC',
    },
    categories: {
      baba: { tint: '#FFE4DA', ink: '#E04E2A' },
      pet: { tint: '#FFF0C7', ink: '#C98A00' },
      idoso: { tint: '#DDF4EC', ink: '#13957A' },
    },
    font: nunito,
    radius: { sm: 14, md: 20, lg: 28, pill: 999 },
  },
  // Vibrante: roxo forte, amarelo de destaque e fonte geométrica.
  violeta: {
    colors: {
      ...common,
      background: '#F5F3FF',
      card: '#FFFFFF',
      surface: '#EEEAFE',
      border: '#E3DCFB',
      text: '#1A1033',
      textSecondary: '#6E6690',
      primary: '#6D3BEF',
      onPrimary: '#FFFFFF',
      primarySoft: '#EAE2FF',
      hero: '#5B2BE0',
      onHero: '#FFFFFF',
      onHeroSecondary: '#D9CCFF',
      trust: '#0E9F75',
      trustSoft: '#DBF5EC',
    },
    categories: {
      baba: { tint: '#FFE1F0', ink: '#E2387F' },
      pet: { tint: '#FFF1C9', ink: '#D48B00' },
      idoso: { tint: '#DBF5EC', ink: '#0E9F75' },
    },
    font: jakarta,
    radius: { sm: 14, md: 18, lg: 24, pill: 999 },
  },
  // Confiança: azul de saúde, branco limpo e verde para segurança.
  azul: {
    colors: {
      ...common,
      background: '#F4F7FB',
      card: '#FFFFFF',
      surface: '#EAF0F7',
      border: '#DDE5EF',
      text: '#0D1B2A',
      textSecondary: '#5D6B7C',
      primary: '#1463E0',
      onPrimary: '#FFFFFF',
      primarySoft: '#E1ECFD',
      hero: '#0F4FB8',
      onHero: '#FFFFFF',
      onHeroSecondary: '#C9DBFA',
      trust: '#0B9A6A',
      trustSoft: '#DCF4EA',
    },
    categories: {
      baba: { tint: '#E1ECFD', ink: '#1463E0' },
      pet: { tint: '#FFF0D2', ink: '#D98600' },
      idoso: { tint: '#DCF4EA', ink: '#0B9A6A' },
    },
    font: jakarta,
    radius: { sm: 12, md: 16, lg: 22, pill: 999 },
  },
};

const selected = (process.env.EXPO_PUBLIC_THEME as ThemeName | undefined) ?? 'coral';
const theme = themes[selected] ?? themes.coral;

export const colors = theme.colors;
export const font = theme.font;
export const radius = theme.radius;
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Sombra suave dos cartões. */
export const shadow = Platform.select({
  web: { boxShadow: '0 6px 20px rgba(20, 10, 40, 0.07)' },
  default: { shadowColor: '#140A28', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
}) as object;

export const categoryInfo: Record<
  ServiceCategory,
  {
    title: string;
    subtitle: string;
    icon: 'happy-outline' | 'paw-outline' | 'heart-outline';
    tint: string;
    ink: string;
    dependent: [string, string];
  }
> = {
  baba: { title: 'Babá', subtitle: 'Para as crianças', icon: 'happy-outline', ...theme.categories.baba, dependent: ['criança', 'crianças'] },
  pet: { title: 'Pet sitter', subtitle: 'Para cães e gatos', icon: 'paw-outline', ...theme.categories.pet, dependent: ['pet', 'pets'] },
  idoso: {
    title: 'Cuidador de idosos',
    subtitle: 'Para quem você ama',
    icon: 'heart-outline',
    ...theme.categories.idoso,
    dependent: ['pessoa', 'pessoas'],
  },
};
