import { execFileSync } from "node:child_process";
import { closeSync, openSync, rmSync } from "node:fs";
import path from "node:path";

/** 每次测试运行前重建独立的 test.db，不影响演示数据 dev.db */
export default function setup() {
  const root = path.resolve(__dirname, "..");
  const env = { ...process.env, DATABASE_URL: "file:./prisma/test.db", PRISMA_HIDE_UPDATE_MESSAGE: "1" };
  rmSync(path.join(root, "prisma/test.db"), { force: true });
  closeSync(openSync(path.join(root, "prisma/test.db"), "w"));
  execFileSync(path.join(root, "node_modules/.bin/prisma"), ["migrate", "deploy"], { cwd: root, env, stdio: "pipe" });
}
