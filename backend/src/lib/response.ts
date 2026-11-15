import type { Response } from "express";

/** 统一响应结构 {code,msg,data}。code=0 表示成功。 */
export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export const ErrorCode = {
  OK: 0,
  BAD_REQUEST: 40000,
  UNAUTHORIZED: 40100,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  CONFLICT: 40900,
  INTERNAL: 50000,
} as const;

export class AppError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
  }
}

export function ok<T>(res: Response, data: T, msg = "ok"): void {
  const body: ApiResponse<T> = { code: ErrorCode.OK, msg, data };
  res.json(body);
}

export function fail(res: Response, httpStatus: number, code: number, msg: string): void {
  const body: ApiResponse<null> = { code, msg, data: null };
  res.status(httpStatus).json(body);
}
