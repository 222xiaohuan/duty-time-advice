import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError, ErrorCode, ok } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";
import { allowedRosterabilityStatuses, TENANT_ID } from "../lib/validation";
import { DtaRosterabilityStatus } from "../types/enums";

/** 返回当前 Mock 身份，供前端角色切换后确认 */
export const meRouter = Router();

meRouter.get("/", (req, res) => {
  ok(res, req.identity);
});

meRouter.get("/rosterability-config", requireRole("employee"), async (req, res, next) => {
  try {
    const employee = await prisma.dtaEmployee.findFirst({ where: { id: req.identity!.userId, tenantId: TENANT_ID, isDeleted: 0 } });
    if (!employee) throw new AppError(ErrorCode.NOT_FOUND, "员工不存在", 404);
    const [param, org] = await Promise.all([
      prisma.dtaParamGroup.findFirst({ where: { tenantId: TENANT_ID, orgId: employee.orgId, empTypeCode: employee.empTypeCode, isDeleted: 0 } }),
      prisma.dtaOrg.findFirst({ where: { id: employee.orgId, tenantId: TENANT_ID, isDeleted: 0 } }),
    ]);
    if (!param) throw new AppError(ErrorCode.NOT_FOUND, "该员工未配置可排性参数", 404);
    if (!org) throw new AppError(ErrorCode.NOT_FOUND, "员工所属组织不存在", 404);
    const allowed = new Set(allowedRosterabilityStatuses(param.baselineRule, param.submitMode, param.priorityRosterEnable === 1));
    const statuses = await prisma.dtaRosterabilityStatusDict.findMany({
      where: { tenantId: TENANT_ID, isDeleted: 0, enabled: 1, empSelfEdit: 1 },
      orderBy: { id: "asc" },
    });
    const statusRank: Record<string, number> = { ROSTERABLE: 0, UNROSTERABLE: 1, PRIORITY_ROSTERABLE: 2 };
    const allowedStatusRows = statuses.filter((status) => allowed.has(status.statusCode as DtaRosterabilityStatus)).sort((a, b) => (statusRank[a.statusCode] ?? 99) - (statusRank[b.statusCode] ?? 99));
    ok(res, {
      empId: employee.id, empName: employee.empName, orgId: employee.orgId, empTypeCode: employee.empTypeCode,
      cutoffDays: param.cutoffDays, baselineRule: param.baselineRule, submitMode: param.submitMode,
      empEditEnable: param.empEditEnable,
      priorityRosterEnable: param.priorityRosterEnable,
      allowedStatuses: allowedStatusRows.map((status) => ({
        statusCode: status.statusCode, statusName: status.statusName, colorHex: status.colorHex,
      })),
    });
  } catch (error) { next(error); }
});
