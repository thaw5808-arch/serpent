"use client";
import type { IdentificationResult } from "@/types";

/**
 * The latest result lives in sessionStorage only: it survives a refresh, is
 * scoped to this tab, and disappears when the tab closes. Nothing is persisted
 * server-side except an anonymous log row (no image).
 */
const KEY = "serpent:result";

export interface StoredResult {
  result: IdentificationResult;
  /** First photo's thumbnail (kept for results saved before multi-photo support). */
  thumbnail: string | null;
  /** Thumbnails of every photo analysed, in upload order. */
  thumbnails?: string[];
}

export function saveResult(result: IdentificationResult, thumbnails: string[]) {
  // Thumbnails may exceed the storage quota; fall back to fewer, then none.
  for (const keep of [thumbnails, thumbnails.slice(0, 1), []]) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ result, thumbnail: keep[0] ?? null, thumbnails: keep }));
      return;
    } catch {
      /* try with fewer thumbnails */
    }
  }
}

export function thumbnailsOf(stored: StoredResult): string[] {
  return stored.thumbnails ?? (stored.thumbnail ? [stored.thumbnail] : []);
}

export function loadResult(): StoredResult | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredResult) : null;
  } catch {
    return null;
  }
}

export function clearResult() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
