import type { PriceBreakdown, PricingRule, QuoteRequest, SurchargeReason } from './models';

// Cálculo do valor sugerido de uma reserva.
// O mesmo código roda no app (estimativa na hora) e nas Cloud Functions (valor que vale na cobrança).

export const TIME_ZONE = 'America/Sao_Paulo';
/** Janela noturna: das 22h às 6h. */
export const NIGHT_START_HOUR = 22;
export const NIGHT_END_HOUR = 6;

export class PricingError extends Error {
  constructor(public code: 'end_before_start' | 'invalid_dependents' | 'negative_distance') {
    super(code);
    this.name = 'PricingError';
  }
}

/** Arredonda meio centavo para longe do zero. */
export function roundCents(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function applyBp(amount: number, bp: number): number {
  return roundCents((amount * bp) / 10_000);
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Hora, dia da semana (0 = domingo) e data local (AAAA-MM-DD) no fuso de São Paulo. */
export function localParts(date: Date): { hour: number; weekday: number; day: string } {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { hour: Number(parts.hour) % 24, weekday, day: `${parts.year}-${parts.month}-${parts.day}` };
}

export function isWeekend(date: Date): boolean {
  const { weekday } = localParts(date);
  return weekday === 0 || weekday === 6;
}

/** Verdadeiro se qualquer parte do intervalo cai entre 22h e 6h (checado a cada 30 minutos). */
export function touchesNight(start: Date, end: Date): boolean {
  for (let t = start.getTime(); t < end.getTime(); t += 30 * 60_000) {
    const { hour } = localParts(new Date(t));
    if (hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR) return true;
  }
  return false;
}

export function quote(request: QuoteRequest, rule: PricingRule): PriceBreakdown {
  if (request.end.getTime() <= request.start.getTime()) throw new PricingError('end_before_start');
  if (!Number.isInteger(request.dependents) || request.dependents < 1) throw new PricingError('invalid_dependents');
  if (request.distanceToLocationKm < 0 || request.tripsDuringServiceKm < 0) throw new PricingError('negative_distance');

  const minutes = Math.floor((request.end.getTime() - request.start.getTime()) / 60_000);

  let billedUnits: number;
  let timeAmount: number;
  let discount = 0;
  let surcharge = 0;
  let surchargeReason: SurchargeReason | null = null;

  if (request.mode === 'hora') {
    const billableMinutes = Math.max(minutes, rule.minimumHours * 60);
    billedUnits = Math.ceil(billableMinutes / 60);
    timeAmount = roundCents((rule.hourlyRate * billableMinutes) / 60);

    // Só o maior acréscimo vale (noite, fim de semana e feriado não se somam).
    // Em empate, a ordem de preferência é feriado, fim de semana, noite.
    const candidates: [number, SurchargeReason][] = [];
    if (request.isHoliday) candidates.push([rule.holidaySurchargeBp, 'feriado']);
    if (isWeekend(request.start)) candidates.push([rule.weekendSurchargeBp, 'fim_de_semana']);
    if (touchesNight(request.start, request.end)) candidates.push([rule.nightSurchargeBp, 'noturno']);
    let bestBp = 0;
    for (const [bp, reason] of candidates) {
      if (bp > bestBp) {
        bestBp = bp;
        surchargeReason = reason;
      }
    }
    surcharge = applyBp(timeAmount, bestBp);
  } else {
    billedUnits = Math.ceil(minutes / 1440);
    timeAmount = rule.dailyRate * billedUnits;
    if (billedUnits >= rule.longStayDays) discount = applyBp(timeAmount, rule.longStayDiscountBp);
  }

  const netTime = timeAmount - discount;
  const dependentsExtra = applyBp(netTime, rule.extraDependentBp * (request.dependents - 1));
  const specialtyExtra = request.requiresSpecialty ? applyBp(netTime, rule.specialtySurchargeBp) : 0;
  const travelToLocation = rule.travelBaseFee + roundCents(rule.perKmRate * request.distanceToLocationKm * 2);
  const travelDuringService = roundCents(rule.perKmRate * request.tripsDuringServiceKm);

  const total = netTime + surcharge + dependentsExtra + specialtyExtra + travelToLocation + travelDuringService;
  const platformFee = applyBp(total, rule.platformFeeBp);

  return {
    billedUnits,
    mode: request.mode,
    timeAmount,
    longStayDiscount: discount,
    surcharge,
    surchargeReason,
    dependentsExtra,
    specialtyExtra,
    travelToLocation,
    travelDuringService,
    total,
    platformFee,
    caregiverPayout: total - platformFee,
  };
}

/** Formata centavos como "R$ 1.234,56". */
export function brl(cents: number): string {
  const value = (cents / 100).toFixed(2).split('.');
  const integer = value[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${integer},${value[1]}`;
}

/** Distância em linha reta (haversine), em km. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
