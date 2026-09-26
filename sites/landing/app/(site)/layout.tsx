import { createOpenFlowLayout } from "@openflow/next";
import config from "@/openflow.config";

// Header, footer and theme come from `layout` in openflow.config.tsx (also used by the admin).
export default createOpenFlowLayout(config);
