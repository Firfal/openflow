import type { NextConfig } from "next";

// OpenFlow publishes a static export on Firebase Hosting (norme OFS, règle OF-301).
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default config;
