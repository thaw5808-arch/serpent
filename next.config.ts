import type { NextConfig } from "next";
import { SPECIES } from "./src/data/species/catalog";

/** Taxonomy slugs of curated species (e.g. /th/species/bungarus-candidus) go to the curated page, in the same language. */
const curatedSlugRedirects = SPECIES.map((s) => ({
  source: `/:lang(en|th|my)/species/${s.scientificName.toLowerCase().replace(/[^a-z]+/g, "-")}`,
  destination: `/:lang/species/${s.id}`,
  permanent: true,
}));

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return curatedSlugRedirects;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
