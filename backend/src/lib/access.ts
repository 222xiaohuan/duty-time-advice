import type { Request } from "express";
import { AppError, ErrorCode } from "./response";
import { TENANT_ID, bad } from "./validation";

export function identityOf(req: Request) {
  if (!req.identity) throw new AppError(ErrorCode.UNAUTHORIZED, "缺少 Mock 身份", 401);
  return req.identity;
}

export function assertOrgAccess(req: Request, orgId: number): void {
  const identity = identityOf(req);
  if (identity.role === "manager" && identity.orgId !== orgId) {
    throw new AppError(ErrorCode.FORBIDDEN, "无权访问该组织数据", 403);
  }
}

export function assertEmployeeAccess(req: Request, empId: number): void {
  const identity = identityOf(req);
  if (identity.role === "employee" && identity.userId !== empId) {
    throw new AppError(ErrorCode.FORBIDDEN, "无权访问其他员工数据", 403);
  }
}

export function operateSource(req: Request): "employee" | "manager" | "admin" | "system" {
  return identityOf(req).role;
}

export { TENANT_ID, bad };
