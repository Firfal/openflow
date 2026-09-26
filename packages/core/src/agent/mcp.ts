import {
  AGENT_TOOLS,
  type AgentContext,
  AgentError,
  agentInstructions,
  runAgentTool,
} from "./tools.js";

/**
 * Minimal MCP server (Model Context Protocol, « Streamable HTTP » transport in stateless JSON
 * mode): `initialize`, `ping`, `tools/list` and `tools/call`. Transport-agnostic: the Cloud
 * Function passes each JSON-RPC message and sends back the returned response.
 */

export const MCP_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpServerOptions {
  context: AgentContext;
  /** Site name, for the instructions given to the AI. */
  siteName: string;
  version?: string;
  /** Called after each tool call (logs, audit). */
  onToolCall?: (name: string, ok: boolean) => void;
}

function isRequest(message: unknown): message is JsonRpcRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as JsonRpcRequest).jsonrpc === "2.0" &&
    typeof (message as JsonRpcRequest).method === "string"
  );
}

const error = (id: JsonRpcResponse["id"], code: number, message: string): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

/** Text shown to the AI for a tool result. */
export function toolResult(value: unknown): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
} {
  const structured =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { result: value };
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: structured,
  };
}

async function handleOne(
  message: unknown,
  options: McpServerOptions,
): Promise<JsonRpcResponse | undefined> {
  if (!isRequest(message)) return error(null, -32600, "Invalid Request");
  const { id, method, params } = message;
  // Notifications (no id) get no response.
  if (id === undefined || id === null) return undefined;
  switch (method) {
    case "initialize": {
      const requested = String(params?.protocolVersion ?? "");
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSIONS.includes(requested)
            ? requested
            : MCP_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: "openflow",
            title: `OpenFlow · ${options.siteName}`,
            version: options.version ?? "0.1.0",
          },
          instructions: agentInstructions(options.siteName),
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: AGENT_TOOLS } };
    case "tools/call": {
      const name = String(params?.name ?? "");
      if (!AGENT_TOOLS.some((t) => t.name === name))
        return error(id, -32602, `Unknown tool: ${name}`);
      try {
        const value = await runAgentTool(name, params?.arguments ?? {}, options.context);
        options.onToolCall?.(name, true);
        return { jsonrpc: "2.0", id, result: toolResult(value) };
      } catch (e) {
        options.onToolCall?.(name, false);
        // Tool errors are reported in the result, so the AI can read them and adjust.
        const text =
          e instanceof AgentError ? e.message : `Erreur inattendue : ${(e as Error).message}`;
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } };
      }
    }
    default:
      return error(id, -32601, `Method not found: ${method}`);
  }
}

/**
 * Handles one JSON-RPC message (or a batch, for older clients). Returns the response body, or
 * `undefined` when there is nothing to answer (notifications: HTTP 202).
 */
export async function handleMcpMessage(
  body: unknown,
  options: McpServerOptions,
): Promise<JsonRpcResponse | JsonRpcResponse[] | undefined> {
  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((m) => handleOne(m, options)))).filter(
      (r): r is JsonRpcResponse => r !== undefined,
    );
    return responses.length > 0 ? responses : undefined;
  }
  return handleOne(body, options);
}
