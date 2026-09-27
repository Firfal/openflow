import { describe, expect, it } from "vitest";
import {
  describeRedirect,
  errorPage,
  parseClientMetadata,
  pkceChallenge,
  redirectUriMatches,
  redirectUriProblem,
  resourceMetadata,
  routeOf,
  serverMetadata,
  splitFunctionPath,
  tokenRequestParams,
  verifyPkce,
} from "../src/oauth.js";

describe("OAuth for the MCP server", () => {
  it("verifies PKCE S256 (RFC 7636 example)", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(pkceChallenge(verifier)).toBe(challenge);
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(`${verifier}x`, challenge)).toBe(false);
    expect(verifyPkce("short", pkceChallenge("short"))).toBe(false);
    expect(verifyPkce(undefined, challenge)).toBe(false);
  });

  it("accepts https, loopback http and app schemes as redirect URIs, and nothing else", () => {
    for (const ok of [
      "https://claude.ai/api/mcp/auth_callback",
      "https://chatgpt.com/connector_platform_oauth_redirect",
      "http://localhost:33418/callback",
      "http://127.0.0.1/cb",
      "http://[::1]:8080/cb",
      "cursor://anysphere.cursor-retrieval/oauth/callback",
      "vscode://vscode.github-authentication/did-authenticate",
    ]) {
      expect(redirectUriProblem(ok), ok).toBeUndefined();
    }
    for (const bad of [
      "http://evil.example/cb",
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "https://claude.ai/cb#frag",
      "not a url",
      "",
      42,
    ]) {
      expect(redirectUriProblem(bad), String(bad)).toBeDefined();
    }
  });

  it("matches redirect URIs exactly, except the port of a loopback URI", () => {
    const registered = ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1:1234/cb"];
    expect(redirectUriMatches(registered, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectUriMatches(registered, "https://claude.ai/api/mcp/auth_callback?x=1")).toBe(
      false,
    );
    expect(redirectUriMatches(registered, "http://127.0.0.1:9999/cb")).toBe(true);
    expect(redirectUriMatches(registered, "http://127.0.0.1:9999/other")).toBe(false);
    expect(redirectUriMatches(registered, "http://localhost:1234/cb")).toBe(false);
  });

  it("describes where the owner is sent back", () => {
    expect(describeRedirect("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
    expect(describeRedirect("http://127.0.0.1:5555/cb")).toBe("une application de cet ordinateur");
    expect(describeRedirect("cursor://x/y")).toBe("l'application cursor");
  });

  it("checks client metadata at registration", () => {
    expect(
      parseClientMetadata({
        client_name: "Claude\u0000",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
      }),
    ).toEqual({
      name: "Claude",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      authMethod: "none",
    });
    expect(parseClientMetadata({ redirect_uris: ["https://a.example/cb"] }).name).toBe(
      "Assistant IA",
    );
    expect(() => parseClientMetadata({ redirect_uris: [] })).toThrow(/redirect_uris/);
    expect(() => parseClientMetadata({ redirect_uris: ["http://evil.example/cb"] })).toThrow(
      /boucle locale/,
    );
    expect(() =>
      parseClientMetadata({
        redirect_uris: ["https://a.example/cb"],
        token_endpoint_auth_method: "private_key_jwt",
      }),
    ).toThrow(/token_endpoint_auth_method/);
    expect(() =>
      parseClientMetadata({ redirect_uris: ["https://a.example/cb"], grant_types: ["implicit"] }),
    ).toThrow(/authorization_code/);
    expect(() =>
      parseClientMetadata({
        redirect_uris: ["https://a.example/cb"],
        client_name: "x".repeat(9000),
      }),
    ).toThrow(/volumineuses/);
    expect(() => parseClientMetadata("nope")).toThrow();
  });

  it("reads token requests from a form, JSON or Basic credentials", () => {
    expect(
      tokenRequestParams({ grant_type: "authorization_code", code: "c", n: 1 }, undefined),
    ).toEqual({ grant_type: "authorization_code", code: "c" });
    expect(tokenRequestParams("grant_type=refresh_token&refresh_token=r", undefined)).toEqual({
      grant_type: "refresh_token",
      refresh_token: "r",
    });
    const basic = `Basic ${Buffer.from("cmscli_a:s%3Acret").toString("base64")}`;
    expect(tokenRequestParams({}, basic)).toMatchObject({
      client_id: "cmscli_a",
      client_secret: "s:cret",
    });
  });

  it("publishes the metadata MCP clients discover", () => {
    const server = serverMetadata("https://site.example");
    expect(server).toMatchObject({
      issuer: "https://site.example",
      authorization_endpoint: "https://site.example/mcp/oauth/authorize",
      token_endpoint: "https://site.example/mcp/oauth/token",
      registration_endpoint: "https://site.example/mcp/oauth/register",
      code_challenge_methods_supported: ["S256"],
      response_types_supported: ["code"],
    });
    expect(
      resourceMetadata("https://site.example/mcp", "https://site.example", "Boulangerie"),
    ).toMatchObject({
      resource: "https://site.example/mcp",
      authorization_servers: ["https://site.example"],
      resource_name: "OpenFlow · Boulangerie",
    });
  });

  it("routes paths, with or without the /mcp prefix", () => {
    expect(routeOf("/mcp")).toEqual({ route: "mcp", suffix: "/mcp" });
    expect(routeOf("/")).toEqual({ route: "mcp", suffix: "" });
    expect(routeOf("/.well-known/oauth-protected-resource/mcp")).toEqual({
      route: "resource-metadata",
      suffix: "/mcp",
    });
    expect(routeOf("/.well-known/oauth-protected-resource").suffix).toBe("");
    expect(routeOf("/.well-known/oauth-authorization-server").route).toBe("server-metadata");
    expect(routeOf("/mcp/oauth/token").route).toBe("token");
    expect(routeOf("/oauth/register").route).toBe("register");
    expect(routeOf("/mcp/oauth/authorize/").route).toBe("authorize");
    expect(routeOf("/admin").route).toBe("unknown");
  });

  it("strips the function's own prefix (emulator, cloudfunctions.net)", () => {
    expect(splitFunctionPath("/demo/europe-west1/cmsMcp/mcp/oauth/token", "cmsMcp")).toEqual({
      prefix: "/demo/europe-west1/cmsMcp",
      path: "/mcp/oauth/token",
    });
    expect(splitFunctionPath("/cmsMcp", "cmsMcp")).toEqual({
      prefix: "/cmsMcp",
      path: "/",
    });
    expect(splitFunctionPath("/mcp", "cmsMcp")).toEqual({ prefix: "", path: "/mcp" });
    expect(splitFunctionPath("/cmsMcpX/y", "cmsMcp")).toEqual({
      prefix: "",
      path: "/cmsMcpX/y",
    });
  });

  it("escapes the error page", () => {
    expect(errorPage('<script>alert("x")</script>')).not.toContain("<script>");
  });
});
