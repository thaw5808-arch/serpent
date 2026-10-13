"use client";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Clock, Printer, Trash2 } from "lucide-react";
import { EmergencyCallBar } from "@/components/safety/EmergencyBar";
import { Button } from "@/components/ui/Button";
import { useLocale, useT } from "@/i18n/client";
import { LOCALES, type Locale } from "@/i18n/config";
import { fmt, formatTime } from "@/i18n/format";
import {
  BITE_LOCATIONS,
  cardIdFor,
  FIRST_AID,
  newCard,
  SYMPTOMS,
  TELL_DOCTOR,
  toggleSymptom,
  type CardDicts,
  type DoctorCard,
  type FirstAid,
} from "@/lib/doctorCard";
import { deleteDoctorCard, getDoctorCard, saveDoctorCard } from "@/lib/doctorCardStore";
import { getSaveSetting, listHistory, type SavedResult } from "@/lib/history";
import { loadDescribed, loadResult, thumbnailsOf } from "@/lib/resultStore";
import { CardView, elapsedText } from "./CardView";

/*
 * Everything here runs on this device: the result comes from this tab's session or
 * History, the card is kept in IndexedDB, and nothing is fetched or uploaded.
 */

/** Labels of the card language switch, each in its own script. */
const LANGUAGE_LABELS: Record<Locale, string> = { en: "EN", th: "ไทย", my: "မြန်မာ" };

/** Each card language's font, with a character that needs it. */
const CARD_FONTS = [
  ["Noto Sans Thai Variable", "ก"],
  ["Noto Sans Myanmar Variable", "က"],
] as const;

/** Saves are batched while typing. */
const SAVE_DELAY_MS = 300;

/** The result a card is for: this tab's latest photo or description result, else History. */
async function findSource(id: string): Promise<{ result: SavedResult; thumbnails: string[] } | null> {
  const latest = loadResult();
  if (latest?.result.id === id) return { result: latest.result, thumbnails: thumbnailsOf(latest) };
  const described = loadDescribed();
  if (described?.id === id) return { result: described, thumbnails: [] };
  const entry = (await listHistory())?.find((e) => e.id === id);
  return entry ? { result: entry.result, thumbnails: entry.thumbnails } : null;
}

/** The saved card for this result (or for no result), else a new one. */
async function loadCard(resultId: string | null, siteLocale: Locale): Promise<DoctorCard> {
  const saved = await getDoctorCard(cardIdFor(resultId));
  if (saved) return saved;
  const source = resultId ? await findSource(resultId) : null;
  return newCard(resultId, source?.result ?? null, source?.thumbnails ?? [], siteLocale);
}

