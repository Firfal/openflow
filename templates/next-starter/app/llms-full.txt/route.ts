import { createLlmsFullTxt } from "@openflow/next/data";
import config from "@/openflow.config";

// The text of every published page, in Markdown, for AI agents.
export const dynamic = "force-static";
export const GET = createLlmsFullTxt(config);
