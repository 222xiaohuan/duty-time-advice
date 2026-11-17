import { DateTime } from "luxon";
import type { MockIdentity } from "../middleware/mockIdentity";
import type { DtaEmployee, DtaParamGroup, DtaRosterabilityRecord } from "../generated/prisma/client";
import { prisma } from "./prisma";
import { addDays, hkDateOf, hkDateTime, hkNow } from "./time";
import { AppError, ErrorCode } from "./response";
import { allowedRosterabilityStatuses, bad, baselineStatusMessage, parseDate, parseId, parseTime, TENANT_ID } from "./validation";
import { BUSINESS_TIME_ZONE, DtaRosterabilityStatus, DtaSourceCode } from "../types/enums";

export type RecordInput = {
  businessDate: string;
  statusCode: DtaRosterabilityStatus;
  startTime: string;
  endTime: string;
  endDayOffset: number;
  remark: string | null;
};

type RecordLike = Pick<DtaRosterabilityRecord, "businessDate" | "statusCode" | "startTime" | "endTime" | "remark">;

function forbidden(message: string): never {
  throw new AppError(ErrorCode.FORBIDDEN, message, 403);
}

function missing(message: string): never {
  throw new AppError(ErrorCode.NOT_FOUND, message, 404);
}

export async function employeeFor(identity: MockIdentity, empId: number): Promise<DtaEmployee> {
  if (identity.role === "employee" && identity.userId !== empId) forbidden("员工只能维护本人记录");
  const employee = await prisma.dtaEmployee.findFirst({ where: { id: empId, tenantId: TENANT_ID, isDeleted: 0 } });
  if (!employee) missing("员工不存在");
  if (identity.role === "manager" && identity.orgId !== employee.orgId) forbidden("经理只能维护所辖组织员工记录");
  return employee;
}

async function paramFor(employee: DtaEmployee): Promise<DtaParamGroup> {
  const param = await prisma.dtaParamGroup.findFirst({ where: { tenantId: TENANT_ID, orgId: employee.orgId, empTypeCode: employee.empTypeCode, isDeleted: 0 } });
  if (!param) bad("该员工未配置可排性参数");
  return param;
}

export function isLocked(businessDate: string, cutoffDays: number, now: Date = new Date()): boolean {
  const today = hkNow(now).toISODate()!;
  if (businessDate < today) return true;
  return cutoffDays > 0 && businessDate <= addDays(today, cutoffDays - 1);
}

function localTime(value: Date): string {
  return DateTime.fromJSDate(value, { zone: BUSINESS_TIME_ZONE }).toFormat("HH:mm");
}

export function inputFrom(body: Record<string, unknown>, current?: RecordLike): RecordInput {
  const businessDate = parseDate(body.businessDate ?? current?.businessDate, "businessDate");
  const statusCode = body.statusCode ?? current?.statusCode;
  if (statusCode !== DtaRosterabilityStatus.ROSTERABLE && statusCode !== DtaRosterabilityStatus.UNROSTERABLE && statusCode !== DtaRosterabilityStatus.PRIORITY_ROSTERABLE) bad("Demo 仅支持 ROSTERABLE、UNROSTERABLE 和 PRIORITY_ROSTERABLE");
  const startTime = parseTime(body.startTime ?? (current ? localTime(current.startTime) : undefined), "startTime");
  const endTime = parseTime(body.endTime ?? (current ? localTime(current.endTime) : undefined), "endTime");
  const endDayOffset = body.endDayOffset === undefined
    ? current ? (hkDateOf(current.endTime) === current.businessDate ? 0 : 1) : 0
    : body.endDayOffset;
  if (endDayOffset !== 0 && endDayOffset !== 1) bad("endDayOffset 必须为 0 或 1");
  const start = hkDateTime(businessDate, startTime);
  const end = hkDateTime(businessDate, endTime, endDayOffset);
  if (end <= start) bad("结束时间必须晚于开始时间");
  const remarkValue = body.remark === undefined ? current?.remark ?? null : body.remark;
  if (remarkValue !== null && (typeof remarkValue !== "string" || remarkValue.length > 500)) bad("remark 最长 500 个字符");
  return { businessDate, statusCode: statusCode as DtaRosterabilityStatus, startTime, endTime, endDayOffset, remark: remarkValue as string | null };
}

