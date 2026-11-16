import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError, ErrorCode, ok } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";
import { DtaSubmitMode } from "../types/enums";
import { TENANT_ID } from "../lib/validation";

/** 返回当前 Mock 身份，供前端角色切换后确认 */
export const meRouter = Router();

meRouter.get("/", (req, res) => {
  ok(res, req.identity);
});

meRouter.get("/rosterability-config", requireRole("employee"), async (req, res, next) => {
  try {
    const employee = await prisma.dtaEmployee.findFirst({ where: { id: req.identity!.userId, tenantId: TENANT_ID, isDeleted: 0 } });
    if (!employee) throw new AppError(ErrorCode.NOT_FOUND, "员工不存在", 404);
    const param = await prisma.dtaParamGroup.findFirst({ where: { tenantId: TENANT_ID, orgId: employee.orgId, empTypeCode: employee.empTypeCode, isDeleted: 0 } });
    if (!param) throw new AppError(ErrorCode.NOT_FOUND, "该员工未配置可排性参数", 404);
    const statuses = await prisma.dtaRosterabilityStatusDict.findMany({
      where: { tenantId: TENANT_ID, isDeleted: 0, enabled: 1, empSelfEdit: 1,
        ...(param.submitMode === DtaSubmitMode.MODE_ONLY_ROSTERABLE ? { statusCode: "ROSTERABLE" as const } :
          param.submitMode === DtaSubmitMode.MODE_ONLY_UNROSTERABLE ? { statusCode: "UNROSTERABLE" as const } : {}) },
      orderBy: { id: "asc" },
    });
    ok(res, {
      empId: employee.id, empName: employee.empName, orgId: employee.orgId, empTypeCode: employee.empTypeCode,
      cutoffDays: param.cutoffDays, baselineRule: param.baselineRule, submitMode: param.submitMode,
      empEditEnable: param.empEditEnable,
      allowedStatuses: param.submitMode === DtaSubmitMode.MODE_NO_SUBMIT ? [] : statuses.map((status) => ({
        statusCode: status.statusCode, statusName: status.statusName, colorHex: status.colorHex,
      })),
    });
  } catch (error) { next(error); }
});
