import type { NextFunction, Request, Response } from "express";
import { AppError, ErrorCode } from "../lib/response";
import { MANAGER_USER_IDS, MOCK_ROLES, type MockRole } from "../types/enums";

export interface MockIdentity {
  role: MockRole;
  userId: number;
  /** manager 当前选择的组织；其他角色为 null */
  orgId: number | null;
  /** manager 可访问的组织范围；其他角色为空数组 */
  orgIds?: number[];
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

/** Demo 主管权限范围。标准产品由实际权限模型替换；请求中的 orgId 只是当前选择。 */
export const MANAGER_ORG_IDS: Readonly<Record<number, readonly number[]>> = {
  [MANAGER_USER_IDS.org1]: [1, 2],
  [MANAGER_USER_IDS.org2]: [2],
};

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
    const allowedOrgIds = MANAGER_ORG_IDS[userId];
    if (!allowedOrgIds || !allowedOrgIds.includes(orgId)) {
      return next(new AppError(ErrorCode.FORBIDDEN, "经理账号无权访问该组织", 403));
    }
    req.identity = { role: role as MockRole, userId, orgId, orgIds: [...allowedOrgIds] };
    return next();
  }
  req.identity = { role: role as MockRole, userId, orgId, orgIds: [] };
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
