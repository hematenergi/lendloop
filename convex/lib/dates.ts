const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function todayISO(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function isValidDateRange(start: string, end: string): boolean {
  return isISODate(start) && isISODate(end) && end >= start;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function daysBetween(a: string, b: string): number {
  const start = new Date(`${a}T00:00:00.000Z`).getTime();
  const end = new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.floor((end - start) / 86_400_000);
}
