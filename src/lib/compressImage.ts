"use client";

export interface PreparedImage {
  blob: Blob; // JPEG, max 1600px, metadata (incl. GPS) stripped by re-encoding
  previewUrl: string;
  thumbnail: string; // small data URL kept on-device for the result screen
  width: number;
  height: number;
  lowResolution: boolean;
}

/** Keys of errors.photo.* in messages/*.json. */
export type PrepareErrorCode = "not_a_photo" | "too_large_to_open" | "format_unsupported" | "process_failed";

/** A photo that couldn't be prepared; the UI shows `code` in the user's language. */
export class PrepareImageError extends Error {
  constructor(readonly code: PrepareErrorCode, message: string) {
    super(message);
    this.name = "PrepareImageError";
  }
}

const MAX_EDGE = 1600;
const THUMB_EDGE = 480;
const MIN_EDGE = 320;
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new PrepareImageError("process_failed", "Couldn't process this photo."))), "image/jpeg", quality),
  );
}

function draw(bitmap: ImageBitmap, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PrepareImageError("process_failed", "Couldn't process this photo.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Resize and re-encode on the device before upload: smaller, faster, and no EXIF/GPS. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/") && file.type !== "") {
    throw new PrepareImageError("not_a_photo", "That file isn't a photo. Use a JPEG, PNG or WebP image.");
  }
  if (file.size > MAX_INPUT_BYTES) throw new PrepareImageError("too_large_to_open", "That photo is too large to open.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PrepareImageError("format_unsupported", "This browser can't open that photo format. Try a JPEG or PNG, or take the photo in the app.");
  }

  const main = draw(bitmap, MAX_EDGE);
  const blob = await toBlob(main, 0.85);
  const thumbCanvas = draw(bitmap, THUMB_EDGE);
  const thumbnail = thumbCanvas.toDataURL("image/jpeg", 0.7);
  const { width, height } = bitmap;
  bitmap.close();

  return {
    blob,
    previewUrl: URL.createObjectURL(blob),
    thumbnail,
    width,
    height,
    lowResolution: Math.min(width, height) < MIN_EDGE,
  };
}
