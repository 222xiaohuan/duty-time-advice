const DAY_MS = 86400000;

export function hkToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
}

export function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -(weekday === 0 ? 7 : weekday) + 1);
}

export function dayLocked(day: string, cutoffDays: number): boolean {
  const today = hkToday();
  if (day < today) return true;
  return cutoffDays > 0 && day <= addDays(today, cutoffDays - 1);
}

export function managerLockMessage(day: string, cutoffDays: number | null): string | null {
  if (day < hkToday()) return "无法修改过去日期的可排时间";
  if (cutoffDays !== null && dayLocked(day, cutoffDays)) return "已提前锁定可排时间";
  return null;
}

export function hkTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function hkDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function shortDay(day: string): string {
  return new Intl.DateTimeFormat("zh-HK", { timeZone: "UTC", month: "numeric", day: "numeric" }).format(new Date(`${day}T00:00:00Z`));
}
