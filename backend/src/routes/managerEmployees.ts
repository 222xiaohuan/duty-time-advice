import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError, ErrorCode, ok } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";
import { TENANT_ID } from "../lib/validation";

export const managerEmployeesRouter = Router();

managerEmployeesRouter.get("/", requireRole("manager"), async (req, res, next) => {
  try {
    const orgId = req.identity!.orgId!;
    const org = await prisma.dtaOrg.findFirst({ where: { id: orgId, tenantId: TENANT_ID, isDeleted: 0 } });
    if (!org) throw new AppError(ErrorCode.NOT_FOUND, "管辖组织不存在", 404);
    const [employees, params] = await Promise.all([
      prisma.dtaEmployee.findMany({ where: { tenantId: TENANT_ID, orgId, isDeleted: 0 }, orderBy: [{ empName: "asc" }, { id: "asc" }] }),
      prisma.dtaParamGroup.findMany({ where: { tenantId: TENANT_ID, orgId, isDeleted: 0 } }),
    ]);
    ok(res, { orgId, orgName: org.orgName, priorityRosterEnable: org.priorityRosterEnable, employees: employees.map((employee) => {
      const param = params.find((item) => item.empTypeCode === employee.empTypeCode);
      return {
        id: employee.id, empName: employee.empName, empTypeCode: employee.empTypeCode, postCode: employee.postCode,
        cutoffDays: param?.cutoffDays ?? null, baselineRule: param?.baselineRule ?? null, priorityRosterEnable: org.priorityRosterEnable,
      };
    }) });
  } catch (error) { next(error); }
});
