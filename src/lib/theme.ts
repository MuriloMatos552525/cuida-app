import type { ServiceCategory } from '@shared/models';

// Visual minimalista: fundo branco, texto quase preto, botões pretos e um verde-azulado
// reservado para o que é sinal de segurança (verificado, PIN, antecedentes).

export const colors = {
  background: '#FFFFFF',
  surface: '#F4F4F5',
  border: '#E4E4E7',
  text: '#111113',
  textSecondary: '#6B6B73',
  primary: '#111113',
  onPrimary: '#FFFFFF',
  trust: '#0D8C85',
  trustSoft: '#E3F4F2',
  danger: '#D92D20',
  dangerSoft: '#FDECEA',
  warning: '#B54708',
  warningSoft: '#FEF4E6',
  star: '#F5A524',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const categoryInfo: Record<
  ServiceCategory,
  { title: string; subtitle: string; icon: 'happy-outline' | 'paw-outline' | 'heart-outline'; tint: string; dependent: [string, string] }
> = {
  baba: { title: 'Babá', subtitle: 'Para as crianças', icon: 'happy-outline', tint: '#FDECEF', dependent: ['criança', 'crianças'] },
  pet: { title: 'Pet sitter', subtitle: 'Para cães e gatos', icon: 'paw-outline', tint: '#FEF4E1', dependent: ['pet', 'pets'] },
  idoso: { title: 'Cuidador de idosos', subtitle: 'Para quem você ama', icon: 'heart-outline', tint: '#E3F4F2', dependent: ['pessoa', 'pessoas'] },
};
