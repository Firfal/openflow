import { describe, expect, it } from "vitest";
import {
  AGENT_TOKEN_PREFIX,
  downloadMedia,
  hashAgentToken,
  tokenFromRequest,
} from "../src/agent.js";

describe("assistant keys", () => {
  it("reads the key from the Authorization header or the ?key= parameter", () => {
    expect(tokenFromRequest({ authorization: "Bearer cmsk_abc" }, {})).toBe("cmsk_abc");
    expect(tokenFromRequest({}, { key: "cmsk_def" })).toBe("cmsk_def");
    expect(tokenFromRequest({ authorization: "Basic xyz" }, {})).toBeUndefined();
  });

  it("stores a stable SHA-256 of the key", () => {
    expect(AGENT_TOKEN_PREFIX).toBe("cmsk_");
    expect(hashAgentToken("cmsk_x")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAgentToken("cmsk_x")).toBe(hashAgentToken("cmsk_x"));
    expect(hashAgentToken("cmsk_x")).not.toBe(hashAgentToken("cmsk_y"));
  });
});

describe("media import", () => {
  it("refuses plain http and private hosts", async () => {
    await expect(downloadMedia("http://example.com/a.png")).rejects.toThrow(/https/);
    await expect(downloadMedia("https://localhost/a.png")).rejects.toThrow(/réseau privé/);
    await expect(downloadMedia("https://127.0.0.1/a.png")).rejects.toThrow(/réseau privé/);
    await expect(downloadMedia("https://169.254.169.254/latest")).rejects.toThrow(/réseau privé/);
  });
});
