import { getSite } from "@openflow/next";
import type { ReactNode } from "react";
import config from "@/openflow.config";
import "./globals.css";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const site = await getSite(config);
  return (
    <html lang={site.lang}>
      <body>{children}</body>
    </html>
  );
}
