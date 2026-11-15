import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError, ok } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";
import { DtaBaselineRule, DtaConflictCheckMode, DtaSubmitMode } from "../types/enums";
import { bad, isEmployeeType, parseEnum, parseFlag, parseId, validateParamValues, TENANT_ID } from "../lib/validation";

export const paramGroupsRouter = Router();

function payload(body: Record<string, unknown>, current?: Record<string, unknown>) {
  const merged = { ...(current ?? {}), ...body };
  const orgId = parseId(merged.orgId, "orgId");
  const empTypeCode = merged.empTypeCode;
  if (!isEmployeeType(empTypeCode)) bad("empTypeCode 不是 Demo 支持的员工类型");
  const result = {
    orgId,
    empTypeCode,
    cutoffDays: Number(merged.cutoffDays),
    baselineRule: parseEnum(merged.baselineRule, Object.values(DtaBaselineRule), "baselineRule"),
    submitMode: parseEnum(merged.submitMode, Object.values(DtaSubmitMode), "submitMode"),
    empEditEnable: parseFlag(merged.empEditEnable, "empEditEnable"),
    templateAutoGenEnable: parseFlag(merged.templateAutoGenEnable, "templateAutoGenEnable"),
    autoGenRangeWeek: merged.autoGenRangeWeek === null || merged.autoGenRangeWeek === undefined ? null : Number(merged.autoGenRangeWeek),
    autoGenWeekday: merged.autoGenWeekday === null || merged.autoGenWeekday === undefined ? null : Number(merged.autoGenWeekday),
    autoGenTime: merged.autoGenTime === null || merged.autoGenTime === undefined ? null : String(merged.autoGenTime),
    conflictCheckMode: parseEnum(merged.conflictCheckMode ?? DtaConflictCheckMode.STRONG_BLOCK, Object.values(DtaConflictCheckMode), "conflictCheckMode"),
    fieldSiteEnable: parseFlag(merged.fieldSiteEnable, "fieldSiteEnable", 0),
    enableApproval: parseFlag(merged.enableApproval, "enableApproval", 0),
    specialTagDiffEnable: parseFlag(merged.specialTagDiffEnable, "specialTagDiffEnable", 0),
  };
  validateParamValues(result);
  return result;
}

async function ensureOrg(orgId: number): Promise<void> {
  const org = await prisma.dtaOrg.findFirst({ where: { id: orgId, tenantId: TENANT_ID, isDeleted: 0 } });
  if (!org) throw new AppError(40400, "组织不存在", 404);
}

paramGroupsRouter.get("/", requireRole("admin"), async (req, res, next) => {
  try {
    const where = { tenantId: TENANT_ID, isDeleted: 0, ...(req.query.orgId ? { orgId: parseId(req.query.orgId, "orgId") } : {}), ...(req.query.empTypeCode ? { empTypeCode: String(req.query.empTypeCode) } : {}) };
    ok(res, await prisma.dtaParamGroup.findMany({ where, orderBy: [{ orgId: "asc" }, { empTypeCode: "asc" }] }));
  } catch (error) { next(error); }
});

paramGroupsRouter.get("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const row = await prisma.dtaParamGroup.findFirst({ where: { id: parseId(req.params.id, "id"), tenantId: TENANT_ID, isDeleted: 0 } });
    if (!row) throw new AppError(40400, "参数组不存在", 404);
    ok(res, row);
  } catch (error) { next(error); }
});

paramGroupsRouter.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const values = payload(req.body as Record<string, unknown>);
    await ensureOrg(values.orgId);
    const existing = await prisma.dtaParamGroup.findFirst({ where: { tenantId: TENANT_ID, orgId: values.orgId, empTypeCode: values.empTypeCode } });
    const data = { tenantId: TENANT_ID, ...values, createdBy: req.identity!.userId, updatedBy: req.identity!.userId };
    if (existing) {
      const restored = await prisma.dtaParamGroup.update({ where: { id: existing.id }, data: { ...values, isDeleted: 0, updatedBy: req.identity!.userId } });
      ok(res, restored, "参数组已恢复并更新");
      return;
    }
    const created = await prisma.dtaParamGroup.create({ data });
    ok(res, created, "参数组已创建");
  } catch (error) { next(error); }
});

paramGroupsRouter.patch("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "id");
    const current = await prisma.dtaParamGroup.findFirst({ where: { id, tenantId: TENANT_ID, isDeleted: 0 } });
    if (!current) throw new AppError(40400, "参数组不存在", 404);
    const values = payload(req.body as Record<string, unknown>, current as unknown as Record<string, unknown>);
    await ensureOrg(values.orgId);
    const duplicate = await prisma.dtaParamGroup.findFirst({ where: { tenantId: TENANT_ID, orgId: values.orgId, empTypeCode: values.empTypeCode, isDeleted: 0, NOT: { id } } });
    if (duplicate) throw new AppError(40900, "相同组织和员工类型的参数组已存在", 409);
    const updated = await prisma.dtaParamGroup.update({ where: { id }, data: { ...values, updatedBy: req.identity!.userId } });
    ok(res, updated, "参数组已更新");
  } catch (error) { next(error); }
});

paramGroupsRouter.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "id");
    const current = await prisma.dtaParamGroup.findFirst({ where: { id, tenantId: TENANT_ID, isDeleted: 0 } });
    if (!current) throw new AppError(40400, "参数组不存在", 404);
    const deleted = await prisma.dtaParamGroup.update({ where: { id }, data: { isDeleted: 1, updatedBy: req.identity!.userId } });
    ok(res, deleted, "参数组已删除");
  } catch (error) { next(error); }
});

