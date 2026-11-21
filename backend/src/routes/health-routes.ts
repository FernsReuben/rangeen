import { Router } from "express";

export interface HealthResponse {
  status: "ok";
  service: "rangeen-backend";
  uptimeSeconds: number;
  timestamp: string;
}

/** Liveness check used by the frontend and, later, by hosting platforms. */
export function createHealthRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const body: HealthResponse = {
      status: "ok",
      service: "rangeen-backend",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
    res.set("Cache-Control", "no-store").json(body);
  });

  return router;
}
