import { describe, expect, it } from "vitest";
import {
  AGENT_TOKEN_PREFIX,
  downloadMedia,
  hashAgentToken,
  tokenFromRequest,
} from "../src/agent.js";

describe("assistant keys", () => {
  it("reads the key from the Authorization header or the ?key= parameter", () => {
    expect(tokenFromRequest({ authorization: "Bearer ofk_abc" }, {})).toBe("ofk_abc");
    expect(tokenFromRequest({}, { key: "ofk_def" })).toBe("ofk_def");
    expect(tokenFromRequest({ authorization: "Basic xyz" }, {})).toBeUndefined();
  });

  it("stores a stable SHA-256 of the key", () => {
    expect(AGENT_TOKEN_PREFIX).toBe("ofk_");
    expect(hashAgentToken("ofk_x")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAgentToken("ofk_x")).toBe(hashAgentToken("ofk_x"));
    expect(hashAgentToken("ofk_x")).not.toBe(hashAgentToken("ofk_y"));
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
