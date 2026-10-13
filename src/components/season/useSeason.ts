"use client";
import { useEffect, useState } from "react";
import type { SeasonData } from "@/lib/season";
import type { Place } from "@/services/nearMe/geocoder";

export type SeasonState = { status: "loading" } | { status: "ok"; data: SeasonData } | { status: "error" };

/** The snake season for a place, fetched once per place; null place = nothing to load. */
export function useSeason(place: Place | null): SeasonState | null {
  const key = place ? `${place.lat},${place.lng},${place.name}` : null;
  const [answer, setAnswer] = useState<{ key: string; state: SeasonState } | null>(null);

  useEffect(() => {
    if (!place || !key) return;
    const ctrl = new AbortController();
    const q = new URLSearchParams({ lat: String(place.lat), lng: String(place.lng), name: place.name });
    fetch(`/api/near-me/season?${q}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as { season?: SeasonData } | null;
        setAnswer({ key, state: r.ok && body?.season ? { status: "ok", data: body.season } : { status: "error" } });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setAnswer({ key, state: { status: "error" } });
      });
    return () => ctrl.abort();
  }, [key, place]);

  if (!key) return null;
  return answer?.key === key ? answer.state : { status: "loading" };
}

/** This month, 1–12, on the viewer's device. */
export const currentMonth = () => new Date().getMonth() + 1;
