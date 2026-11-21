export type NodeEnv = "development" | "production" | "test";

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  corsOrigins: string[];
  jsonBodyLimitBytes: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const DEFAULT_PORT = 3000;
const DEFAULT_CORS_ORIGINS = ["http://localhost:5173"]; // Vite dev server
const DEFAULT_JSON_BODY_LIMIT_BYTES = 1_000_000; // 1 MB; image uploads will use a separate route

function parseNodeEnv(value: string | undefined): NodeEnv {
  if (value === undefined || value === "") return "development";
  if (value === "development" || value === "production" || value === "test") {
    return value;
  }
  throw new ConfigError(
    `NODE_ENV must be "development", "production" or "test" (got "${value}").`,
  );
}

function parsePositiveInt(
  name: string,
  value: string | undefined,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new ConfigError(
      `${name} must be a positive integer (got "${value}").`,
    );
  }
  const parsed = Number(value.trim());
  if (parsed < 1 || parsed > max) {
    throw new ConfigError(
      `${name} must be between 1 and ${max} (got ${parsed}).`,
    );
  }
  return parsed;
}

function parseOrigins(value: string | undefined): string[] {
  if (value === undefined || value.trim() === "") return DEFAULT_CORS_ORIGINS;
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new ConfigError(
        `CORS_ORIGINS contains an invalid URL: "${origin}".`,
      );
    }
    if (url.origin !== origin) {
      throw new ConfigError(
        `CORS_ORIGINS entries must be bare origins like "http://localhost:5173" (got "${origin}").`,
      );
    }
  }
  return origins;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: parseNodeEnv(env.NODE_ENV),
    port: parsePositiveInt("PORT", env.PORT, DEFAULT_PORT, 65_535),
    corsOrigins: parseOrigins(env.CORS_ORIGINS),
    jsonBodyLimitBytes: parsePositiveInt(
      "JSON_BODY_LIMIT_BYTES",
      env.JSON_BODY_LIMIT_BYTES,
      DEFAULT_JSON_BODY_LIMIT_BYTES,
    ),
  };
}
