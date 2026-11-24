import type { MockIdentity } from "../middleware/mockIdentity";
import { prisma } from "./prisma";
import { AppError, ErrorCode } from "./response";
import { bad, parseId, TENANT_ID } from "./validation";

type OrgNode = { id: number; parentOrgId: number | null };

export function descendantOrgIds(rootIds: readonly number[], organizations: readonly OrgNode[]): number[] {
  const children = new Map<number, number[]>();
  const activeIds = new Set(organizations.map((org) => org.id));
  for (const org of organizations) {
    if (org.parentOrgId !== null) children.set(org.parentOrgId, [...(children.get(org.parentOrgId) ?? []), org.id]);
  }
  const result = new Set<number>();
  const pending = rootIds.filter((id) => activeIds.has(id));
  while (pending.length) {
    const id = pending.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return [...result].sort((a, b) => a - b);
}

export function parseSelectedOrgIds(value: unknown, fallbackOrgId: number | null): number[] {
  if (value === undefined) return fallbackOrgId === null ? bad("请选择组织") : [fallbackOrgId];
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : bad("orgIds 必须为组织 ID 列表");
  if (values.length < 1 || values.length > 500) bad("请选择 1 至 500 个组织");
  return [...new Set(values.map((item) => parseId(item, "orgIds")))];
}

export async function managerSelectedOrgIds(identity: MockIdentity, selectedOrgIds: readonly number[] = identity.orgId === null ? [] : [identity.orgId]): Promise<number[]> {
  if (identity.role !== "manager" || selectedOrgIds.length === 0 || selectedOrgIds.some((id) => !(identity.orgIds ?? []).includes(id))) {
    throw new AppError(ErrorCode.FORBIDDEN, "无权访问该组织数据", 403);
  }
  const organizations = await prisma.dtaOrg.findMany({
    where: { tenantId: TENANT_ID, isDeleted: 0, id: { in: identity.orgIds } },
    select: { id: true, parentOrgId: true },
  });
  return descendantOrgIds(selectedOrgIds, organizations);
}
