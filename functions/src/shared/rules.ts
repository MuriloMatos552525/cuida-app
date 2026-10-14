import type { BookingStatus, Verifications } from './models';

// Regras de negócio compartilhadas: estados da reserva e elegibilidade do cuidador.
// As Cloud Functions aplicam estas regras; o app usa as mesmas para mostrar só os botões válidos.

export type BookingEvent = 'accept' | 'decline' | 'start_trip' | 'start' | 'finish' | 'cancel' | 'dispute';
export type Actor = 'cliente' | 'cuidador';

export class TransitionError extends Error {
  constructor(public code: 'transition_not_allowed' | 'wrong_pin') {
    super(code);
    this.name = 'TransitionError';
  }
}

const caregiverOnly: Partial<Record<BookingEvent, true>> = {
  accept: true,
  decline: true,
  start_trip: true,
  start: true,
  finish: true,
};

/** Próximo estado da reserva, ou erro se o evento não é permitido para quem pediu. */
export function nextStatus(
  status: BookingStatus,
  event: BookingEvent,
  actor: Actor,
  pin?: { given?: string | null; expected: string },
): BookingStatus {
  if (caregiverOnly[event] && actor !== 'cuidador') throw new TransitionError('transition_not_allowed');

  const next = ((): BookingStatus | null => {
    switch (event) {
      case 'accept':
        return status === 'solicitada' ? 'aceita' : null;
      case 'decline':
        return status === 'solicitada' ? 'recusada' : null;
      case 'start_trip':
        return status === 'aceita' ? 'a_caminho' : null;
      case 'start':
        return status === 'aceita' || status === 'a_caminho' ? 'em_andamento' : null;
      case 'finish':
        return status === 'em_andamento' ? 'concluida' : null;
      case 'cancel':
        return status === 'solicitada' || status === 'aceita' || status === 'a_caminho' ? 'cancelada' : null;
      case 'dispute':
        return status === 'em_andamento' || status === 'concluida' ? 'em_disputa' : null;
    }
  })();

  if (!next) throw new TransitionError('transition_not_allowed');
  if (event === 'start' && (!pin || !pin.given || pin.given !== pin.expected)) throw new TransitionError('wrong_pin');
  return next;
}

/** Eventos que fazem sentido mostrar como botão para quem está vendo a reserva. */
export function availableEvents(status: BookingStatus, actor: Actor): BookingEvent[] {
  const all: BookingEvent[] = ['accept', 'decline', 'start_trip', 'start', 'finish', 'cancel'];
  return all.filter((event) => {
    try {
      nextStatus(status, event, actor, { given: 'x', expected: 'x' });
      return true;
    } catch {
      return false;
    }
  });
}

/** Status em que o cuidador pode ver o endereço exato. */
export const ADDRESS_VISIBLE_STATUSES: BookingStatus[] = ['aceita', 'a_caminho', 'em_andamento'];

/** CPF, documento e selfie aprovados. */
export function isIdentityVerified(v: Verifications | undefined): boolean {
  return (['cpf', 'documento', 'selfie'] as const).every((kind) => v?.[kind]?.status === 'aprovado');
}

/**
 * Cuidador só aparece na busca com identidade verificada, antecedentes aprovados e dentro da
 * validade, aprovação da equipe e sem suspensão.
 */
export function isCaregiverEligible(
  v: Verifications | undefined,
  opts: { approvedByStaff: boolean; suspended: boolean; today: string },
): boolean {
  const record = v?.antecedentes;
  return (
    isIdentityVerified(v) &&
    record?.status === 'aprovado' &&
    !!record.validUntil &&
    record.validUntil >= opts.today &&
    opts.approvedByStaff &&
    !opts.suspended
  );
}
