import { Platform } from 'react-native';

import type { ServiceCategory } from '@shared/models';

// Identidade visual (estilo Coral, escolhido em 14/10/2026). Todas as telas usam só estes tokens.

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

// Acolhedor: tons quentes, cantos bem redondos e fonte arredondada.
const theme: Theme = {
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
};

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
