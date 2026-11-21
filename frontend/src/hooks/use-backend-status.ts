import { useEffect, useState } from "react";

export type BackendStatus = "checking" | "online" | "offline";

const TIMEOUT_MS = 4000;

/**
 * Pings GET /api/health once on mount. In development Vite proxies /api to
 * the Express server (see vite.config.ts).
 */
export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/health", {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Health check returned HTTP ${response.status}`);
        const body: unknown = await response.json();
        const ok =
          typeof body === "object" &&
          body !== null &&
          (body as { status?: unknown }).status === "ok";
        if (!ok) throw new Error("Health check returned an unexpected body");
        if (!cancelled) setStatus("online");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.warn("[backend] Health check failed:", error);
        setStatus("offline");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
