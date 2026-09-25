import { createOpenFlowPage } from "@openflow/next";
import config from "@/openflow.config";

// Every page comes from the published OpenFlow snapshot (never from Firestore directly).
const site = createOpenFlowPage(config);

export const dynamicParams = false;
export const generateStaticParams = site.generateStaticParams;
export const generateMetadata = site.generateMetadata;
export default site.Page;
