"use client";
import { useMemo, useSyncExternalStore } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { useT } from "@/i18n/client";
import { thumbnailsOf, type StoredResult } from "@/lib/resultStore";
import { ResultView } from "./ResultView";

const KEY = "serpent:result";
const subscribe = () => () => {};
const read = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export function ResultScreen() {
  const t = useT();
  // undefined on the server, string|null on the client
  const raw = useSyncExternalStore(subscribe, read, () => undefined);
  const stored = useMemo<StoredResult | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredResult;
    } catch {
      return null;
    }
  }, [raw]);

  if (raw === undefined) {
    return <div className="h-64 animate-pulse rounded-card bg-surface-2" aria-label={t.result.loading} />;
  }

  if (!stored) {
    return (
      <div className="mx-auto max-w-[720px] rounded-card border border-line bg-surface p-6">
        <h2 className="type-h2">{t.result.noResultTitle}</h2>
        <p className="mt-2 text-ink-2">{t.result.noResultBody}</p>
        <div className="mt-5">
          <ButtonLink href="/identify">{t.result.identifyCta}</ButtonLink>
        </div>
      </div>
    );
  }

  return <ResultView result={stored.result} thumbnails={thumbnailsOf(stored)} />;
}
