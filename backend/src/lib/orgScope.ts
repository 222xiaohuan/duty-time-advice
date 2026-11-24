import type { MockIdentity } from "../middleware/mockIdentity";
import { prisma } from "./prisma";
import { AppError, ErrorCode } from "./response";
import { TENANT_ID } from "./validation";

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

export async function managerSelectedOrgIds(identity: MockIdentity, selectedOrgId = identity.orgId): Promise<number[]> {
  if (identity.role !== "manager" || selectedOrgId === null || !(identity.orgIds ?? []).includes(selectedOrgId)) {
    throw new AppError(ErrorCode.FORBIDDEN, "无权访问该组织数据", 403);
  }
  const organizations = await prisma.dtaOrg.findMany({
    where: { tenantId: TENANT_ID, isDeleted: 0, id: { in: identity.orgIds } },
    select: { id: true, parentOrgId: true },
  });
  return descendantOrgIds([selectedOrgId], organizations);
}