/** `datetime-local` value for an ISO time, in this device's time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The current time, ticking every 30 s for the "X h Y min ago" text. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

type Storage = "unknown" | "ok" | "failed";

export function DoctorCardScreen({ dicts }: { dicts: CardDicts }) {
  const t = useT();
  const siteLocale = useLocale();
  const resultId = useSearchParams().get("result");
  const [card, setCard] = useState<DoctorCard | null>(null);
  const [mode, setMode] = useState<"fill" | "card">("fill");
  const [storage, setStorage] = useState<Storage>("unknown");
  const [saveOff, setSaveOff] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const now = useNow();
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Load every card language's font now, so switching the card's language later needs no network.
  useEffect(() => {
    for (const [family, sample] of CARD_FONTS) void document.fonts?.load(`16px "${family}"`, sample).catch(() => undefined);
  }, []);

  useEffect(() => {
    let live = true;
    void loadCard(resultId, siteLocale).then((loaded) => {
      if (!live) return;
      setCard(loaded);
      setMode(loaded.biteTime ? "card" : "fill");
    });
    void getSaveSetting().then((on) => live && setSaveOff(on === false));
    return () => {
      live = false;
    };
  }, [resultId, siteLocale]);

  // Write the latest card shortly after each change, and on leaving the page.
  const persist = useCallback((next: DoctorCard) => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      void saveDoctorCard(next).then((ok) => setStorage(ok ? "ok" : "failed"));
    }, SAVE_DELAY_MS);
  }, []);

  function update(change: (c: DoctorCard) => DoctorCard) {
    if (!card) return;
    const next = { ...change(card), updatedAt: new Date().toISOString() };
    setCard(next);
    persist(next);
    setStatus(null);
  }

  // Leaving (or Next.js hiding the route): write any change still waiting.
  const latest = useRef(card);
  useEffect(() => {
    latest.current = card;
  }, [card]);
  useEffect(
    () => () => {
      if (!pending.current) return;
      clearTimeout(pending.current);
      pending.current = null;
      if (latest.current) void saveDoctorCard(latest.current);
    },
    [],
  );

  async function remove() {
    if (!card) return;
    if (pending.current) clearTimeout(pending.current);
    setConfirming(false);
    await deleteDoctorCard(card.id);
    // A fresh card for the same result; the bite details are gone from this device.
    setCard(newCard(card.resultId, card.source, card.thumbnails, siteLocale));
    setStorage("unknown");
    setMode("fill");
    setStatus(t.doctorCard.deleted);
    headingRef.current?.focus();
  }

  if (!card) {
    return <div role="status" aria-label={t.doctorCard.loading} className="mt-8 h-64 animate-pulse rounded-card bg-surface-2" />;
  }

  const cardT = dicts[card.cardLocale];
  const ago = elapsedText(card, t, now);

  return (
    <>
      <div className="no-print space-y-4">
        <div role="alert" className="rounded-card bg-emergency p-4 text-emergency-ink sm:p-5">
          <p className="type-h3">{t.doctorCard.urgent}</p>
        </div>
        <EmergencyCallBar />
      </div>

      <h1 ref={headingRef} tabIndex={-1} className="no-print type-h1 mt-8 outline-none">{t.doctorCard.pageTitle}</h1>
      <p className="no-print mt-2 max-w-prose text-lead text-ink-2">{t.doctorCard.lead}</p>
      <p role="status" className={status ? "no-print mt-4 rounded-badge border border-line bg-surface-2 px-4 py-3 text-small" : "sr-only"}>
        {status}
      </p>

      <div className="no-print mt-6 flex flex-wrap items-end justify-between gap-4">
        <LanguageSwitch value={card.cardLocale} onChange={(cardLocale) => update((c) => ({ ...c, cardLocale }))} />
        <div role="group" aria-label={t.doctorCard.modeLabel} className="dc-mode lg:hidden">
          {(["fill", "card"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === "fill" ? t.doctorCard.modeFill : t.doctorCard.modeCard}
            </button>
          ))}
        </div>
      </div>

      <div className="dc-grid mt-6 grid gap-8 lg:grid-cols-2 lg:items-start">
        <form
          aria-labelledby="dc-fill"
          onSubmit={(e) => e.preventDefault()}
          className={`no-print space-y-8 rounded-card border border-line bg-surface p-5 sm:p-6 ${mode === "card" ? "hidden lg:block" : ""}`}
        >
          <h2 id="dc-fill" className="type-h2">{t.doctorCard.fillTitle}</h2>
          <BiteTime card={card} ago={ago} onChange={(biteTime) => update((c) => ({ ...c, biteTime }))} />

          <Group legend={t.doctorCard.location}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {BITE_LOCATIONS.map((l) => (
                <label key={l} className="opt-card">
                  <input type="radio" name="dc-location" className="opt-input" checked={card.location === l} onChange={() => update((c) => ({ ...c, location: l }))} />
                  <span>{t.doctorCard.locations[l]}</span>
                </label>
              ))}
            </div>
          </Group>

          <Group legend={t.doctorCard.symptoms} hint={t.doctorCard.symptomsHint}>
            <div className="grid gap-3 sm:grid-cols-2">
              {SYMPTOMS.map((s) => {
                const ticked = card.symptoms.find((x) => x.key === s);
                return (
                  <label key={s} className="opt-card">
                    <input type="checkbox" className="opt-input" checked={Boolean(ticked)} onChange={() => update((c) => ({ ...c, symptoms: toggleSymptom(c.symptoms, s) }))} />
                    <span className="min-w-0">
                      {t.doctorCard.symptomItems[s]}
                      {ticked && <span className="block text-small text-ink-2">{fmt(t.doctorCard.since, { time: formatTime(ticked.at, siteLocale) })}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </Group>

          <Group legend={t.doctorCard.firstAid}>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIRST_AID.map((f) => (
                <label key={f} className="opt-card">
                  <input
                    type="checkbox"
                    className="opt-input"
                    checked={card.firstAid.includes(f)}
                    onChange={() => update((c) => ({ ...c, firstAid: toggle(c.firstAid, f) }))}
                  />
                  <span className="min-w-0">
                    {t.doctorCard.firstAidItems[f]}
                    {TELL_DOCTOR.has(f) && <span className="dc-flag">{t.doctorCard.tellDoctor}</span>}
                  </span>
                </label>
              ))}
            </div>
          </Group>

          <Group legend={t.doctorCard.patient}>
            <div className="space-y-4">
              <TextField label={t.doctorCard.patientName} value={card.patientName} onChange={(patientName) => update((c) => ({ ...c, patientName }))} autoComplete="name" />
              <TextField label={t.doctorCard.allergies} value={card.allergies} onChange={(allergies) => update((c) => ({ ...c, allergies }))} />
              <TextField label={t.doctorCard.notes} value={card.notes} onChange={(notes) => update((c) => ({ ...c, notes }))} multiline />
            </div>
          </Group>
        </form>

        <div className="dc-column space-y-4 lg:sticky lg:top-24">
          {/* On phones, "Fill in" hides the card on screen (never in print); the actions stay. */}
          <div className={mode === "fill" ? "hidden lg:block print:block" : ""}>
            <CardView card={card} t={cardT} locale={card.cardLocale} now={now} />
          </div>
          <div className="no-print space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button onClick={() => window.print()}>
                <Printer aria-hidden className="size-5" /> {t.doctorCard.savePdf}
              </Button>
              {confirming ? null : (
                <Button variant="secondary" onClick={() => setConfirming(true)} className="sm:min-h-15">
                  <Trash2 aria-hidden className="size-4" /> {t.doctorCard.deleteCard}
                </Button>
              )}
            </div>
            {confirming && (
              <div role="group" aria-labelledby="dc-delete" className="rounded-card border border-high-border bg-high-bg p-4">
                <p id="dc-delete" className="text-small font-medium text-high">{t.doctorCard.deleteConfirm}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={remove}>
                    <Trash2 aria-hidden className="size-4" /> {t.doctorCard.deleteConfirmButton}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)}>{t.common.cancel}</Button>
                </div>
              </div>
            )}
            <p className="text-small text-ink-2">
              {storage === "failed" ? t.doctorCard.storageUnavailable : t.doctorCard.savedHere}
            </p>
            {saveOff && <p className="text-small text-ink-2">{fmt(t.doctorCard.saveOff, { setting: t.history.saveSetting })}</p>}
          </div>
        </div>
      </div>
    </>
  );
}

