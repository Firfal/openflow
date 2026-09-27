import type { OpenFlowConfig } from "@openflow/core";
import { useEffect, useSyncExternalStore } from "react";
import type { Services } from "./firebase.js";

/**
 * WebMCP (`document.modelContext`, https://webmachinelearning.github.io/webmcp/): the AI assistant
 * of the browser edits the site with the owner's session. The tools and their schemas (`agent.ts`)
 * are only downloaded when the browser supports it: most browsers do not yet, and the admin stays
 * light for them. Earlier drafts and Chrome builds exposed it as `navigator.modelContext`.
 */

export interface ModelContext {
  registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => unknown;
  unregisterTool?: (name: string) => unknown;
}

export function webMcp(): ModelContext | undefined {
  const candidates = [
    typeof document === "undefined"
      ? undefined
      : (document as Document & { modelContext?: ModelContext }).modelContext,
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { modelContext?: ModelContext }).modelContext,
  ];
  return candidates.find((context) => typeof context?.registerTool === "function");
}

type WebMcpState = { status: "unsupported" | "idle" | "active"; tools: number };
let state: WebMcpState = { status: webMcp() ? "idle" : "unsupported", tools: 0 };
const listeners = new Set<() => void>();

export function setWebMcpState(next: WebMcpState) {
  state = next;
  for (const listener of listeners) listener();
}

/** Whether the browser exposes WebMCP, and how many tools the admin registered. */
export function useWebMcpState(): WebMcpState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

/** Registers the tools with WebMCP while the owner is signed in, when the browser supports it. */
export function useWebMcp(services: Services, config: OpenFlowConfig) {
  useEffect(() => {
    if (!webMcp()) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    import("./agent.js").then(
      (agent) => {
        if (!cancelled) dispose = agent.registerWebMcp(services, config);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [services, config]);
}
