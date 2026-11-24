import { execFileSync } from "node:child_process";
import { closeSync, openSync, rmSync } from "node:fs";
import path from "node:path";
import { createPrismaClient } from "../src/lib/prisma";

/** 每次测试运行前重建独立的 test.db，不影响演示数据 dev.db */
export default async function setup() {
  const root = path.resolve(__dirname, "..");
  const testDb = path.join(root, "prisma/test.db");
  const env = { ...process.env, DATABASE_URL: "file:./prisma/test.db", PRISMA_HIDE_UPDATE_MESSAGE: "1" };
  rmSync(testDb, { force: true });
  closeSync(openSync(testDb, "w"));
  execFileSync(path.join(root, "node_modules/.bin/prisma"), ["migrate", "deploy"], { cwd: root, env, stdio: "pipe" });
  const prisma = createPrismaClient("file:./prisma/test.db");
  const by = { createdBy: 9001, updatedBy: 9001 };
  try {
    await prisma.dtaTenant.create({ data: { id: 1, tenantName: "Test", ...by } });
    await prisma.dtaOrg.createMany({ data: [
      { id: 15, tenantId: 1, orgName: "JC003001 HVRC Outlet01", ...by },
      { id: 20, tenantId: 1, orgName: "JC003003 STRC Outlet01", ...by },
      { id: 1, tenantId: 1, orgName: "T010 org 1", parentOrgId: 15, ...by },
      { id: 2, tenantId: 1, orgName: "T010 org 2", parentOrgId: 20, ...by },
    ] });
  } finally {
    await prisma.$disconnect();
  }
  return () => rmSync(testDb, { force: true });
}
