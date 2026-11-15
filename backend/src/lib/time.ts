import { DateTime } from "luxon";
import { BUSINESS_TIME_ZONE } from "../types/enums";

/** 香港时间的当前时刻 */
export function hkNow(now: Date = new Date()): DateTime {
  return DateTime.fromJSDate(now, { zone: BUSINESS_TIME_ZONE });
}

/** 香港时间的今日，格式 YYYY-MM-DD */
export function hkToday(now: Date = new Date()): string {
  return hkNow(now).toISODate()!;
}

/** 将业务日期加减自然日 */
export function addDays(businessDate: string, days: number): string {
  return DateTime.fromISO(businessDate, { zone: BUSINESS_TIME_ZONE }).plus({ days }).toISODate()!;
}

/**
 * 将香港时间的“业务日期 + HH:mm (+ 跨日偏移)”转换为 UTC 时刻。
 * 例：hkDateTime("2026-11-20", "22:00") → 2026-11-20T14:00:00.000Z
 */
export function hkDateTime(businessDate: string, time: string, dayOffset = 0): Date {
  const dt = DateTime.fromISO(`${businessDate}T${time}`, { zone: BUSINESS_TIME_ZONE });
  if (!dt.isValid) throw new Error(`无效的日期或时间：${businessDate} ${time}`);
  return dt.plus({ days: dayOffset }).toJSDate();
}

/** 时刻对应的香港业务日期 */
export function hkDateOf(instant: Date): string {
  return DateTime.fromJSDate(instant, { zone: BUSINESS_TIME_ZONE }).toISODate()!;
}
