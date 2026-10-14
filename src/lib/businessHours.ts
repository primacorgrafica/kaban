/**
 * Business hours calculator da Primacor Gráfica.
 * Regras Operacionais e Confiabilidade (Fase 5):
 * 1. Janela de Produção: Segunda a Sexta, das 07:00 às 19:00 (12h úteis por dia de trabalho).
 * 2. Referência Temporal Oficial: sincronização com o relógio do servidor (PostgreSQL UTC)
 *    para evitar que relógios locais desregulados calculem SLA ou atrasos incorretos.
 * 3. Finais de semana (Sábado e Domingo) e horas fora do turno são estritamente congelados.
 */

const WORK_START_HOUR = 7;
const WORK_END_HOUR = 19;
export const WORK_MS_PER_DAY = (WORK_END_HOUR - WORK_START_HOUR) * 3600000; // 12h = 43.200.000 ms

// Offset de tempo entre servidor e cliente (calibrado na primeira requisição)
let serverTimeOffsetMs = 0;

/**
 * Calibra a diferença entre o relógio local do navegador e o servidor PostgreSQL.
 * @param serverIsoDate Data ISO retornada pelo servidor (ex: created_at ou now() via DB)
 */
export function syncServerTimeOffset(serverIsoDate: string | Date | number): void {
  const serverTimestamp = new Date(serverIsoDate).getTime();
  const localTimestamp = Date.now();
  serverTimeOffsetMs = serverTimestamp - localTimestamp;
}

/**
 * Retorna o Date atual ajustado com a hora do servidor.
 */
export function getOfficialServerDate(): Date {
  return new Date(Date.now() + serverTimeOffsetMs);
}

export function isWorkday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5; // Segunda a Sexta
}

function getWorkMsInDay(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(WORK_START_HOUR, 0, 0, 0);
  const end = new Date(date);
  end.setHours(WORK_END_HOUR, 0, 0, 0);
  return { start, end };
}

/**
 * Retorna o total de milissegundos úteis decorridos entre `from` e `to`.
 * Se `to` for omitido, utiliza o horário oficial atual calibrado com o servidor.
 */
export function businessHoursMs(
  from: Date | string | number,
  to?: Date | string | number
): number {
  const start = new Date(from);
  const end = to !== undefined ? new Date(to) : getOfficialServerDate();

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return 0;
  }

  let totalMs = 0;
  const current = new Date(start);

  while (current < end) {
    if (isWorkday(current)) {
      const { start: dayStart, end: dayEnd } = getWorkMsInDay(current);
      const effectiveStart = current > dayStart ? current : dayStart;
      const effectiveEnd = end < dayEnd ? end : dayEnd;

      if (effectiveStart < effectiveEnd) {
        totalMs += effectiveEnd.getTime() - effectiveStart.getTime();
      }
    }

    // Avança para o início do próximo dia
    current.setDate(current.getDate() + 1);
    current.setHours(WORK_START_HOUR, 0, 0, 0);
  }

  return totalMs;
}

/**
 * Verifica se um prazo limite expirou em relação ao horário oficial de trabalho.
 */
export function isDeadlinePastBusinessHours(deadline: string | Date): boolean {
  const now = getOfficialServerDate();
  const dl = new Date(deadline);
  if (isNaN(dl.getTime())) return false;
  return now > dl;
}

/**
 * Formata duração em milissegundos para string amigável (ex: "2h 45min" ou "18min")
 */
export function formatBusinessDuration(ms: number): string {
  if (ms <= 0) return "0min";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}
