import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Route tests: real HTTP requests against the production build (`npm run build` first).
 * Starts `next start` on a spare port unless ROUTES_BASE_URL points at a running server.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/routes.http.ts"],
    globalSetup: ["tests/routes.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 90_000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
