import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

describe("app", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp(loadConfig({ NODE_ENV: "test", JSON_BODY_LIMIT_BYTES: "100" }));
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("GET /api/health returns ok", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.status, "ok");
    assert.equal(body.service, "rangeen-backend");
    assert.equal(typeof body.uptimeSeconds, "number");
    assert.ok(!Number.isNaN(Date.parse(body.timestamp as string)));
  });

  it("sets security headers and hides x-powered-by", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("x-powered-by"), null);
  });

  it("allows the configured CORS origin only", async () => {
    const allowed = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");

    const blocked = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const res = await fetch(`${baseUrl}/api/nope`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "not_found");
  });

  it("returns a JSON 400 for malformed JSON bodies", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "invalid_json");
  });

  it("returns a JSON 413 for oversized bodies", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(500) }),
    });
    assert.equal(res.status, 413);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "payload_too_large");
  });
});
