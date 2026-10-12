import { NextResponse } from "next/server";
import { z } from "zod";
import { COUNTRY_CODES } from "@/data/countries";
import { MAX_PHOTOS_PER_REQUEST, MAX_UPLOAD_BYTES, validatePhotoSet } from "@/lib/imageValidation";
import { rateLimit } from "@/lib/rateLimit";
import { createVisionProvider } from "@/services/providers";
import { configuredEngine } from "@/services/providers/config";
import { ProviderUnavailableError } from "@/services/providers/types";
import { SnakeIdentificationService } from "@/services/snakeIdentification";
import { nonIdentification } from "@/services/safetyService";
import { logIdentification } from "@/services/identificationLog";
import type { IdentificationResult } from "@/types";

const CountrySchema = z.union([z.literal(""), z.enum(COUNTRY_CODES as [string, ...string[]])]);

const RATE_LIMIT = { limit: 8, windowMs: 60_000 };

function clientKey(req: Request): string {
  // Used only as an in-memory rate-limit key; never logged or stored.
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/**
 * `code` lets the client show the message in the user's language (errors.api.* in messages/*.json);
 * `error` is the English text for API clients and logs.
 */
function error(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, code, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const limited = rateLimit(`identify:${clientKey(req)}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many photos in a short time. Wait a minute and try again.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds), "Cache-Control": "no-store" } },
    );
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES * MAX_PHOTOS_PER_REQUEST + 64 * 1024) {
    return error(413, "upload_too_large", "These photos are too large. Try smaller images.");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error(400, "upload_unreadable", "The upload could not be read. Try again.");
  }

  const files = form.getAll("image");
  if (files.some((f) => !(f instanceof Blob))) return error(400, "upload_unreadable", "The upload could not be read. Try again.");

  const country = CountrySchema.safeParse(form.get("country") ?? "");
  if (!country.success) return error(400, "unknown_country", "Unknown country selection.");

  if (files.length > MAX_PHOTOS_PER_REQUEST) return error(400, "too_many_photos", `Send at most ${MAX_PHOTOS_PER_REQUEST} photos of the same snake.`);
  const valid = validatePhotoSet(await Promise.all((files as Blob[]).map(async (f) => new Uint8Array(await f.arrayBuffer()))));
  if (!valid.ok) return error(valid.status, valid.code, valid.error, valid.photo ? { photo: valid.photo } : {});

  const meta = { id: crypto.randomUUID(), analyzedAt: new Date().toISOString() };

  let result: IdentificationResult;
  try {
    const service = new SnakeIdentificationService(createVisionProvider());
    result = await service.identify(
      valid.photos.map((p) => ({ imageBase64: Buffer.from(p.bytes).toString("base64"), mediaType: p.mime })),
      country.data || null,
      meta,
    );
  } catch (err) {
    // Provider construction errors (missing key, bad VISION_PROVIDER) land here; their messages carry no secrets.
    if (err instanceof ProviderUnavailableError) console.error("[identify] provider unavailable:", err.message);
    else console.error("[identify] unexpected:", (err as Error).message);
    // Never show a fabricated result: report the service as unavailable.
    result = {
      ...meta,
      engine: configuredEngine(),
      ...nonIdentification("service_unavailable"),
      country: country.data || null,
    };
  }

  // The image bytes go out of scope here and are never written anywhere.
  await logIdentification(result);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