function checkEditable(identity: MockIdentity, param: DtaParamGroup, businessDate: string, now: Date): void {
  if (identity.role === "admin") forbidden("管理员不能维护员工可排性记录");
  if (identity.role === "employee" && param.empEditEnable !== 1) forbidden("该员工类型的自主编辑已关闭");
  if (isLocked(businessDate, param.cutoffDays, now)) forbidden("该业务日期已到报备截止时间，记录只读");
}

async function checkStatus(identity: MockIdentity, statusCode: DtaRosterabilityStatus, param: DtaParamGroup, employee: DtaEmployee): Promise<void> {
  const status = await prisma.dtaRosterabilityStatusDict.findFirst({ where: { tenantId: TENANT_ID, statusCode, enabled: 1, isDeleted: 0 } });
  if (!status) bad("该可排性状态未启用");
  const org = await prisma.dtaOrg.findFirst({ where: { id: employee.orgId, tenantId: TENANT_ID, isDeleted: 0 } });
  if (!org) missing("员工所属组织不存在");
  if (statusCode === DtaRosterabilityStatus.PRIORITY_ROSTERABLE && param.priorityRosterEnable !== 1) forbidden("所属组织与员工类型未启用优先排班模式");
  const baselineMessage = baselineStatusMessage(param.baselineRule, statusCode);
  if (baselineMessage) bad(baselineMessage);
  if (identity.role !== "employee") return;
  if (status.empSelfEdit !== 1) forbidden("该可排性状态不允许员工自主选择");
  if (!allowedRosterabilityStatuses(param.baselineRule, param.submitMode, param.priorityRosterEnable === 1).includes(statusCode)) forbidden("当前参数不允许提报该可排性状态");
}

async function checkShift(empId: number, input: RecordInput): Promise<void> {
  if (input.statusCode !== DtaRosterabilityStatus.UNROSTERABLE) return;
  const shift = await prisma.dtaMockShift.findFirst({ where: { tenantId: TENANT_ID, empId, businessDate: input.businessDate, durationMinutes: { gt: 0 }, isDeleted: 0 } });
  if (shift) throw new AppError(ErrorCode.CONFLICT, "该员工当日已存在工作班次，不能调整为不可排。", 409);
}

async function checkDuplicate(empId: number, input: RecordInput, excludeId?: number): Promise<void> {
  const existing = await prisma.dtaRosterabilityRecord.findFirst({ where: {
    tenantId: TENANT_ID, empId, businessDate: input.businessDate, statusCode: input.statusCode,
    startTime: hkDateTime(input.businessDate, input.startTime), endTime: hkDateTime(input.businessDate, input.endTime, input.endDayOffset),
    isDeleted: 0, ...(excludeId ? { NOT: { id: excludeId } } : {}),
  } });
  if (existing) throw new AppError(ErrorCode.CONFLICT, "该时段已存在相同可排性记录", 409);
}

export async function createRecord(identity: MockIdentity, empId: number, body: Record<string, unknown>, now: Date = new Date()) {
  const employee = await employeeFor(identity, empId);
  const param = await paramFor(employee);
  const input = inputFrom(body);
  checkEditable(identity, param, input.businessDate, now);
  await checkStatus(identity, input.statusCode, param, employee);
  await checkShift(empId, input);
  await checkDuplicate(empId, input);
  return prisma.dtaRosterabilityRecord.create({ data: {
    tenantId: TENANT_ID, orgId: employee.orgId, empId, empTypeCode: employee.empTypeCode,
    businessDate: input.businessDate, statusCode: input.statusCode,
    sourceCode: identity.role === "employee" ? DtaSourceCode.EMP_SUBMIT : DtaSourceCode.MGR_MAINTENANCE,
    startTime: hkDateTime(input.businessDate, input.startTime), endTime: hkDateTime(input.businessDate, input.endTime, input.endDayOffset),
    remark: input.remark, createdBy: identity.userId, updatedBy: identity.userId,
  } });
}

export async function recordFor(identity: MockIdentity, id: number) {
  const record = await prisma.dtaRosterabilityRecord.findFirst({ where: { id, tenantId: TENANT_ID, isDeleted: 0 } });
  if (!record) missing("可排性记录不存在");
  await employeeFor(identity, record.empId);
  return record;
}

function assertManualSource(record: DtaRosterabilityRecord): void {
  if (record.sourceCode === DtaSourceCode.EXTERNAL_SYNC || record.sourceCode === DtaSourceCode.BULK_IMPORT) forbidden("该来源的记录只读");
}

