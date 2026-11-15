import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ok, AppError, ErrorCode } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";
import { parseFlag, parseId } from "../lib/validation";
import { DtaRosterabilityStatus } from "../types/enums";

export const dictionariesRouter = Router();

dictionariesRouter.get("/statuses", async (req, res, next) => {
  try {
    const rows = await prisma.dtaRosterabilityStatusDict.findMany({ where: { tenantId: 1, isDeleted: 0 }, orderBy: { id: "asc" } });
    ok(res, rows);
  } catch (error) { next(error); }
});

dictionariesRouter.patch("/statuses/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "id");
    const current = await prisma.dtaRosterabilityStatusDict.findFirst({ where: { id, tenantId: 1, isDeleted: 0 } });
    if (!current) throw new AppError(ErrorCode.NOT_FOUND, "状态字典不存在", 404);
    if (req.body.statusCode !== undefined && req.body.statusCode !== current.statusCode) throw new AppError(ErrorCode.BAD_REQUEST, "不允许修改状态编码", 400);
    const data = {
      statusName: req.body.statusName ?? current.statusName,
      nameI18n: req.body.nameI18n ?? current.nameI18n,
      colorHex: req.body.colorHex ?? current.colorHex,
      allowSchedule: parseFlag(req.body.allowSchedule, "allowSchedule", current.allowSchedule),
      empSelfEdit: parseFlag(req.body.empSelfEdit, "empSelfEdit", current.empSelfEdit),
      enabled: parseFlag(req.body.enabled, "enabled", current.enabled),
    };
    if (typeof data.statusName !== "string" || data.statusName.trim() === "") throw new AppError(ErrorCode.BAD_REQUEST, "statusName 不能为空", 400);
    if (current.statusCode === DtaRosterabilityStatus.STANDBY) data.enabled = 0;
    const updated = await prisma.dtaRosterabilityStatusDict.update({ where: { id }, data });
    ok(res, updated, "状态字典已更新");
  } catch (error) { next(error); }
});

dictionariesRouter.get("/sources", async (req, res, next) => {
  try {
    const rows = await prisma.dtaRosterabilitySourceDict.findMany({ where: { tenantId: 1, isDeleted: 0 }, orderBy: { id: "asc" } });
    ok(res, rows);
  } catch (error) { next(error); }
});

dictionariesRouter.patch("/sources/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "id");
    const current = await prisma.dtaRosterabilitySourceDict.findFirst({ where: { id, tenantId: 1, isDeleted: 0 } });
    if (!current) throw new AppError(ErrorCode.NOT_FOUND, "来源字典不存在", 404);
    if (req.body.sourceCode !== undefined && req.body.sourceCode !== current.sourceCode) throw new AppError(ErrorCode.BAD_REQUEST, "不允许修改来源编码", 400);
    const updated = await prisma.dtaRosterabilitySourceDict.update({ where: { id }, data: {
      sourceName: typeof req.body.sourceName === "string" && req.body.sourceName.trim() ? req.body.sourceName : current.sourceName,
      nameI18n: req.body.nameI18n ?? current.nameI18n,
      iconKey: req.body.iconKey ?? current.iconKey,
      enabled: current.sourceCode === "EXTERNAL_SYNC" || current.sourceCode === "BULK_IMPORT" ? 0 : parseFlag(req.body.enabled, "enabled", current.enabled),
    } });
    ok(res, updated, "来源字典已更新");
  } catch (error) { next(error); }
});