const toggle = (list: FirstAid[], f: FirstAid) => (list.includes(f) ? list.filter((x) => x !== f) : [...list, f]);

function Group({ legend, hint, children }: { legend: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <fieldset aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend className="type-h3">{legend}</legend>
      {hint && <p id={`${id}-hint`} className="mt-1 text-small text-ink-2">{hint}</p>}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

function BiteTime({ card, ago, onChange }: { card: DoctorCard; ago: string | null; onChange: (iso: string | null) => void }) {
  const t = useT();
  const id = useId();
  return (
    <fieldset aria-describedby={`${id}-ago`}>
      <legend className="type-h3">
        {t.doctorCard.biteTime} <span className="text-small font-normal text-ink-2">{t.doctorCard.required}</span>
      </legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:items-end">
        <Button type="button" onClick={() => onChange(new Date().toISOString())}>
          <Clock aria-hidden className="size-5" /> {t.doctorCard.bittenNow}
        </Button>
        <div>
          <label htmlFor={`${id}-time`} className="eyebrow block">{t.doctorCard.pickTime}</label>
          <input
            id={`${id}-time`}
            type="datetime-local"
            value={toLocalInput(card.biteTime)}
            max={toLocalInput(new Date().toISOString())}
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
            className="mt-1.5 min-h-14 w-full rounded-card border border-line bg-field px-4 text-body text-ink hover:border-ink-2 focus:border-gold-light"
          />
        </div>
      </div>
      <p id={`${id}-ago`} className={`mt-3 text-lead font-semibold ${card.biteTime ? "" : "text-ink-2"}`}>
        {ago ?? t.doctorCard.noBiteTime}
      </p>
    </fieldset>
  );
}

function TextField({ label, value, onChange, multiline = false, autoComplete }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; autoComplete?: string }) {
  const id = useId();
  const cls = "mt-1.5 w-full rounded-card border border-line bg-field px-4 text-body text-ink hover:border-ink-2 focus:border-gold-light";
  return (
    <div>
      <label htmlFor={id} className="block font-medium">{label}</label>
      {multiline ? (
        <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} className={`${cls} py-3`} />
      ) : (
        <input id={id} type="text" value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} className={`${cls} min-h-14`} />
      )}
    </div>
  );
}

/** EN / ไทย / မြန်မာ as real radio buttons; the card's language only, not the site's. */
function LanguageSwitch({ value, onChange }: { value: Locale; onChange: (l: Locale) => void }) {
  const t = useT();
  const id = useId();
  return (
    <fieldset aria-describedby={`${id}-hint`} className="min-w-0">
      <legend className="font-semibold">{t.doctorCard.cardLanguage}</legend>
      <p id={`${id}-hint`} className="mt-0.5 max-w-md text-small text-ink-2">{t.doctorCard.cardLanguageHint}</p>
      <div className="dc-lang mt-2">
        {LOCALES.map((l) => (
          <label key={l} lang={l}>
            <input type="radio" name="dc-card-language" value={l} checked={value === l} onChange={() => onChange(l)} />
            <span>{LANGUAGE_LABELS[l]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
