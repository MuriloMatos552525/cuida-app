import type { BookingStatus, ServiceCategory } from '@shared/models';
import { TIME_ZONE } from '@shared/pricing';

import { categoryInfo } from './theme';

export { brl } from '@shared/pricing';

const dayFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, weekday: 'short', day: '2-digit', month: 'short' });
const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });

/** "sáb., 10 de out." */
export const formatDay = (iso: string | Date) => dayFormat.format(new Date(iso));
/** "14:00" */
export const formatTime = (iso: string | Date) => timeFormat.format(new Date(iso));
/** "sáb., 10 de out. · 14:00–18:00" */
export function formatRange(start: string, end: string) {
  const sameDay = formatDay(start) === formatDay(end);
  return sameDay
    ? `${formatDay(start)} · ${formatTime(start)}–${formatTime(end)}`
    : `${formatDay(start)} ${formatTime(start)} até ${formatDay(end)} ${formatTime(end)}`;
}

export function dependentsLabel(category: ServiceCategory, n: number) {
  const [one, many] = categoryInfo[category].dependent;
  return `${n} ${n === 1 ? one : many}`;
}

export const statusLabel: Record<BookingStatus, string> = {
  solicitada: 'Aguardando o cuidador',
  aceita: 'Confirmada',
  a_caminho: 'A caminho',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  avaliada: 'Concluída',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
  em_disputa: 'Em análise pelo suporte',
};

export const surchargeLabel = { noturno: 'Adicional noturno', fim_de_semana: 'Adicional de fim de semana', feriado: 'Adicional de feriado' };

export const firstName = (name: string) => name.split(' ')[0];
