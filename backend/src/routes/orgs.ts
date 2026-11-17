import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError, ErrorCode, ok } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";
import { parseFlag, parseId, TENANT_ID } from "../lib/validation";

export const orgsRouter = Router();

orgsRouter.get("/", requireRole("admin"), async (_req, res, next) => {
  try {
    ok(res, await prisma.dtaOrg.findMany({
      where: { tenantId: TENANT_ID, isDeleted: 0 },
      select: { id: true, orgName: true, priorityRosterEnable: true },
      orderBy: { id: "asc" },
    }));
  } catch (error) { next(error); }
});

orgsRouter.patch("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "id");
    const current = await prisma.dtaOrg.findFirst({ where: { id, tenantId: TENANT_ID, isDeleted: 0 } });
    if (!current) throw new AppError(ErrorCode.NOT_FOUND, "组织不存在", 404);
    const priorityRosterEnable = parseFlag(req.body.priorityRosterEnable, "priorityRosterEnable", current.priorityRosterEnable);
    ok(res, await prisma.dtaOrg.update({ where: { id }, data: { priorityRosterEnable } }), "组织优先排班模式已更新");
  } catch (error) { next(error); }
});
