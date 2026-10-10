import { brl, quote, PricingError } from '../src/shared/pricing';
import { availableEvents, isCaregiverEligible, nextStatus, TransitionError } from '../src/shared/rules';
import { SAMPLE_PRICING_RULES } from '../src/shared/seedData';

const baba = SAMPLE_PRICING_RULES.find((r) => r.category === 'baba')!;
const idoso = SAMPLE_PRICING_RULES.find((r) => r.category === 'idoso')!;

/** Data/hora no fuso de São Paulo (UTC-3). */
const at = (text: string) => new Date(`${text.replace(' ', 'T')}:00-03:00`);

const base = { dependents: 1, tripsDuringServiceKm: 0, requiresSpecialty: false, isHoliday: false };

describe('quote', () => {
  test('dia de semana à tarde, por hora', () => {
    const p = quote(
      { ...base, category: 'baba', start: at('2026-10-07 14:00'), end: at('2026-10-07 18:00'), mode: 'hora', distanceToLocationKm: 3 },
      baba,
    );
    expect(p).toMatchObject({
      billedUnits: 4, timeAmount: 14_000, surcharge: 0, travelToLocation: 1_700,
      total: 15_700, platformFee: 2_826, caregiverPayout: 12_874,
    });
  });

  test('mínimo de horas', () => {
    const p = quote(
      { ...base, category: 'baba', start: at('2026-10-07 14:00'), end: at('2026-10-07 15:00'), mode: 'hora', distanceToLocationKm: 0 },
      baba,
    );
    expect(p).toMatchObject({ billedUnits: 3, timeAmount: 10_500, total: 11_300, platformFee: 2_034 });
  });

  test('sábado à noite com 2 crianças: vale só o maior acréscimo', () => {
    const p = quote(
      { ...base, category: 'baba', start: at('2026-10-10 20:00'), end: at('2026-10-10 23:00'), mode: 'hora', dependents: 2, distanceToLocationKm: 2 },
      baba,
    );
    expect(p).toMatchObject({
      surchargeReason: 'noturno', surcharge: 2_100, dependentsExtra: 2_625, travelToLocation: 1_400,
      total: 16_625, platformFee: 2_993, caregiverPayout: 13_632,
    });
  });

  test('5 diárias com especialidade e deslocamentos', () => {
    const p = quote(
      {
        ...base, category: 'idoso', start: at('2026-10-12 08:00'), end: at('2026-10-17 08:00'), mode: 'diaria',
        distanceToLocationKm: 4, tripsDuringServiceKm: 10, requiresSpecialty: true,
      },
      idoso,
    );
    expect(p).toMatchObject({
      billedUnits: 5, timeAmount: 140_000, longStayDiscount: 14_000, specialtyExtra: 31_500,
      travelToLocation: 2_000, travelDuringService: 1_500, total: 161_000, platformFee: 28_980, caregiverPayout: 132_020,
    });
  });

  test('feriado', () => {
    const p = quote(
      { ...base, category: 'baba', start: at('2026-10-07 14:00'), end: at('2026-10-07 18:00'), mode: 'hora', distanceToLocationKm: 0, isHoliday: true },
      baba,
    );
    expect(p).toMatchObject({ surchargeReason: 'feriado', surcharge: 7_000 });
  });

  test('rejeita pedidos inválidos', () => {
    const ok = { ...base, category: 'baba' as const, mode: 'hora' as const, distanceToLocationKm: 0 };
    expect(() => quote({ ...ok, start: at('2026-10-07 18:00'), end: at('2026-10-07 14:00') }, baba)).toThrow(PricingError);
    expect(() => quote({ ...ok, start: at('2026-10-07 14:00'), end: at('2026-10-07 18:00'), dependents: 0 }, baba)).toThrow(
      PricingError,
    );
  });

  test('formata em reais', () => {
    expect(brl(161_000)).toBe('R$ 1.610,00');
    expect(brl(2_826)).toBe('R$ 28,26');
  });
});

describe('estados da reserva', () => {
  test('caminho completo com PIN', () => {
    let s = nextStatus('solicitada', 'accept', 'cuidador');
    s = nextStatus(s, 'start_trip', 'cuidador');
    s = nextStatus(s, 'start', 'cuidador', { given: '1234', expected: '1234' });
    s = nextStatus(s, 'finish', 'cuidador');
    expect(s).toBe('concluida');
  });

  test('PIN errado não inicia', () => {
    expect(() => nextStatus('aceita', 'start', 'cuidador', { given: '0000', expected: '1234' })).toThrow(
      new TransitionError('wrong_pin'),
    );
  });

  test('cliente não aceita a própria reserva nem cancela depois de iniciada', () => {
    expect(() => nextStatus('solicitada', 'accept', 'cliente')).toThrow(TransitionError);
    expect(() => nextStatus('em_andamento', 'cancel', 'cliente')).toThrow(TransitionError);
  });

  test('botões disponíveis', () => {
    expect(availableEvents('solicitada', 'cuidador')).toEqual(['accept', 'decline', 'cancel']);
    expect(availableEvents('solicitada', 'cliente')).toEqual(['cancel']);
    expect(availableEvents('em_andamento', 'cuidador')).toEqual(['finish']);
  });
});

describe('elegibilidade do cuidador', () => {
  const approved = { status: 'aprovado' as const };
  const full = { cpf: approved, documento: approved, selfie: approved, antecedentes: { status: 'aprovado' as const, validUntil: '2027-04-01' } };
  const opts = { approvedByStaff: true, suspended: false, today: '2026-10-10' };

  test('tudo aprovado e válido', () => expect(isCaregiverEligible(full, opts)).toBe(true));
  test('antecedentes vencidos', () =>
    expect(isCaregiverEligible({ ...full, antecedentes: { status: 'aprovado', validUntil: '2026-10-09' } }, opts)).toBe(false));
  test('sem aprovação da equipe', () => expect(isCaregiverEligible(full, { ...opts, approvedByStaff: false })).toBe(false));
  test('suspenso', () => expect(isCaregiverEligible(full, { ...opts, suspended: true })).toBe(false));
  test('selfie em análise', () =>
    expect(isCaregiverEligible({ ...full, selfie: { status: 'em_analise' } }, opts)).toBe(false));
});
