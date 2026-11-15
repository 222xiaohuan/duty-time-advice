import { Router } from "express";
import { ok } from "../lib/response";

/** 返回当前 Mock 身份，供前端角色切换后确认 */
export const meRouter = Router();

meRouter.get("/", (req, res) => {
  ok(res, req.identity);
});
