import { createIndexNowKey } from "@openflow/next/data";
import config from "@/openflow.config";

// The site's IndexNow key: at each publication, the changed pages are announced to Bing, Copilot…
export const dynamic = "force-static";
export const GET = createIndexNowKey(config);
