import { describe, expect, it } from "vitest";
import { sniffImageType, validateImageBytes, MAX_UPLOAD_BYTES } from "@/lib/imageValidation";
import { rateLimit, __resetRateLimit } from "@/lib/rateLimit";

const pad = (head: number[], size = 4096) => {
  const b = new Uint8Array(size);
  b.set(head);
  return b;
};

describe("image validation", () => {
  it("detects JPEG, PNG and WebP by magic bytes", () => {
    expect(sniffImageType(pad([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(sniffImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });
  it("rejects SVG, HTML and executables regardless of claimed type", () => {
    expect(validateImageBytes(pad([...new TextEncoder().encode("<svg xmlns")])).ok).toBe(false);
    expect(validateImageBytes(pad([...new TextEncoder().encode("<!DOCTYPE html>")])).ok).toBe(false);
    expect(validateImageBytes(pad([0x4d, 0x5a])).ok).toBe(false);
  });
  it("enforces size limits", () => {
    expect(validateImageBytes(pad([0xff, 0xd8, 0xff], 100)).ok).toBe(false);
    const big = validateImageBytes(pad([0xff, 0xd8, 0xff], MAX_UPLOAD_BYTES + 1));
    expect(big.ok === false && big.status).toBe(413);
  });
});

describe("rate limiting", () => {
  it("blocks after the limit within the window and resets after", () => {
    __resetRateLimit();
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, t).allowed).toBe(true);
    expect(rateLimit("k", 3, 1000, t + 10).allowed).toBe(false);
    expect(rateLimit("k", 3, 1000, t + 1001).allowed).toBe(true);
  });
});
