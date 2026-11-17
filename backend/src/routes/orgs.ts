import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ok } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";
import { TENANT_ID } from "../lib/validation";

export const orgsRouter = Router();

orgsRouter.get("/", requireRole("admin"), async (_req, res, next) => {
  try {
    const [orgs, schemes, params] = await Promise.all([prisma.dtaOrg.findMany({
      where: { tenantId: TENANT_ID, isDeleted: 0 },
      select: { id: true, orgName: true, paramSchemeId: true },
      orderBy: { id: "asc" },
    }), prisma.dtaParamScheme.findMany({ where: { tenantId: TENANT_ID }, select: { id: true, schemeName: true } }),
    prisma.dtaParamGroup.findMany({ where: { tenantId: TENANT_ID, isDeleted: 0 } })]);
    ok(res, orgs.map((org) => ({ ...org,
      schemeName: schemes.find((scheme) => scheme.id === org.paramSchemeId)?.schemeName ?? null,
      rules: params.filter((param) => param.orgId === org.id),
    })));
  } catch (error) { next(error); }
});
