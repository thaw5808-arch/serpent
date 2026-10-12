"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { History as HistoryIcon, ImageOff, Trash2 } from "lucide-react";
import { candidateHref, ResultView } from "@/components/identification/ResultView";
import { Button, ButtonLink } from "@/components/ui/Button";
import { VenomStatusBadge } from "@/components/ui/StatusBadge";
import { Link, useLocale, useT } from "@/i18n/client";
import { countryName, fmt, formatDateTime } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { candidateLabel } from "@/i18n/result";
import { clearHistory, deleteFromHistory, getSaveSetting, listHistory, setSaveSetting, type HistoryEntry } from "@/lib/history";

type Load =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; entries: HistoryEntry[]; saveEnabled: boolean };

/** What a row shows: the closest match, named exactly as on the result screen (names are never translated). */
function summary(entry: HistoryEntry, t: Messages) {
  const r = entry.result;
  const match = r.closestMatch ?? r.top;
  return {
    name: match ? candidateLabel(match, t) : t.history.noMatch,
    binomial: match?.scientificName ?? null,
    band: r.confidenceBand ?? match?.band ?? null,
    href: match ? candidateHref(match) : null,
  };
}

/** /history lists saved results; /history?entry=<id> shows one in the result view. */
export function HistoryScreen() {
  const t = useT();
  const entryId = useSearchParams().get("entry");
  const [load, setLoad] = useState<Load>({ status: "loading" });

  // Read on every showing: Next.js keeps this route mounted (hidden) across navigations,
  // and results saved meanwhile must appear when the user comes back.
  useEffect(() => {
    let live = true;
    Promise.all([listHistory(), getSaveSetting()]).then(([entries, saveEnabled]) => {
      if (!live) return;
      setLoad(entries && saveEnabled !== null ? { status: "ready", entries, saveEnabled } : { status: "unavailable" });
    });
    return () => {
      live = false;
    };
  }, []);

  if (entryId) {
    if (load.status === "loading") return <Loading />;
    const entry = load.status === "ready" ? load.entries.find((e) => e.id === entryId) : undefined;
    return <SavedEntry key={entryId} entry={entry} />;
  }

  return (
    <>
      <h1 className="type-h1">{t.history.title}</h1>
      <p className="mt-3 max-w-prose text-lead text-ink-2">{t.history.lead}</p>
      <div className="mt-8">
        {load.status === "loading" && <Loading />}
        {load.status === "unavailable" && (
          <div className="max-w-[720px] rounded-card border border-line bg-surface p-6">
            <h2 className="type-h2">{t.history.unavailableTitle}</h2>
            <p className="mt-2 text-ink-2">{t.history.unavailableBody}</p>
            <div className="mt-5">
              <ButtonLink href="/identify">{t.history.identifyCta}</ButtonLink>
            </div>
          </div>
        )}
        {load.status === "ready" && (
          <HistoryList
            entries={load.entries}
            saveEnabled={load.saveEnabled}
            onEntries={(entries) => setLoad({ ...load, entries })}
            onSaveEnabled={(saveEnabled) => setLoad({ ...load, saveEnabled })}
          />
        )}
      </div>
    </>
  );
}

function Loading() {
  const t = useT();
  return <div className="h-64 animate-pulse rounded-card bg-surface-2" role="status" aria-label={t.history.loading} />;
}

