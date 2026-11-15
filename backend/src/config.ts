import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  env: process.env.ENV ?? "demo",
};
