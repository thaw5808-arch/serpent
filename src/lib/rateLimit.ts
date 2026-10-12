/**
 * Fixed-window in-memory rate limiter.
 *
 * Good enough for local dev and a single instance. On Vercel each serverless
 * instance has its own memory, so swap this for a shared store (e.g. Upstash
 * Redis) before relying on it in production. The interface stays the same.
 */
interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

export interface RateLimitResult { allowed: boolean; remaining: number; retryAfterSeconds: number }

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) prune(now);
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (b.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { allowed: true, remaining: limit - b.count, retryAfterSeconds: 0 };
}

function prune(now: number) {
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

export function __resetRateLimit() {
  buckets.clear();
}

/** The caller's address, used only as an in-memory rate-limit key; never logged or stored. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
