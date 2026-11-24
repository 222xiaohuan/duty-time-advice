import { Router } from "express";
import { generateForManager } from "../lib/templateGeneration";
import { AppError, ErrorCode, ok } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";
import { parseId, TENANT_ID } from "../lib/validation";
import { prisma } from "../lib/prisma";
import { managerSelectedOrgIds, parseSelectedOrgIds } from "../lib/orgScope";

export const templateGenerationRouter = Router();

templateGenerationRouter.post("/", requireRole("manager"), async (req, res, next) => {
  try {
    const templateId = req.body?.templateId === undefined ? undefined : parseId(req.body.templateId, "templateId");
    if (templateId !== undefined) {
      const template = await prisma.dtaTemplate.findFirst({ where: { id: templateId, tenantId: TENANT_ID, isDeleted: 0 } });
      if (!template) throw new AppError(ErrorCode.NOT_FOUND, "模板不存在", 404);
    }
    const orgIds = parseSelectedOrgIds(req.body?.orgIds, req.identity!.orgId);
    const selectedOrgIds = await managerSelectedOrgIds(req.identity!, orgIds);
    const result = await generateForManager(orgIds[0], req.identity!.userId, new Date(), templateId, selectedOrgIds);
    ok(res, result, "可排时段生成完成");
  } catch (error) { next(error); }
});
