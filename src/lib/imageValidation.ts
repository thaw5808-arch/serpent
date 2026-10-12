export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // client compresses to well under this
export const MIN_UPLOAD_BYTES = 2 * 1024;

export type AllowedMime = "image/jpeg" | "image/png" | "image/webp";

/**
 * Detects the real image type from magic bytes. The browser-supplied MIME type
 * and file name are ignored, so a renamed executable or SVG cannot slip through.
 */
export function sniffImageType(bytes: Uint8Array): AllowedMime | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}

/** Error codes match errors.api.* in messages/*.json; `error` stays in English for logs and API clients. */
export type PhotoErrorCode = "no_photo" | "too_many_photos" | "photo_too_large" | "photo_too_small" | "photo_bad_type";

export type ValidationResult =
  | { ok: true; mime: AllowedMime; bytes: Uint8Array }
  | { ok: false; error: string; code: PhotoErrorCode; status: number };

/** Up to this many photos of the same snake per request (mirrors MAX_PHOTOS on the server). */
export const MAX_PHOTOS_PER_REQUEST = 3;

export type PhotoSetResult =
  | { ok: true; photos: { mime: AllowedMime; bytes: Uint8Array }[] }
  | { ok: false; error: string; code: PhotoErrorCode; status: number; photo?: number };

/** 1–3 photos, each a real JPEG/PNG/WebP within the size limits. The first bad photo rejects the set. */
export function validatePhotoSet(files: Uint8Array[]): PhotoSetResult {
  if (files.length === 0) return { ok: false, status: 400, code: "no_photo", error: "No photo was attached." };
  if (files.length > MAX_PHOTOS_PER_REQUEST) {
    return { ok: false, status: 400, code: "too_many_photos", error: `Send at most ${MAX_PHOTOS_PER_REQUEST} photos of the same snake.` };
  }
  const photos: { mime: AllowedMime; bytes: Uint8Array }[] = [];
  for (const [i, bytes] of files.entries()) {
    const v = validateImageBytes(bytes);
    if (!v.ok) {
      return files.length > 1 ? { ...v, error: `Photo ${i + 1}: ${v.error}`, photo: i + 1 } : v;
    }
    photos.push({ mime: v.mime, bytes: v.bytes });
  }
  return { ok: true, photos };
}

export function validateImageBytes(bytes: Uint8Array): ValidationResult {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, code: "photo_too_large", error: "This photo is too large. Try a smaller image." };
  }
  if (bytes.byteLength < MIN_UPLOAD_BYTES) {
    return { ok: false, status: 400, code: "photo_too_small", error: "This file is too small to be a usable photo." };
  }
  const mime = sniffImageType(bytes);
  if (!mime) {
    return { ok: false, status: 415, code: "photo_bad_type", error: "Use a JPEG, PNG or WebP photo." };
  }
  return { ok: true, mime, bytes };
}
