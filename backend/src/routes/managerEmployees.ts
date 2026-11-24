import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError, ErrorCode, ok } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";
import { TENANT_ID } from "../lib/validation";
import { managerSelectedOrgIds, parseSelectedOrgIds } from "../lib/orgScope";

export const managerEmployeesRouter = Router();

managerEmployeesRouter.get("/", requireRole("manager"), async (req, res, next) => {
  try {
    const orgIds = parseSelectedOrgIds(req.query.orgIds, req.identity!.orgId);
    const selectedOrgIds = await managerSelectedOrgIds(req.identity!, orgIds);
    const allowedOrgIds = req.identity!.orgIds ?? [];
    const organizations = await prisma.dtaOrg.findMany({
      where: { id: { in: allowedOrgIds }, tenantId: TENANT_ID, isDeleted: 0 },
      select: { id: true, orgName: true, parentOrgId: true },
      orderBy: [{ orgName: "asc" }, { id: "asc" }],
    });
    const org = organizations.find((item) => item.id === orgIds[0]);
    if (!org) throw new AppError(ErrorCode.NOT_FOUND, "管辖组织不存在", 404);
    const [employees, params] = await Promise.all([
      prisma.dtaEmployee.findMany({ where: { tenantId: TENANT_ID, orgId: { in: selectedOrgIds }, isDeleted: 0 }, orderBy: [{ empName: "asc" }, { id: "asc" }] }),
      prisma.dtaParamGroup.findMany({ where: { tenantId: TENANT_ID, orgId: { in: selectedOrgIds }, isDeleted: 0 } }),
    ]);
    ok(res, { orgId: org.id, orgIds, orgName: org.orgName, organizations, employees: employees.map((employee) => {
      const param = params.find((item) => item.orgId === employee.orgId && item.empTypeCode === employee.empTypeCode);
      return {
        id: employee.id, orgId: employee.orgId, empName: employee.empName, empTypeCode: employee.empTypeCode, postCode: employee.postCode,
        cutoffDays: param?.cutoffDays ?? null, baselineRule: param?.baselineRule ?? null, priorityRosterEnable: param?.priorityRosterEnable ?? 0,
      };
    }) });
  } catch (error) { next(error); }
});
