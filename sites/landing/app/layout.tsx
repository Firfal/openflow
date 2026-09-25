import "@fontsource-variable/bricolage-grotesque/standard.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource-variable/jetbrains-mono";
import { getSite } from "@openflow/next";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import config from "@/openflow.config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite(config);
  return {
    metadataBase: site.url ? new URL(site.url) : undefined,
    openGraph: { images: [{ url: "/og.png", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = { themeColor: "#0f1e33" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const site = await getSite(config);
  return (
    <html lang={site.lang}>
      <body>{children}</body>
    </html>
  );
}
