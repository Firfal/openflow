import { createRssFeed } from "@openflow/next/data";
import config from "@/openflow.config";

// The latest items of the collections (Actualités), for feed readers and AI agents.
export const dynamic = "force-static";
export const GET = createRssFeed(config);
