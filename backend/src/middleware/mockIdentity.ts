import type { NextFunction, Request, Response } from "express";
import { AppError, ErrorCode } from "../lib/response";
import { MOCK_ROLES, type MockRole } from "../types/enums";

export interface MockIdentity {
  role: MockRole;
  userId: number;
  /** manager 的管辖组织；其他角色为 null */
  orgId: number | null;
}

declare module "express-serve-static-core" {
  interface Request {
    identity?: MockIdentity;
  }
}

function parsePositiveInt(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

/**
 * 从请求头解析 Mock 身份：x-mock-role、x-mock-user-id、x-mock-org-id。
 * Demo 不做登录，但所有权限判断都基于此身份在后端执行。
 */
export function mockIdentity(req: Request, _res: Response, next: NextFunction): void {
  const role = req.header("x-mock-role");
  if (!role || !(MOCK_ROLES as readonly string[]).includes(role)) {
    return next(new AppError(ErrorCode.UNAUTHORIZED, "缺少或无效的 x-mock-role，取值为 admin / manager / employee", 401));
  }
  const userId = parsePositiveInt(req.header("x-mock-user-id"));
  if (userId === null) {
    return next(new AppError(ErrorCode.UNAUTHORIZED, "缺少或无效的 x-mock-user-id", 401));
  }
  let orgId: number | null = null;
  if (role === "manager") {
    orgId = parsePositiveInt(req.header("x-mock-org-id"));
    if (orgId === null) {
      return next(new AppError(ErrorCode.UNAUTHORIZED, "manager 角色必须提供 x-mock-org-id", 401));
    }
  }
  req.identity = { role: role as MockRole, userId, orgId };
  next();
}

/** 限定允许访问的角色 */
export function requireRole(...roles: MockRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.identity || !roles.includes(req.identity.role)) {
      return next(new AppError(ErrorCode.FORBIDDEN, "当前角色无权执行该操作", 403));
    }
    next();
  };
}
