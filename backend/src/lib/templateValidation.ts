import { bad, isEmployeeType, parseDate, parseFlag, parseId, parseTime } from "./validation";
import { DtaRosterabilityStatus, POST_CODES } from "../types/enums";

type TemplateFields = { templateName: string; nameI18n: string | null; startDate: string; endDate: string | null; enabled: number };
type ItemFields = { weekday: number; statusCode: DtaRosterabilityStatus; startTime: string; endTime: string; endDayOffset: number; remark: string | null; siteCode: string | null };
type ConditionFields = { priority: number; orgId: number | null; empTypeCode: string | null; postCode: string | null };

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) bad(`${field} 必须为 1 至 ${max} 个字符`);
  return value.trim();
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > max) bad(`${field} 最长 ${max} 个字符`);
  return value;
}

export function templateFields(body: Record<string, unknown>, current?: TemplateFields): TemplateFields {
  const templateName = text(body.templateName ?? current?.templateName, "templateName", 100);
  const nameI18n = optionalText(body.nameI18n === undefined ? current?.nameI18n : body.nameI18n, "nameI18n", 200);
  const startDate = parseDate(body.startDate ?? current?.startDate, "startDate");
  const endDate = body.endDate === undefined ? current?.endDate ?? null : body.endDate === null ? null : parseDate(body.endDate, "endDate");
  if (endDate !== null && endDate < startDate) bad("endDate 不得早于 startDate");
  const enabled = parseFlag(body.enabled, "enabled", current?.enabled ?? 1);
  return { templateName, nameI18n, startDate, endDate, enabled };
}

export function itemFields(body: Record<string, unknown>, current?: ItemFields): ItemFields {
  const weekday = body.weekday === undefined ? current?.weekday : body.weekday;
  if (!Number.isInteger(weekday) || Number(weekday) < 1 || Number(weekday) > 7) bad("weekday 必须为 1 至 7 的整数");
  const statusCode = body.statusCode ?? current?.statusCode;
  if (statusCode !== DtaRosterabilityStatus.ROSTERABLE && statusCode !== DtaRosterabilityStatus.UNROSTERABLE && statusCode !== DtaRosterabilityStatus.PRIORITY_ROSTERABLE) bad("Demo 仅支持 ROSTERABLE、UNROSTERABLE 和 PRIORITY_ROSTERABLE");
  const startTime = parseTime(body.startTime ?? current?.startTime, "startTime");
  const endTime = parseTime(body.endTime ?? current?.endTime, "endTime");
  const endDayOffset = body.endDayOffset === undefined ? current?.endDayOffset ?? 0 : body.endDayOffset;
  if (endDayOffset !== 0 && endDayOffset !== 1) bad("endDayOffset 必须为 0 或 1");
  if (endDayOffset === 0 && endTime <= startTime) bad("同日结束时间必须晚于开始时间");
  const remark = optionalText(body.remark === undefined ? current?.remark : body.remark, "remark", 500);
  const siteCode = body.siteCode === undefined ? current?.siteCode ?? null : body.siteCode;
  if (siteCode !== null) bad("Demo 不配置场地");
  return { weekday: weekday as number, statusCode: statusCode as DtaRosterabilityStatus, startTime, endTime, endDayOffset, remark, siteCode: null };
}

export function conditionFields(body: Record<string, unknown>, current?: ConditionFields): ConditionFields {
  const priority = body.priority === undefined ? current?.priority : body.priority;
  if (!Number.isInteger(priority) || Number(priority) < 0) bad("priority 必须为非负整数");
  const orgIdValue = body.orgId === undefined ? current?.orgId ?? null : body.orgId;
  const orgId = orgIdValue === null ? null : parseId(orgIdValue, "orgId");
  const empTypeCode = body.empTypeCode === undefined ? current?.empTypeCode ?? null : body.empTypeCode;
  if (empTypeCode !== null && !isEmployeeType(empTypeCode)) bad("empTypeCode 不是 Demo 支持的员工类型");
  const postCode = body.postCode === undefined ? current?.postCode ?? null : body.postCode;
  if (postCode !== null && !Object.values(POST_CODES).includes(postCode as typeof POST_CODES[keyof typeof POST_CODES])) bad("postCode 不是 Demo 支持的岗位");
  if (orgId === null && empTypeCode === null && postCode === null) bad("模板条件至少填写组织、员工类型或岗位之一");
  return { priority: priority as number, orgId, empTypeCode: empTypeCode as string | null, postCode: postCode as string | null };
}
