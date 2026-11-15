import { Router } from "express";
import { ok } from "../lib/response";
import { prisma } from "../lib/prisma";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  ok(res, { status: "up", db: "sqlite", time: new Date().toISOString() });
});
