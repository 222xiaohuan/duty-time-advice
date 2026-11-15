import type { NextFunction, Request, Response } from "express";
import { AppError, ErrorCode, fail } from "../lib/response";

export function notFoundHandler(_req: Request, res: Response): void {
  fail(res, 404, ErrorCode.NOT_FOUND, "接口不存在");
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    fail(res, err.httpStatus, err.code, err.message);
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    fail(res, 400, ErrorCode.BAD_REQUEST, "请求体不是合法 JSON");
    return;
  }
  console.error(err instanceof Error ? err.stack : err);
  fail(res, 500, ErrorCode.INTERNAL, "服务器内部错误");
}