export async function updateRecord(identity: MockIdentity, id: number, body: Record<string, unknown>, now: Date = new Date()) {
  const record = await recordFor(identity, id);
  assertManualSource(record);
  if (body.empId !== undefined && parseId(body.empId, "empId") !== record.empId) bad("不能更改记录所属员工");
  const employee = await employeeFor(identity, record.empId);
  const param = await paramFor(employee);
  checkEditable(identity, param, record.businessDate, now);
  const input = inputFrom(body, record);
  if (record.templateItemId !== null && input.businessDate !== record.businessDate) bad("模板生成记录不能更改业务日期");
  checkEditable(identity, param, input.businessDate, now);
  await checkStatus(identity, input.statusCode, param, employee);
  await checkShift(record.empId, input);
  await checkDuplicate(record.empId, input, id);
  try {
    return await prisma.dtaRosterabilityRecord.update({ where: { id }, data: {
      businessDate: input.businessDate, statusCode: input.statusCode,
      sourceCode: identity.role === "employee" ? DtaSourceCode.EMP_SUBMIT : DtaSourceCode.MGR_MAINTENANCE,
      startTime: hkDateTime(input.businessDate, input.startTime), endTime: hkDateTime(input.businessDate, input.endTime, input.endDayOffset),
      remark: input.remark, updatedBy: identity.userId,
    } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new AppError(ErrorCode.CONFLICT, "该模板时段已存在记录", 409);
    }
    throw error;
  }
}

export async function deleteRecord(identity: MockIdentity, id: number, now: Date = new Date()) {
  const record = await recordFor(identity, id);
  assertManualSource(record);
  const employee = await employeeFor(identity, record.empId);
  const param = await paramFor(employee);
  checkEditable(identity, param, record.businessDate, now);
  return prisma.dtaRosterabilityRecord.update({ where: { id }, data: { isDeleted: 1, updatedBy: identity.userId } });
}

export async function listRecords(identity: MockIdentity, filters: { empId?: number; orgId?: number; from?: string; to?: string }) {
  if (identity.role === "employee" && filters.empId !== undefined && filters.empId !== identity.userId) forbidden("员工只能查看本人记录");
  if (identity.role === "manager" && filters.orgId !== undefined && filters.orgId !== identity.orgId) forbidden("经理只能查看所辖组织记录");
  if (filters.empId !== undefined) await employeeFor(identity, filters.empId);
  if (filters.from && filters.to && filters.from > filters.to) bad("from 不得晚于 to");
  const rows = await prisma.dtaRosterabilityRecord.findMany({ where: {
    tenantId: TENANT_ID, isDeleted: 0,
    ...(identity.role === "employee" ? { empId: identity.userId } : {}),
    ...(identity.role === "manager" ? { orgId: identity.orgId! } : {}),
    ...(filters.empId ? { empId: filters.empId } : {}),
    ...(filters.orgId ? { orgId: filters.orgId } : {}),
    ...((filters.from || filters.to) ? { businessDate: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
  }, orderBy: [{ businessDate: "asc" }, { startTime: "asc" }, { id: "asc" }] });
  const params = await prisma.dtaParamGroup.findMany({ where: { tenantId: TENANT_ID, isDeleted: 0 } });
  return rows.map((row) => ({ ...row, locked: isLocked(row.businessDate, params.find((param) => param.orgId === row.orgId && param.empTypeCode === row.empTypeCode)?.cutoffDays ?? 30) ? 1 : 0 }));
}

export async function detailRecord(identity: MockIdentity, id: number) {
  const record = await recordFor(identity, id);
  const employee = await employeeFor(identity, record.empId);
  const param = await prisma.dtaParamGroup.findFirst({ where: { tenantId: TENANT_ID, orgId: employee.orgId, empTypeCode: employee.empTypeCode, isDeleted: 0 } });
  return { ...record, locked: !param || isLocked(record.businessDate, param.cutoffDays) ? 1 : 0 };
}

export function copyInput(source: DtaRosterabilityRecord, targetDate: string): Record<string, unknown> {
  return {
    businessDate: targetDate,
    statusCode: source.statusCode,
    startTime: DateTime.fromJSDate(source.startTime, { zone: BUSINESS_TIME_ZONE }).toFormat("HH:mm"),
    endTime: DateTime.fromJSDate(source.endTime, { zone: BUSINESS_TIME_ZONE }).toFormat("HH:mm"),
    endDayOffset: hkDateOf(source.endTime) === source.businessDate ? 0 : 1,
    remark: source.remark,
  };
}

export function weekStart(now: Date = new Date()): string {
  return hkNow(now).startOf("week").toISODate()!;
}

export { addDays };
