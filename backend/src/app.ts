import cors from "cors";
import express, { type Express } from "express";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { mockIdentity } from "./middleware/mockIdentity";
import { healthRouter } from "./routes/health";
import { meRouter } from "./routes/me";
import { dictionariesRouter } from "./routes/dictionaries";
import { paramGroupsRouter } from "./routes/paramGroups";
import { mockShiftsRouter } from "./routes/mockShifts";
import { managerEmployeesRouter } from "./routes/managerEmployees";
import { templatesRouter } from "./routes/templates";
import { templateGenerationRouter } from "./routes/templateGeneration";
import { rosterabilityRecordsRouter } from "./routes/rosterabilityRecords";
import { orgsRouter } from "./routes/orgs";
import { paramSchemesRouter } from "./routes/paramSchemes";

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // 健康检查无需身份
  app.use("/api/health", healthRouter);

  // 其余业务接口统一要求 Mock 身份
  app.use("/api", mockIdentity);
  app.use("/api/me", meRouter);
  app.use("/api/dictionaries", dictionariesRouter);
  app.use("/api/param-groups", paramGroupsRouter);
  app.use("/api/param-schemes", paramSchemesRouter);
  app.use("/api/mock-shifts", mockShiftsRouter);
  app.use("/api/manager/employees", managerEmployeesRouter);
  app.use("/api/templates", templatesRouter);
  app.use("/api/template-generation", templateGenerationRouter);
  app.use("/api/rosterability-records", rosterabilityRecordsRouter);
  app.use("/api/orgs", orgsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
