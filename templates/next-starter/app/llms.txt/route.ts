import { createLlmsTxt } from "@openflow/next/data";
import config from "@/openflow.config";

// The site for AI agents (https://llmstxt.org): its pages, with their descriptions.
export const dynamic = "force-static";
export const GET = createLlmsTxt(config);
