"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { COUNTRY_COOKIE } from "@/i18n/config";

const KEY = "serpent:country";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
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

/**
 * Mirrors the country into a cookie so a first visit to an unprefixed URL can pick
 * Thai or Burmese from it (src/proxy.ts). The privacy page says so.
 */
function writeCookie(code: string) {
  document.cookie = code
    ? `${COUNTRY_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    : `${COUNTRY_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/** User-chosen country, remembered on this device. "" means location unknown. */
export function useCountry(): [string, (code: string) => void] {
  const value = useSyncExternalStore(subscribe, read, () => "");
  // Countries saved before the cookie existed get mirrored once they are read.
  useEffect(() => {
    if (value && !document.cookie.includes(`${COUNTRY_COOKIE}=${value}`)) writeCookie(value);
  }, [value]);
  const set = useCallback((code: string) => {
    try {
      if (code) localStorage.setItem(KEY, code);
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: selection lasts for this view only */
    }
    writeCookie(code);
    listeners.forEach((l) => l());
  }, []);
  return [value, set];
}
