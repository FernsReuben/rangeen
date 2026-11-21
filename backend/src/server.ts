import { createApp } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";

function start(): void {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[config] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const app = createApp(config);
  const server = app.listen(config.port);

  server.on("listening", () => {
    console.log(
      `rangeen backend listening on http://localhost:${config.port} (${config.nodeEnv})`,
    );
    console.log(`CORS allowed origins: ${config.corsOrigins.join(", ")}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[server] Port ${config.port} is already in use. Stop the other process or set PORT in backend/.env.`,
      );
    } else {
      console.error("[server] Failed to start:", err);
    }
    process.exit(1);
  });

  const shutdown = (signal: string) => {
    console.log(`[server] ${signal} received, shutting down…`);
    server.close((err) => {
      if (err) {
        console.error("[server] Error during shutdown:", err);
        process.exit(1);
      }
      process.exit(0);
    });
    // Don't hang forever on keep-alive connections.
    setTimeout(() => process.exit(0), 5_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start();
