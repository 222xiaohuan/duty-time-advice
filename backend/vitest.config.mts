import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    env: { DATABASE_URL: "file:./prisma/test.db" },
    fileParallelism: false,
  },
});