function HistoryList({
  entries,
  saveEnabled,
  onEntries,
  onSaveEnabled,
}: {
  entries: HistoryEntry[];
  saveEnabled: boolean;
  onEntries: (entries: HistoryEntry[]) => void;
  onSaveEnabled: (on: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);

  // A half-finished "clear all" and old messages shouldn't greet the user on their next visit.
  useLayoutEffect(
    () => () => {
      setConfirming(false);
      setStatus(null);
    },
    [],
  );

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  async function remove(entry: HistoryEntry) {
    if (!(await deleteFromHistory(entry.id))) return setStatus({ text: t.history.actionFailed, error: true });
    onEntries(entries.filter((e) => e.id !== entry.id));
    setStatus({ text: t.history.deleted, error: false });
    headingRef.current?.focus();
  }

  async function clearAll() {
    setConfirming(false);
    if (!(await clearHistory())) return setStatus({ text: t.history.actionFailed, error: true });
    onEntries([]);
    setStatus({ text: t.history.cleared, error: false });
    headingRef.current?.focus();
  }

  async function toggleSave() {
    const next = !saveEnabled;
    if (await setSaveSetting(next)) onSaveEnabled(next);
    else setStatus({ text: t.history.actionFailed, error: true });
  }

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-8">
      <section aria-labelledby="history-list" className="min-w-0 lg:col-span-7">
        <p
          role="status"
          className={status?.error ? "mb-4 rounded-badge border border-high-border bg-high-bg px-4 py-3 text-small text-high" : "sr-only"}
        >
          {status?.text}
        </p>
        {entries.length === 0 ? (
          <div className="rounded-card border border-line bg-surface p-6">
            <h2 id="history-list" ref={headingRef} tabIndex={-1} className="type-h2 outline-none">{t.history.emptyTitle}</h2>
            <p className="mt-2 text-ink-2">{t.history.emptyBody}</p>
            <div className="mt-5">
              <ButtonLink href="/identify">{t.history.identifyCta}</ButtonLink>
            </div>
          </div>
        ) : (
          <>
            <h2 id="history-list" ref={headingRef} tabIndex={-1} className="type-h3 outline-none">
              {entries.length === 1 ? t.history.countOne : fmt(t.history.countMany, { n: entries.length })}
            </h2>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {entries.map((entry) => {
                const s = summary(entry, t);
                const date = formatDateTime(entry.savedAt, locale);
                const country = countryName(entry.country, locale);
                return (
                  <li key={entry.id} className="flex items-center gap-2">
                    <Link
                      href={`/history?entry=${encodeURIComponent(entry.id)}`}
                      className="flex min-w-0 flex-1 items-start gap-4 py-4 pr-2 hover:bg-surface-2 sm:px-2"
                    >
                      <Thumb src={entry.thumbnails[0]} />
                      <span className="min-w-0 flex-1">
                        <span className="type-name block break-words text-[1.125rem]">{s.name}</span>
                        {s.binomial && <span className="binomial block text-small text-ink-2">{s.binomial}</span>}
                        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <VenomStatusBadge status={entry.result.displayVenomStatus} />
                          {s.band && <span className="text-small font-medium">{t.band[s.band]}</span>}
                        </span>
                        <span className="mt-1 block text-caption text-ink-2">
                          {date}
                          {country && ` · ${country}`}
                        </span>
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(entry)}
                      aria-label={fmt(t.history.deleteEntry, { name: s.name, date })}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-card text-ink-2 transition-colors hover:bg-surface-2 hover:text-high"
                    >
                      <Trash2 aria-hidden className="size-5" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6">
              {confirming ? (
                <div
                  ref={confirmRef}
                  tabIndex={-1}
                  role="group"
                  aria-labelledby="clear-confirm"
                  className="rounded-card border border-high-border bg-high-bg p-4 outline-none sm:p-5"
                >
                  <p id="clear-confirm" className="text-small font-medium text-high">{t.history.clearConfirm}</p>
                  <div className="mt-4 grid gap-3 sm:flex sm:flex-wrap">
                    <Button variant="secondary" onClick={clearAll}>
                      <Trash2 aria-hidden className="size-4" /> {t.history.clearConfirmButton}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setConfirming(false);
                        requestAnimationFrame(() => clearRef.current?.focus());
                      }}
                    >
                      {t.common.cancel}
                    </Button>
                  </div>
                </div>
              ) : (
                // A text action flush with the list edge (Button's padding would indent it).
                <button
                  ref={clearRef}
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="inline-flex min-h-11 items-center gap-2 font-medium text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline"
                >
                  <Trash2 aria-hidden className="size-4 shrink-0" /> {t.history.clearAll}
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <aside aria-labelledby="history-settings" className="min-w-0 rounded-card border border-line bg-surface p-5 lg:sticky lg:top-24 lg:col-span-5">
        <h2 id="history-settings" className="type-h3">{t.history.settingsTitle}</h2>
        <div className="mt-3">
          <SaveSwitch on={saveEnabled} onToggle={toggleSave} />
        </div>
        <p className="mt-4 border-t border-divider pt-4 text-small text-ink-2">
          {t.history.privacyNote}{" "}
          <Link href="/privacy" className="font-medium text-ink underline underline-offset-4">{t.history.privacyLink}</Link>
        </p>
      </aside>
    </div>
  );
}

/** The first photo of a saved result, or a placeholder when none was kept. Decorative: the row's text names it. */
function Thumb({ src }: { src: string | undefined }) {
  const box = "size-18 shrink-0 rounded-badge border border-line bg-surface-2 sm:size-20";
  if (!src) {
    return (
      <span className={`${box} inline-flex items-center justify-center text-ink-2`}>
        <ImageOff aria-hidden className="size-5" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- on-device data URL
  return <img src={src} alt="" className={`${box} object-cover`} />;
}

function SaveSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const t = useT();
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p id={`${id}-label`} className="font-medium">{t.history.saveSetting}</p>
        <p id={`${id}-hint`} className="mt-1 text-small text-ink-2">{t.history.saveSettingHint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        onClick={onToggle}
        className="-mr-2 inline-flex h-11 w-16 shrink-0 items-center justify-center rounded-card"
      >
        <span
          aria-hidden
          className={`relative inline-block h-7 w-12 rounded-full border transition-colors ${on ? "border-moss bg-moss" : "border-ink-2 bg-surface-2"}`}
        >
          <span
            className={`absolute left-0 top-1/2 size-5 -translate-y-1/2 rounded-full transition-transform ${
              on ? "translate-x-[23px] bg-moss-ink" : "translate-x-[3px] bg-ink-2"
            }`}
          />
        </span>
      </button>
    </div>
  );
}

/** One saved result in the normal result view, marked as saved and possibly out of date. */
function SavedEntry({ entry }: { entry: HistoryEntry | undefined }) {
  const t = useT();
  const locale = useLocale();
  const noteRef = useRef<HTMLDivElement>(null);

  // Opening a row: start reading at the note, for keyboard and screen-reader users.
  useEffect(() => {
    noteRef.current?.focus();
  }, []);

  const back = (
    <Link href="/history" className="inline-flex min-h-11 items-center text-small font-medium text-ink-2 hover:text-ink">
      {t.history.back}
    </Link>
  );

  if (!entry) {
    return (
      <>
        {back}
        <div ref={noteRef} tabIndex={-1} className="mt-2 max-w-[720px] rounded-card border border-line bg-surface p-6 outline-none">
          <h1 className="type-h2">{t.history.notFoundTitle}</h1>
          <p className="mt-2 text-ink-2">{t.history.notFoundBody}</p>
        </div>
      </>
    );
  }

  const s = summary(entry, t);
  return (
    <>
      {back}
      <h1 className="sr-only">{t.history.savedSr}</h1>
      <div
        ref={noteRef}
        tabIndex={-1}
        className="mb-6 mt-2 flex items-start gap-3 rounded-card border border-line bg-surface-2 px-4 py-3 text-small outline-none"
      >
        <HistoryIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-2" />
        <p>
          {fmt(t.history.savedFrom, { date: formatDateTime(entry.savedAt, locale) })}
          {s.href && (
            <>
              {" "}
              <Link href={s.href} className="font-medium underline underline-offset-4">
                {fmt(t.history.currentSpecies, { name: s.name })}
              </Link>
            </>
          )}
        </p>
      </div>
      <ResultView result={entry.result} thumbnails={entry.thumbnails} />
    </>
  );
}
