"use client";

import { OpenFlowAdmin } from "@openflow/next/admin";

// The sections' code is loaded once the owner is signed in: the login screen stays light.
const loadConfig = () => import("@/openflow.config");

export default function AdminPage() {
  return (
    <OpenFlowAdmin
      config={loadConfig}
      siteName="Mon entreprise"
      firebase={{
        emulators: process.env.NEXT_PUBLIC_CMS_EMULATORS === "1",
        region: process.env.NEXT_PUBLIC_CMS_REGION,
      }}
    />
  );
}
