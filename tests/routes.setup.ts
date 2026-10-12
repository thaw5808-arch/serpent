import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { TestProject } from "vitest/node";

let server: ChildProcess | null = null;

export async function setup(project: TestProject) {
  let base = process.env.ROUTES_BASE_URL;
  if (!base) {
    const root = path.resolve(__dirname, "..");
    if (!existsSync(path.join(root, ".next", "BUILD_ID"))) throw new Error("No production build. Run `npm run build` first.");
    const port = String(3900 + Math.floor(Math.random() * 90));
    server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", port], { cwd: root, stdio: "ignore" });
    base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 120; i++) {
      try {
        await fetch(`${base}/en`, { redirect: "manual" });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  project.provide("baseUrl", base);
}

export async function teardown() {
  server?.kill();
}

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
  }
}
