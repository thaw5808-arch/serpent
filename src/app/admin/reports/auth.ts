import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/** Admin access for /admin/reports. Disabled entirely when ADMIN_TOKEN is unset. */

export const ADMIN_COOKIE = "serpent_admin";

export function adminEnabled(): boolean {
  return Boolean(process.env.ADMIN_TOKEN);
}

/** What the cookie holds: a hash of the token, never the token itself. */
export function sessionValue(token: string): string {
  return createHash("sha256").update(`serpent-admin:${token}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function isAdmin(): Promise<boolean> {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  return Boolean(value) && safeEqual(value!, sessionValue(token));
}
