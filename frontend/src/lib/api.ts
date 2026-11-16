import type { MockRole, RosterabilityStatusCode, SourceCodeValue } from "./enums";
import type { MockProfile } from "./identity";

export type ApiResponse<T> = { code: number; msg: string; data: T };
export type MockIdentity = { role: MockRole; userId: number; orgId: number | null };
export type Health = { status: string; db: string };
export type StatusDictionaryItem = {
  id: number;
  statusCode: RosterabilityStatusCode;
  statusName: string;
  colorHex: string | null;
  enabled: number;
};
export type SourceDictionaryItem = {
  id: number;
  sourceCode: SourceCodeValue;
  sourceName: string;
  iconKey: string | null;
  enabled: number;
};

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: number) {
    super(message);
  }
}

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

type RequestOptions = { method?: "GET" | "POST" | "PATCH" | "DELETE"; profile?: MockProfile; body?: unknown; signal?: AbortSignal };

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", profile, body, signal } = options;
  const headers = new Headers({ Accept: "application/json" });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (profile) {
    headers.set("x-mock-role", profile.role);
    headers.set("x-mock-user-id", String(profile.userId));
    if (profile.orgId !== undefined) headers.set("x-mock-org-id", String(profile.orgId));
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("无法连接后端服务", 0);
  }
  let payload: ApiResponse<T>;
  try {
    payload = await response.json() as ApiResponse<T>;
  } catch {
    throw new ApiError("服务返回了无法识别的数据", response.status);
  }
  if (!response.ok || payload.code !== 0) {
    throw new ApiError(payload.msg || "请求失败", response.status, payload.code);
  }
  return payload.data;
}

export function apiGet<T>(path: string, profile?: MockProfile, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { profile, signal });
}

export function apiPost<T>(path: string, profile: MockProfile, body: unknown, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { method: "POST", profile, body, signal });
}

export function apiPatch<T>(path: string, profile: MockProfile, body: unknown, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", profile, body, signal });
}

export function apiDelete<T>(path: string, profile: MockProfile, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE", profile, signal });
}
