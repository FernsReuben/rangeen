import cors from "cors";
import express, { type Express } from "express";
import type { AppConfig } from "./config.js";
import { createErrorHandler, notFoundHandler } from "./http/http-errors.js";
import { securityHeaders } from "./http/security-headers.js";
import { createHealthRouter } from "./routes/health-routes.js";

export function createApp(config: AppConfig): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: config.jsonBodyLimitBytes }));

  // All application routes live under /api.
  app.use("/api/health", createHealthRouter());

  app.use(notFoundHandler);
  app.use(
    createErrorHandler({
      exposeInternalErrors: config.nodeEnv !== "production",
    }),
  );

  return app;
}
