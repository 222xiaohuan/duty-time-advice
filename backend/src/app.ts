import cors from "cors";
import express, { type Express } from "express";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { mockIdentity } from "./middleware/mockIdentity";
import { healthRouter } from "./routes/health";
import { meRouter } from "./routes/me";

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // 健康检查无需身份
  app.use("/api/health", healthRouter);

  // 其余业务接口统一要求 Mock 身份
  app.use("/api", mockIdentity);
  app.use("/api/me", meRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
