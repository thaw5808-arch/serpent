"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { roundCoord } from "@/lib/geo";
import type { Place } from "@/services/nearMe/geocoder";

/** Wait for a pause in typing, and three characters, before asking: Photon's public server asks for light use. */
const DEBOUNCE_MS = 350;
const MIN_CHARS = 3;

type Found = { term: string; places: Place[]; failed: boolean };
type Locate = "idle" | "locating" | "denied" | "unavailable" | "noPlace";

const placeDetail = (p: Place) => [p.region, p.country].filter(Boolean).join(", ");

/** City search (a combobox with a list of matches) and "Use my location". */
export function CityPicker({ onPick, autoFocus = false }: { onPick: (p: Place) => void; autoFocus?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [locate, setLocate] = useState<Locate>("idle");

  const term = text.trim().replace(/\s+/g, " ");
  const searchable = term.length >= MIN_CHARS;

  useEffect(() => {
    if (!searchable) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/near-me/places?${new URLSearchParams({ q: term, lang: locale })}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ places: Place[] }>) : Promise.reject(new Error(String(r.status)))))
        .then((b) => setFound({ term, places: b.places, failed: false }))
        .catch(() => {
          if (!ctrl.signal.aborted) setFound({ term, places: [], failed: true });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [term, searchable, locale]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const current = searchable && found?.term === term ? found : null;
  const places = current?.places ?? [];
  const expanded = open && searchable;
  const status = !current ? t.nearMe.searching : current.failed ? t.nearMe.placesUnavailable : places.length === 0 ? t.nearMe.noPlaces : null;

  function pick(p: Place) {
    setOpen(false);
    setActive(-1);
    setText("");
    onPick(p);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (places.length) setActive((a) => (e.key === "ArrowDown" ? (a + 1) % places.length : (a <= 0 ? places.length : a) - 1));
    } else if (e.key === "Enter" && expanded && places.length) {
      e.preventDefault();
      pick(places[Math.max(active, 0)]);
    } else if (e.key === "Escape") {
      if (expanded) setOpen(false);
      else setText("");
      setActive(-1);
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) return setLocate("unavailable");
    setLocate("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Rounded here, before it leaves the device; the server rounds again and keeps nothing.
        const q = new URLSearchParams({ lat: String(roundCoord(pos.coords.latitude)), lng: String(roundCoord(pos.coords.longitude)), lang: locale });
        fetch(`/api/near-me/reverse?${q}`)
          .then((r) => (r.ok ? (r.json() as Promise<{ place: Place | null }>) : Promise.reject(new Error(String(r.status)))))
          .then(({ place }) => {
            if (!place) return setLocate("noPlace");
            setLocate("idle");
            onPick(place);
          })
          .catch(() => setLocate("unavailable"));
      },
      (err) => setLocate(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      // A coarse fix is all that's needed; it is rounded to about 11 km anyway.
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 15_000 },
    );
  }

  const locateMessage = { denied: t.nearMe.locationDenied, unavailable: t.nearMe.locationUnavailable, noPlace: t.nearMe.locationNoPlace }[
    locate as "denied" | "unavailable" | "noPlace"
  ];

  return (
    <div className="space-y-4">
      <div className="relative">
        <label htmlFor={`${id}-input`} className="eyebrow block">{t.nearMe.searchLabel}</label>
        <div className="relative mt-1.5">
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-2" />
          <input
            ref={inputRef}
            id={`${id}-input`}
            type="text"
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={expanded && active >= 0 ? `${id}-opt-${active}` : undefined}
            autoComplete="off"
            enterKeyHint="search"
            placeholder={t.nearMe.searchPlaceholder}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            className="min-h-14 w-full rounded-card border border-line bg-field pl-12 pr-4 text-body text-ink placeholder:text-[var(--muted)] hover:border-ink-2 focus:border-gold-light"
          />
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label={t.nearMe.searchLabel}
          hidden={!expanded}
          className="fd-panel"
        >
          {status ? (
            <li role="presentation" className="px-5 py-3 text-small text-ink-2" aria-live="polite">{status}</li>
          ) : (
            places.map((p, i) => (
              <li
                key={`${p.name}|${p.region}|${p.countryCode}`}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                data-active={i === active ? "" : undefined}
                // mousedown, so the pick lands before the input's blur closes the list
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
                className="fd-option py-2"
              >
                <MapPin aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{p.name}</span>
                  {placeDetail(p) && <span className="block text-small text-ink-2">{placeDetail(p)}</span>}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locate === "locating"}
          className="inline-flex min-h-11 items-center gap-2 font-medium text-ink underline-offset-4 hover:underline disabled:cursor-wait disabled:opacity-60"
        >
          <LocateFixed aria-hidden className="size-4 shrink-0" />
          {locate === "locating" ? t.nearMe.locating : t.nearMe.useLocation}
        </button>
        <p className="text-caption text-ink-2">{t.nearMe.locationNote}</p>
        {locateMessage && (
          <p role="alert" className="rounded-badge border border-caution/30 bg-caution-bg px-4 py-3 text-small text-caution">{locateMessage}</p>
        )}
      </div>
    </div>
  );
}
