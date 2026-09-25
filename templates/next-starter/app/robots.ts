import { createRobots } from "@openflow/next/data";
import config from "@/openflow.config";

export const dynamic = "force-static";
export default createRobots(config);
