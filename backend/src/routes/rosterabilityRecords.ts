import { Router } from "express";
import type { Request } from "express";
import { prisma } from "../lib/prisma";
import { AppError, ErrorCode, ok } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";
import { addDays, copyInput, createRecord, deleteRecord, detailRecord, employeeFor, listRecords, updateRecord, weekStart } from "../lib/rosterabilityRecords";
import { bad, parseDate, parseId, TENANT_ID } from "../lib/validation";
import { DtaSourceCode } from "../types/enums";

export const rosterabilityRecordsRouter = Router();

function bodyOf(req: Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) bad("请求体必须为对象");
  return req.body as Record<string, unknown>;
}

function targetEmployee(req: Request, body: Record<string, unknown>): number {
  if (req.identity?.role === "employee" && body.empId === undefined) return req.identity.userId;
  return parseId(body.empId, "empId");
}

function rejectReserved(body: Record<string, unknown>): void {
  for (const field of ["sourceCode", "templateId", "templateItemId", "locked", "siteCode", "approvalStatus", "approverId", "approvedAt", "externalSyncId", "isDeleted"]) {
    if (body[field] !== undefined) bad(`${field} 不能由客户端维护`);
  }
}

function resultOf(error: unknown, businessDate: unknown, sourceId: number | null = null) {
  if (error instanceof AppError) return { businessDate, sourceId, success: false, code: error.code, message: error.message };
  throw error;
}

rosterabilityRecordsRouter.get("/", requireRole("admin", "manager", "employee"), async (req, res, next) => {
  try {
    const empId = req.query.empId === undefined ? undefined : parseId(req.query.empId, "empId");
    const orgId = req.query.orgId === undefined ? undefined : parseId(req.query.orgId, "orgId");
    const from = req.query.from === undefined ? undefined : parseDate(req.query.from, "from");
    const to = req.query.to === undefined ? undefined : parseDate(req.query.to, "to");
    ok(res, await listRecords(req.identity!, { empId, orgId, from, to }));
  } catch (error) { next(error); }
});

rosterabilityRecordsRouter.get("/:id", requireRole("admin", "manager", "employee"), async (req, res, next) => {
  try { ok(res, await detailRecord(req.identity!, parseId(req.params.id, "id"))); }
  catch (error) { next(error); }
});

rosterabilityRecordsRouter.post("/", requireRole("manager", "employee"), async (req, res, next) => {
  try {
    const body = bodyOf(req);
    rejectReserved(body);
    const row = await createRecord(req.identity!, targetEmployee(req, body), body);
    ok(res, row, "可排性记录已创建");
  } catch (error) { next(error); }
});

rosterabilityRecordsRouter.patch("/:id", requireRole("manager", "employee"), async (req, res, next) => {
  try {
    const body = bodyOf(req);
    rejectReserved(body);
    const row = await updateRecord(req.identity!, parseId(req.params.id, "id"), body);
    ok(res, row, "可排性记录已更新");
  } catch (error) { next(error); }
});

rosterabilityRecordsRouter.delete("/:id", requireRole("manager", "employee"), async (req, res, next) => {
  try { ok(res, await deleteRecord(req.identity!, parseId(req.params.id, "id")), "可排性记录已删除"); }
  catch (error) { next(error); }
});

async function copyWeek(req: Request, res: Parameters<typeof ok>[0], next: (error: unknown) => void, direction: "previous" | "next") {
  try {
    const body = bodyOf(req);
    const empId = targetEmployee(req, body);
    await employeeFor(req.identity!, empId);
    const monday = weekStart();
    const sourceMonday = direction === "previous" ? addDays(monday, -7) : monday;
    const sourceSunday = addDays(sourceMonday, 6);
    const rows = await prisma.dtaRosterabilityRecord.findMany({ where: {
      tenantId: TENANT_ID, empId, isDeleted: 0,
      businessDate: { gte: sourceMonday, lte: sourceSunday },
    }, orderBy: [{ businessDate: "asc" }, { startTime: "asc" }, { id: "asc" }] });
    const results = [];
    for (const source of rows) {
      const targetDate = addDays(source.businessDate, 7);
      try {
        if (source.sourceCode === DtaSourceCode.EXTERNAL_SYNC || source.sourceCode === DtaSourceCode.BULK_IMPORT) {
          throw new AppError(ErrorCode.FORBIDDEN, "该来源的记录不能复制", 403);
        }
        const created = await createRecord(req.identity!, empId, copyInput(source, targetDate));
        results.push({ businessDate: targetDate, sourceId: source.id, success: true, recordId: created.id });
      } catch (error) {
        results.push(resultOf(error, targetDate, source.id));
      }
    }
    ok(res, { empId, sourceMonday, targetMonday: addDays(sourceMonday, 7), created: results.filter((row) => row.success).length, failed: results.filter((row) => !row.success).length, results }, "复制完成");
  } catch (error) { next(error); }
}

rosterabilityRecordsRouter.post("/batch/copy-previous-week", requireRole("manager", "employee"), (req, res, next) => {
  void copyWeek(req, res, next, "previous");
});

rosterabilityRecordsRouter.post("/batch/copy-current-to-next", requireRole("manager", "employee"), (req, res, next) => {
  void copyWeek(req, res, next, "next");
});

rosterabilityRecordsRouter.post("/batch/set-dates", requireRole("manager", "employee"), async (req, res, next) => {
  try {
    const body = bodyOf(req);
    rejectReserved(body);
    const empId = targetEmployee(req, body);
    await employeeFor(req.identity!, empId);
    if (!Array.isArray(body.dates) || body.dates.length === 0) bad("dates 至少包含一个业务日期");
    const results = [];
    for (const date of body.dates) {
      try {
        const created = await createRecord(req.identity!, empId, { ...body, businessDate: date });
        results.push({ businessDate: date, success: true, recordId: created.id });
      } catch (error) {
        results.push(resultOf(error, date));
      }
    }
    ok(res, { empId, created: results.filter((row) => row.success).length, failed: results.filter((row) => !row.success).length, results }, "批量设置完成");
  } catch (error) { next(error); }
});
