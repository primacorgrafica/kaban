/**
 * Business hours calculator: 7h-19h (12h/day), Monday-Friday.
 * Calculates elapsed business-hours milliseconds between two timestamps.
 */

const WORK_START_HOUR = 7;
const WORK_END_HOUR = 19;
const WORK_MS_PER_DAY = (WORK_END_HOUR - WORK_START_HOUR) * 3600000; // 12h in ms

function isWorkday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5; // Mon-Fri
}

function clampToWorkHours(date: Date): Date {
  const d = new Date(date);
  if (d.getHours() < WORK_START_HOUR) {
    d.setHours(WORK_START_HOUR, 0, 0, 0);
  } else if (d.getHours() >= WORK_END_HOUR) {
    d.setHours(WORK_END_HOUR, 0, 0, 0);
  }
  return d;
}

function getWorkMsInDay(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(WORK_START_HOUR, 0, 0, 0);
  const end = new Date(date);
  end.setHours(WORK_END_HOUR, 0, 0, 0);
  return { start, end };
}

/**
 * Returns elapsed business-hours milliseconds between `from` and `to`.
 */
export function businessHoursMs(from: Date | string | number, to: Date | string | number): number {
  let start = new Date(from);
  let end = new Date(to);

  if (start >= end) return 0;

  let totalMs = 0;

  // Iterate day by day
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

    // Move to next day at work start
    current.setDate(current.getDate() + 1);
    current.setHours(WORK_START_HOUR, 0, 0, 0);
  }

  return totalMs;
}

/**
 * Checks if a deadline has passed in business hours terms.
 * Returns true if current business time is past the deadline.
 */
export function isDeadlinePastBusinessHours(deadline: string | Date): boolean {
  const now = new Date();
  const dl = new Date(deadline);
  return now > dl;
}
