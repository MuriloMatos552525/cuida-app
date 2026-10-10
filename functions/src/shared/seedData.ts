import type { Coordinate, PricingRule, ServiceCategory, Specialty } from './models';

// Dados iniciais. As tarifas são VALORES DE EXEMPLO: ajuste antes de lançar.

export const SAMPLE_CITY = 'São Paulo';

export const SPECIALTIES: Specialty[] = [
  { id: 'primeiros-socorros-infantil', name: 'Primeiros socorros infantis', category: 'baba' },
  { id: 'recem-nascidos', name: 'Recém-nascidos', category: 'baba' },
  { id: 'neurodivergentes', name: 'Crianças neurodivergentes', category: 'baba' },
  { id: 'caes-grande-porte', name: 'Cães de grande porte', category: 'pet' },
  { id: 'medicacao-pet', name: 'Medicação para pets', category: 'pet' },
  { id: 'gatos', name: 'Gatos', category: 'pet' },
  { id: 'medicamentos', name: 'Administração de medicamentos', category: 'idoso' },
  { id: 'mobilidade-reduzida', name: 'Mobilidade reduzida', category: 'idoso' },
  { id: 'tecnico-enfermagem', name: 'Técnico de enfermagem', category: 'idoso' },
];

const common = {
  city: SAMPLE_CITY,
  longStayDays: 5,
  longStayDiscountBp: 1000,
  perKmRate: 150,
  nightSurchargeBp: 2000,
  holidaySurchargeBp: 5000,
  platformFeeBp: 1800,
};

export const SAMPLE_PRICING_RULES: PricingRule[] = [
  { ...common, category: 'baba', hourlyRate: 3500, dailyRate: 25000, minimumHours: 3, travelBaseFee: 800,
    weekendSurchargeBp: 1500, extraDependentBp: 2500, specialtySurchargeBp: 1500 },
  { ...common, category: 'pet', hourlyRate: 2500, dailyRate: 15000, minimumHours: 1, travelBaseFee: 600,
    weekendSurchargeBp: 1000, extraDependentBp: 3000, specialtySurchargeBp: 1500 },
  { ...common, category: 'idoso', hourlyRate: 4000, dailyRate: 28000, minimumHours: 4, travelBaseFee: 800,
    weekendSurchargeBp: 1500, extraDependentBp: 4000, specialtySurchargeBp: 2500 },
];

/** Feriados nacionais (AAAA-MM-DD). Os municipais entram na coleção holidays por cidade. */
export const NATIONAL_HOLIDAYS: Record<string, string> = {
  '2026-10-12': 'Nossa Senhora Aparecida',
  '2026-11-02': 'Finados',
  '2026-11-15': 'Proclamação da República',
  '2026-11-20': 'Consciência Negra',
  '2026-12-25': 'Natal',
  '2027-01-01': 'Confraternização Universal',
  '2027-03-26': 'Sexta-feira Santa',
  '2027-04-21': 'Tiradentes',
  '2027-05-01': 'Dia do Trabalho',
  '2027-09-07': 'Independência',
};

// Cuidadores de demonstração perto da Av. Paulista (seed do emulador e modo demonstração do app).
export interface DemoCaregiver {
  id: string;
  name: string;
  bio: string;
  categories: ServiceCategory[];
  specialtyIds: string[];
  coordinate: Coordinate;
  rating: number;
  reviewCount: number;
}

export const DEMO_CAREGIVERS: DemoCaregiver[] = [
  {
    id: 'demo-ana', name: 'Ana Souza', bio: 'Pedagoga, 8 anos cuidando de crianças pequenas.',
    categories: ['baba'], specialtyIds: ['primeiros-socorros-infantil', 'recem-nascidos'],
    coordinate: { latitude: -23.5629, longitude: -46.6544 }, rating: 4.9, reviewCount: 132,
  },
  {
    id: 'demo-marcos', name: 'Marcos Lima', bio: 'Passeios e hospedagem de cães e gatos.',
    categories: ['pet'], specialtyIds: ['caes-grande-porte', 'gatos'],
    coordinate: { latitude: -23.5702, longitude: -46.6470 }, rating: 4.8, reviewCount: 87,
  },
  {
    id: 'demo-helena', name: 'Helena Ribeiro', bio: 'Técnica de enfermagem com experiência em pós-operatório.',
    categories: ['idoso'], specialtyIds: ['medicamentos', 'tecnico-enfermagem'],
    coordinate: { latitude: -23.5560, longitude: -46.6620 }, rating: 5, reviewCount: 54,
  },
  {
    id: 'demo-julia', name: 'Júlia Martins', bio: 'Estudante de psicologia, experiência com crianças autistas.',
    categories: ['baba'], specialtyIds: ['neurodivergentes'],
    coordinate: { latitude: -23.5750, longitude: -46.6600 }, rating: 4.7, reviewCount: 41,
  },
  {
    id: 'demo-roberto', name: 'Roberto Alves', bio: 'Cuidador há 12 anos, acompanha consultas e exames.',
    categories: ['idoso'], specialtyIds: ['mobilidade-reduzida'],
    coordinate: { latitude: -23.5480, longitude: -46.6400 }, rating: 4.8, reviewCount: 66,
  },
];
