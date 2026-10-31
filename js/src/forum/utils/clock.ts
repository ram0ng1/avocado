import app from 'flarum/forum/app';
import { formatDate } from '../utils';

/**
 * Formato de relógio do tema, 12h (2:30 PM) ou 24h (14:30): setting do admin
 * (avocado.clock_format), com 'auto' seguindo o locale do visitante. O seletor
 * de lembrete é um controle próprio porque o `datetime-local` nativo segue o
 * formato do navegador, sem como pedir 24h.
 */
export type ClockFormat = '12' | '24';

const CLOCK_FORMAT_ATTRIBUTE = 'avocadoClockFormat';
const CLOCK_FORMAT_AUTO = 'auto';

/** Ciclo de 0–23 do Intl. Ver buildIntlHourOptions. */
const HOUR_CYCLE_24 = 'h23';

export function resolveClockFormat(): ClockFormat {
  const configured = String(app.forum?.attribute?.(CLOCK_FORMAT_ATTRIBUTE) || CLOCK_FORMAT_AUTO);
  if (configured === '12' || configured === '24') return configured;

  return browserUses24HourClock() ? '24' : '12';
}

export function is24HourClock(): boolean {
  return resolveClockFormat() === '24';
}

/**
 * Opções de hora do Intl no formato resolvido. Em 24h passamos `hourCycle` em
 * vez de `hour12: false` — este último faz alguns navegadores escreverem
 * "24:15" para 00:15.
 */
export function buildIntlHourOptions(): Intl.DateTimeFormatOptions {
  return is24HourClock() ? ({ hourCycle: HOUR_CYCLE_24 } as Intl.DateTimeFormatOptions) : { hour12: true };
}

/** `07 ago, 14:30` / `07 Aug, 2:30 PM` — usado no meta do card salvo. */
export function formatDateTime(date: Date): string {
  return formatDate(date, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...buildIntlHourOptions(),
  });
}

/** O que o locale do navegador faria por conta própria. */
function browserUses24HourClock(): boolean {
  const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions() as {
    hour12?: boolean;
    hourCycle?: string;
  };

  if (typeof resolved.hour12 === 'boolean') return !resolved.hour12;

  return resolved.hourCycle === HOUR_CYCLE_24 || resolved.hourCycle === 'h24';
}
