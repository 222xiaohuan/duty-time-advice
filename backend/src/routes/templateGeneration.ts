import { Router } from "express";
import { generateForManager } from "../lib/templateGeneration";
import { ok } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";

export const templateGenerationRouter = Router();

templateGenerationRouter.post("/", requireRole("manager"), async (req, res, next) => {
  try {
    const result = await generateForManager(req.identity!.orgId!, req.identity!.userId);
    ok(res, result, "可排时段生成完成");
  } catch (error) { next(error); }
});
