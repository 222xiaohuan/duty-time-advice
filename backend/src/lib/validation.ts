import { AppError, ErrorCode } from "./response";
import {
  DtaBaselineRule,
  DtaConflictCheckMode,
  DtaSubmitMode,
  EMP_TYPE_CODES,
} from "../types/enums";

export const TENANT_ID = 1;

export function bad(message: string): never {
  throw new AppError(ErrorCode.BAD_REQUEST, message, 400);
}

export function parseId(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value) && Number(value) > 0) return Number(value);
  return bad(`${field} 必须是正整数`);
}

export function parseFlag(value: unknown, field: string, defaultValue?: number): number {
  if (value === undefined && defaultValue !== undefined) return defaultValue;
  if (value === 0 || value === 1) return value;
  if (value === "0" || value === "1") return Number(value);
  return bad(`${field} 必须为 0 或 1`);
}

export function parseDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return bad(`${field} 必须为 YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return bad(`${field} 不是合法日期`);
  return value;
}

export function parseTime(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return bad(`${field} 必须为 HH:mm`);
  return value;
}

export function parseEnum<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value === "string" && values.includes(value as T)) return value as T;
  return bad(`${field} 不是合法编码`);
}

export function validateParamValues(input: Record<string, unknown>): void {
  const cutoffDays = input.cutoffDays;
  if (!Number.isInteger(cutoffDays) || (cutoffDays as number) < 0 || (cutoffDays as number) > 30) bad("cutoffDays 必须为 0 至 30 的整数");
  const baselineRule = parseEnum(input.baselineRule, Object.values(DtaBaselineRule), "baselineRule");
  const submitMode = parseEnum(input.submitMode, Object.values(DtaSubmitMode), "submitMode");
  const allowed: DtaSubmitMode[] = baselineRule === DtaBaselineRule.BASE_ROSTERABLE
    ? [DtaSubmitMode.MODE_ONLY_UNROSTERABLE, DtaSubmitMode.MODE_ALL_STATUS, DtaSubmitMode.MODE_NO_SUBMIT]
    : [DtaSubmitMode.MODE_ONLY_ROSTERABLE, DtaSubmitMode.MODE_ALL_STATUS, DtaSubmitMode.MODE_NO_SUBMIT];
  if (!allowed.includes(submitMode)) bad("baselineRule 与 submitMode 组合不合法");
  parseFlag(input.empEditEnable, "empEditEnable");
  const autoEnabled = parseFlag(input.templateAutoGenEnable, "templateAutoGenEnable");
  if (autoEnabled === 1) {
    if (!Number.isInteger(input.autoGenRangeWeek) || (input.autoGenRangeWeek as number) < 1 || (input.autoGenRangeWeek as number) > 10) bad("autoGenRangeWeek 必须为 1 至 10 的整数");
    if (!Number.isInteger(input.autoGenWeekday) || (input.autoGenWeekday as number) < 1 || (input.autoGenWeekday as number) > 7) bad("autoGenWeekday 必须为 1 至 7 的整数");
    parseTime(input.autoGenTime, "autoGenTime");
  } else if (input.autoGenRangeWeek !== null && input.autoGenRangeWeek !== undefined) {
    if (!Number.isInteger(input.autoGenRangeWeek) || (input.autoGenRangeWeek as number) < 1 || (input.autoGenRangeWeek as number) > 10) bad("autoGenRangeWeek 必须为 1 至 10 的整数或 null");
  }
  if (input.autoGenWeekday !== null && input.autoGenWeekday !== undefined && (!Number.isInteger(input.autoGenWeekday) || (input.autoGenWeekday as number) < 1 || (input.autoGenWeekday as number) > 7)) bad("autoGenWeekday 必须为 1 至 7 的整数或 null");
  if (input.autoGenTime !== null && input.autoGenTime !== undefined) parseTime(input.autoGenTime, "autoGenTime");
  const conflict = input.conflictCheckMode ?? DtaConflictCheckMode.STRONG_BLOCK;
  if (conflict !== DtaConflictCheckMode.STRONG_BLOCK) bad("Demo 仅支持 STRONG_BLOCK");
  for (const field of ["fieldSiteEnable", "enableApproval", "specialTagDiffEnable"]) {
    if (parseFlag(input[field], field, 0) !== 0) bad(`${field} 在 Demo 中必须为 0`);
  }
}

export function isEmployeeType(value: unknown): value is string {
  return value === EMP_TYPE_CODES.FULL_TIME || value === EMP_TYPE_CODES.PART_TIME;
}
