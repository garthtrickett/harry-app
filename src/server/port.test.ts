import { describe, expect, it } from "vitest";
import { getServerPortFromEnv } from "./index.ts";

describe("server port selection", () => {
  it("prefers the platform-provided PORT for Railway and similar hosts", () => {
    expect(
      getServerPortFromEnv({
        PORT: "8080",
        BACKEND_PORT: "42169"
      })
    ).toBe(8080);
  });

  it("falls back to BACKEND_PORT for local backend-only development", () => {
    expect(
      getServerPortFromEnv({
        PORT: undefined,
        BACKEND_PORT: "42170"
      })
    ).toBe(42170);
  });

  it("falls back to the project default when no valid port is configured", () => {
    expect(
      getServerPortFromEnv({
        PORT: "not-a-port",
        BACKEND_PORT: ""
      })
    ).toBe(42169);
  });
});