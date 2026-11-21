import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigError, loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("uses defaults when nothing is set", () => {
    const config = loadConfig({});
    assert.equal(config.nodeEnv, "development");
    assert.equal(config.port, 3000);
    assert.deepEqual(config.corsOrigins, ["http://localhost:5173"]);
    assert.equal(config.jsonBodyLimitBytes, 1_000_000);
  });

  it("reads explicit values", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      PORT: "8080",
      CORS_ORIGINS: "https://rangeen.app, http://localhost:5173",
      JSON_BODY_LIMIT_BYTES: "2048",
    });
    assert.equal(config.nodeEnv, "production");
    assert.equal(config.port, 8080);
    assert.deepEqual(config.corsOrigins, ["https://rangeen.app", "http://localhost:5173"]);
    assert.equal(config.jsonBodyLimitBytes, 2048);
  });

  it("rejects invalid ports", () => {
    assert.throws(() => loadConfig({ PORT: "abc" }), ConfigError);
    assert.throws(() => loadConfig({ PORT: "0" }), ConfigError);
    assert.throws(() => loadConfig({ PORT: "70000" }), ConfigError);
    assert.throws(() => loadConfig({ PORT: "30.5" }), ConfigError);
  });

  it("rejects unknown NODE_ENV values", () => {
    assert.throws(() => loadConfig({ NODE_ENV: "staging" }), ConfigError);
  });

  it("rejects CORS origins that are not bare origins", () => {
    assert.throws(() => loadConfig({ CORS_ORIGINS: "not a url" }), ConfigError);
    assert.throws(() => loadConfig({ CORS_ORIGINS: "http://localhost:5173/" }), ConfigError);
    assert.throws(() => loadConfig({ CORS_ORIGINS: "http://localhost:5173/app" }), ConfigError);
  });
});
