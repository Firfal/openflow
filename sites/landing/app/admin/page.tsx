"use client";

import { OpenFlowAdmin } from "@openflow/next/admin";
import config from "@/openflow.config";

export default function AdminPage() {
  return (
    <OpenFlowAdmin
      config={config}
      firebase={{
        emulators: process.env.NEXT_PUBLIC_CMS_EMULATORS === "1",
        region: process.env.NEXT_PUBLIC_CMS_REGION,
      }}
    />
  );
}
