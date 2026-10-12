"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Place } from "@/services/nearMe/geocoder";

/**
 * The last place chosen on Snakes near me, remembered on this device only. It is
 * a town's own (rounded) coordinates, from search or the nearest town to the
 * user, never the user's own position.
 */
const KEY = "serpent:near-me-place";
const listeners = new Set<() => void>();
/** Fallback for this page view when localStorage can't be written (private mode, blocked). */
let memory: string | null = null;

function read(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function parse(raw: string | null | undefined): Place | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Place;
    return typeof p?.name === "string" && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p : null;
  } catch {
    return null;
  }
}

/** [place, setPlace, ready]: `ready` is false during server rendering and hydration. */
export function usePlace(): [Place | null, (p: Place | null) => void, boolean] {
  // undefined on the server, string | null on the client
  const raw = useSyncExternalStore(subscribe, read, () => undefined);
  const set = useCallback((p: Place | null) => {
    memory = p ? JSON.stringify(p) : null;
    try {
      if (p) localStorage.setItem(KEY, memory!);
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: the choice lasts for this page view only */
    }
    listeners.forEach((l) => l());
  }, []);
  // Parsed once per stored value, so callers get the same object until the place changes.
  const place = useMemo(() => parse(raw), [raw]);
  return [place, set, raw !== undefined];
}
