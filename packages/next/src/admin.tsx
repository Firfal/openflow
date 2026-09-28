"use client";

import type { OpenFlowAdminProps } from "@openflow/admin";
import { type ComponentType, useEffect, useState } from "react";

/**
 * Client-only admin route. `app/admin/page.tsx` must itself be a client component because the
 * config contains render functions. Import the config on demand: the sections' code then loads
 * once the owner is signed in, not on the login screen.
 *
 * ```tsx
 * "use client";
 * import { OpenFlowAdmin } from "@openflow/next/admin";
 * const loadConfig = () => import("@/openflow.config");
 * export default function AdminPage() {
 *   return <OpenFlowAdmin config={loadConfig} siteName="Mon entreprise" />;
 * }
 * ```
 *
 * The admin bundle (Puck, Firebase) is loaded after mount, so it never runs during the static
 * export and never weighs on public pages.
 */
export function OpenFlowAdmin(props: OpenFlowAdminProps) {
  const [App, setApp] = useState<ComponentType<OpenFlowAdminProps> | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    import("@openflow/admin").then(
      (mod) => setApp(() => mod.OpenFlowAdminApp),
      (e: Error) => setError(e.message),
    );
  }, []);
  if (App) return <App {...props} />;
  return (
    <p
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 32,
        color: error ? "#c92a2a" : "#555",
      }}
    >
      {error
        ? `Impossible de charger l'administration : ${error}`
        : "Chargement de l'administration…"}
    </p>
  );
}
