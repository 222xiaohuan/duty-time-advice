import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError, ErrorCode, ok } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";
import { assertEmployeeAccess, assertOrgAccess } from "../lib/access";
import { bad, parseDate, parseId, parseTime, TENANT_ID } from "../lib/validation";
import { hkDateOf, hkDateTime } from "../lib/time";
import { DtaRosterabilityStatus } from "../types/enums";

export const mockShiftsRouter = Router();

function timeOf(value: Date): string {
  const iso = value.toISOString();
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

async function employeeOf(empId: number) {
  const employee = await prisma.dtaEmployee.findFirst({ where: { id: empId, tenantId: TENANT_ID, isDeleted: 0 } });
  if (!employee) throw new AppError(40400, "员工不存在", 404);
  return employee;
}

function shiftValues(input: Record<string, unknown>, current?: { businessDate: string; shiftName: string; startTime: Date; endTime: Date }) {
  const businessDate = parseDate(input.businessDate ?? current?.businessDate, "businessDate");
  const shiftName = String(input.shiftName ?? current?.shiftName ?? "").trim();
  if (!shiftName) bad("shiftName 不能为空");
  const startTime = parseTime(input.startTime ?? (current ? timeOf(current.startTime) : undefined), "startTime");
  const endTime = parseTime(input.endTime ?? (current ? timeOf(current.endTime) : undefined), "endTime");
  const endDayOffset = input.endDayOffset === undefined ? (current && hkDateOf(current.endTime) !== businessDate ? 1 : 0) : Number(input.endDayOffset);
  if (!Number.isInteger(endDayOffset) || (endDayOffset !== 0 && endDayOffset !== 1)) bad("endDayOffset 必须为 0 或 1");
  const start = hkDateTime(businessDate, startTime);
  const end = hkDateTime(businessDate, endTime, endDayOffset);
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (durationMinutes < 0) bad("班次结束时间必须晚于开始时间");
  if (input.durationMinutes !== undefined && (!Number.isInteger(input.durationMinutes) || Number(input.durationMinutes) < 0 || Number(input.durationMinutes) !== durationMinutes)) bad("durationMinutes 必须为非负整数且与时间区间一致");
  return { businessDate, shiftName, startTime: start, endTime: end, durationMinutes };
}

async function assertRosterabilityAvailable(empId: number, values: { startTime: Date; endTime: Date; durationMinutes: number }): Promise<void> {
  // Zero-length placeholders do not occupy a scheduling interval.
  if (values.durationMinutes <= 0) return;
  const conflict = await prisma.dtaRosterabilityRecord.findFirst({ where: {
    tenantId: TENANT_ID,
    empId,
    statusCode: DtaRosterabilityStatus.UNROSTERABLE,
    isDeleted: 0,
    startTime: { lt: values.endTime },
    endTime: { gt: values.startTime },
  }, select: { businessDate: true, startTime: true, endTime: true } });
  if (conflict) {
    throw new AppError(ErrorCode.CONFLICT, "该班次与员工不可排时间段冲突，不能排入。", 409);
  }
}

mockShiftsRouter.get("/", async (req, res, next) => {
  try {
    const identity = req.identity!;
    const empId = req.query.empId === undefined ? undefined : parseId(req.query.empId, "empId");
    if (empId !== undefined) assertEmployeeAccess(req, empId);
    const orgId = req.query.orgId === undefined ? undefined : parseId(req.query.orgId, "orgId");
    if (orgId !== undefined) assertOrgAccess(req, orgId);
    // assertOrgAccess 已按主管的完整组织权限范围校验当前查询组织。
    const rows = await prisma.dtaMockShift.findMany({ where: { tenantId: TENANT_ID, isDeleted: 0, ...(empId ? { empId } : {}), ...(orgId ? { orgId } : {}), ...(identity.role === "employee" ? { empId: identity.userId } : {}), ...(identity.role === "manager" ? { orgId: identity.orgId! } : {}) }, orderBy: [{ businessDate: "asc" }, { startTime: "asc" }] });
    ok(res, rows);
  } catch (error) { next(error); }
});

mockShiftsRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.dtaMockShift.findFirst({ where: { id: parseId(req.params.id, "id"), tenantId: TENANT_ID, isDeleted: 0 } });
    if (!row) throw new AppError(40400, "模拟班次不存在", 404);
    assertEmployeeAccess(req, row.empId);
    assertOrgAccess(req, row.orgId);
    ok(res, row);
  } catch (error) { next(error); }
});

mockShiftsRouter.post("/", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const empId = parseId(req.body.empId, "empId");
    const employee = await employeeOf(empId);
    assertOrgAccess(req, employee.orgId);
    const values = shiftValues(req.body as Record<string, unknown>);
    await assertRosterabilityAvailable(empId, values);
    const created = await prisma.dtaMockShift.create({ data: { tenantId: TENANT_ID, orgId: employee.orgId, empId, ...values, createdBy: req.identity!.userId, updatedBy: req.identity!.userId } });
    ok(res, created, "模拟班次已创建");
  } catch (error) { next(error); }
});

mockShiftsRouter.patch("/:id", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "id");
    const current = await prisma.dtaMockShift.findFirst({ where: { id, tenantId: TENANT_ID, isDeleted: 0 } });
    if (!current) throw new AppError(40400, "模拟班次不存在", 404);
    assertOrgAccess(req, current.orgId);
    const empId = req.body.empId === undefined ? current.empId : parseId(req.body.empId, "empId");
    const employee = await employeeOf(empId);
    assertOrgAccess(req, employee.orgId);
    const values = shiftValues(req.body as Record<string, unknown>, current);
    await assertRosterabilityAvailable(empId, values);
    const updated = await prisma.dtaMockShift.update({ where: { id }, data: { orgId: employee.orgId, empId, ...values, updatedBy: req.identity!.userId } });
    ok(res, updated, "模拟班次已更新");
  } catch (error) { next(error); }
});

mockShiftsRouter.delete("/:id", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "id");
    const current = await prisma.dtaMockShift.findFirst({ where: { id, tenantId: TENANT_ID, isDeleted: 0 } });
    if (!current) throw new AppError(40400, "模拟班次不存在", 404);
    assertOrgAccess(req, current.orgId);
    const deleted = await prisma.dtaMockShift.update({ where: { id }, data: { isDeleted: 1, updatedBy: req.identity!.userId } });
    ok(res, deleted, "模拟班次已删除");
  } catch (error) { next(error); }
});
