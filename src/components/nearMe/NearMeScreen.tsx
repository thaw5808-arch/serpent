"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Phone, RotateCcw, Siren } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { VenomStatusBadge } from "@/components/ui/StatusBadge";
import { getCountry } from "@/data/countries";
import { Link, useLocale, useT } from "@/i18n/client";
import { countryName, fmt, formatDate, formatYear } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { venomBasisText } from "@/i18n/result";
import type { Place } from "@/services/nearMe/geocoder";
import type { Sightings } from "@/services/nearMe";
import type { NearbySnake } from "@/services/nearMe/classify";
import { CityPicker } from "./CityPicker";
import { usePlace } from "./usePlace";

type Answer = { key: string } & ({ ok: true; data: Sightings } | { ok: false; code: string });

/** Shown once a lookup has taken this long: a new area makes one GBIF request per species. */
const SLOW_MS = 4000;

const placeKey = (p: Place) => `${p.lat},${p.lng},${p.name},${p.countryCode ?? ""}`;

export function NearMeScreen() {
  const t = useT();
  const [place, setPlace, ready] = usePlace();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [slowKey, setSlowKey] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const key = place ? `${placeKey(place)}#${attempt}` : null;

  useEffect(() => {
    if (!place || !key) return;
    const ctrl = new AbortController();
    const slow = setTimeout(() => setSlowKey(key), SLOW_MS);
    const q = new URLSearchParams({ lat: String(place.lat), lng: String(place.lng), name: place.name, cc: place.countryCode ?? "" });
    fetch(`/api/near-me?${q}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as (Sightings & { code?: string }) | null;
        setAnswer(r.ok && body ? { key, ok: true, data: body } : { key, ok: false, code: body?.code ?? "unavailable" });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setAnswer({ key, ok: false, code: "unavailable" });
      })
      .finally(() => clearTimeout(slow));
    return () => {
      clearTimeout(slow);
      ctrl.abort();
    };
  }, [key, place]);

  function choose(p: Place) {
    setChanging(false);
    setPlace(p);
  }

  if (!ready) return <div className="h-64 animate-pulse rounded-card bg-surface-2" aria-label={t.nearMe.loading} />;

  if (!place || changing) {
    return (
      <>
        <h1 className="type-h1">{t.nearMe.title}</h1>
        <p className="mt-3 max-w-prose text-lead text-ink-2">{t.nearMe.lead}</p>
        <div className="mt-8 max-w-[560px] rounded-card border border-line bg-surface p-5 sm:p-6">
          <CityPicker onPick={choose} autoFocus={changing} />
          {changing && (
            <button
              type="button"
              onClick={() => setChanging(false)}
              className="mt-2 inline-flex min-h-11 items-center font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline"
            >
              {t.common.cancel}
            </button>
          )}
        </div>
        <Credits />
      </>
    );
  }

  const current = answer?.key === key ? answer : null;

  return (
    <>
      <h1 className="type-h1">{fmt(t.nearMe.heading, { city: place.name })}</h1>
      <p className="mt-3 max-w-prose text-lead text-ink-2">{t.nearMe.basis}</p>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 text-small text-ink-2">
        <span>{[place.region, place.country].filter(Boolean).join(", ")}</span>
        <button type="button" onClick={() => setChanging(true)} className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4">
          {t.nearMe.change}
        </button>
      </p>

      <div className="mt-8" aria-busy={!current}>
        {!current && (
          <div role="status" className="space-y-3">
            <p className="text-small text-ink-2">{slowKey === key ? t.nearMe.loadingSlow : t.nearMe.loading}</p>
            <div className="h-40 animate-pulse rounded-card bg-surface-2" />
          </div>
        )}
        {current && !current.ok && (
          <div className="max-w-[720px] rounded-card border border-line bg-surface p-6">
            <p role="alert" className="type-h3">{current.code === "rate_limited" ? t.nearMe.rateLimited : t.nearMe.unavailable}</p>
            <div className="mt-4">
              <Button variant="secondary" onClick={() => setAttempt((a) => a + 1)}>
                <RotateCcw aria-hidden className="size-4" /> {t.common.tryAgain}
              </Button>
            </div>
          </div>
        )}
        {current?.ok && <Results data={current.data} />}
      </div>

      <Emergency countryCode={place.countryCode} />
      {current?.ok && <Credits data={current.data} />}
      {!current?.ok && <Credits />}
    </>
  );
}

function Results({ data }: { data: Sightings }) {
  const t = useT();
  if (data.dangerous.length === 0 && data.other.length === 0) {
    return <p className="max-w-[720px] rounded-card border border-line bg-surface p-6 type-h3">{t.nearMe.noRecords}</p>;
  }
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-8">
      <section aria-labelledby="near-dangerous" className="min-w-0">
        <h2 id="near-dangerous" className="type-h2">{t.nearMe.dangerousTitle}</h2>
        <p className="mt-1 text-small text-ink-2">{data.dangerous.length ? t.nearMe.dangerousLead : t.nearMe.noneDangerous}</p>
        {data.dangerous.length > 0 && <SnakeList rows={data.dangerous} />}
      </section>
      {data.other.length > 0 && (
        <section aria-labelledby="near-other" className="min-w-0">
          <h2 id="near-other" className="type-h2">{t.nearMe.otherTitle}</h2>
          <p className="mt-1 text-small text-ink-2">{t.nearMe.otherLead}</p>
          <SnakeList rows={data.other} />
        </section>
      )}
    </div>
  );
}

/** The row's name, untranslated: common name, or the venom group's name, or "a species not in our database". */
function rowName(r: NearbySnake, t: Messages): string {
  if (r.commonName) return r.commonName;
  if (r.kind === "group" && r.venomGroup) return fmt(t.candidate[r.venomGroup.rank], { common: r.venomGroup.commonName, name: r.venomGroup.name });
  return t.candidate.notInDatabase;
}

function SnakeList({ rows }: { rows: NearbySnake[] }) {
  const t = useT();
  const locale = useLocale();
  return (
    <ul className="mt-4 divide-y divide-line border-y border-line">
      {rows.map((r) => {
        const name = rowName(r, t);
        // Where venom data came from, when it's a genus or family rather than the species. (Not assessed is in the badge.)
        const basis = r.venomGroup ? venomBasisText(r, t, locale) : null;
        return (
          <li key={r.id} className="py-4">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="type-name break-words text-[1.125rem]">
                  {r.href ? (
                    <Link href={r.href} className="underline-offset-4 hover:underline">{name}</Link>
                  ) : (
                    name
                  )}
                </p>
                <p className="binomial text-small text-ink-2">{r.scientificName}</p>
              </div>
              <p className="shrink-0 text-right text-small tabular-nums">
                <span className="font-semibold">{r.records === 1 ? t.nearMe.recordsOne : fmt(t.nearMe.recordsMany, { n: r.records })}</span>
                {r.lastYear && <span className="block text-caption text-ink-2">{fmt(t.nearMe.lastRecorded, { year: formatYear(r.lastYear, locale) })}</span>}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge row={r} />
              {r.medicalRisk && r.venomStatus !== "non_venomous" && (
                <span className="text-small font-medium">{fmt(t.risk.riskLabel, { risk: t.risk[r.medicalRisk] })}</span>
              )}
            </div>
            {basis && <p className="mt-1 text-caption text-ink-2">{basis}</p>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Our venom status, never GBIF's. Not assessed is shown as potentially venomous; a
 * non-venomous species keeps the result screen's "most likely" qualifier.
 */
function Badge({ row }: { row: NearbySnake }) {
  const t = useT();
  if (row.venomStatus === null) return <VenomStatusBadge status="potentially_venomous" label={t.nearMe.notAssessed} />;
  return <VenomStatusBadge status={row.venomStatus} />;
}

/** "I've been bitten", with the emergency number for the city's country when we have a verified one. */
function Emergency({ countryCode }: { countryCode: string | null }) {
  const t = useT();
  const locale = useLocale();
  const country = getCountry(countryCode);
  const contact = country?.emergency[0] ?? null;
  return (
    <section aria-labelledby="near-emergency" className="mt-12 rounded-card bg-emergency p-5 text-emergency-ink sm:p-6">
      <h2 id="near-emergency" className="type-h3">{t.nearMe.emergencyTitle}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        {contact ? (
          <a href={`tel:${contact.number.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center gap-2 text-lead font-semibold tabular-nums underline-offset-4 hover:underline">
            <Phone aria-hidden className="size-5 shrink-0" /> {fmt(t.result.call, { number: contact.number })}
            <span className="text-small font-medium">{`(${t.contacts[contact.label]}${t.common.listSeparator}${countryName(country!.code, locale)})`}</span>
          </a>
        ) : (
          <p className="font-semibold">{t.nearMe.callLocal}</p>
        )}
        <Link href="/emergency" className="inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4">
          <Siren aria-hidden className="size-5 shrink-0" /> {t.common.bitten}
        </Link>
      </div>
    </section>
  );
}

const LICENSE_NAMES: Record<string, string> = { CC0_1_0: "CC0 1.0", CC_BY_4_0: "CC BY 4.0", CC_BY_NC_4_0: "CC BY-NC 4.0" };

/** Replaces {name} placeholders with elements (links), keeping the translated text around them. */
function withNodes(template: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m && m[1] in nodes ? <span key={i}>{nodes[m[1]]}</span> : part;
  });
}

const EXTERNAL = { target: "_blank", rel: "noopener noreferrer", className: "underline underline-offset-4 hover:text-ink" } as const;

/** GBIF credit with the query date and licences; Photon/OpenStreetMap credit for place search. */
function Credits({ data }: { data?: Sightings }) {
  const t = useT();
  const locale = useLocale();
  const licenses = data ? Object.keys(data.area.licenses).map((l) => LICENSE_NAMES[l] ?? l) : [];
  return (
    <footer className="mt-10 space-y-1 border-t border-line pt-4 text-caption text-ink-2">
      {data && (
        <>
          <p>
            {t.nearMe.dataFrom}{" "}
            <a href="https://www.gbif.org" {...EXTERNAL}>GBIF.org</a>
            <span className="sr-only"> {t.common.opensInNewTab}</span>, {fmt(t.nearMe.queried, { date: formatDate(data.fetchedAt, locale) })}{" "}
            <a href={data.area.queryUrl} {...EXTERNAL}>{t.nearMe.exactQuery}</a>
          </p>
          {licenses.length > 0 && <p>{fmt(t.nearMe.licenses, { licenses: licenses.join(", ") })}</p>}
          {!data.area.includesNonCommercial && <p>{t.nearMe.ncExcluded}</p>}
        </>
      )}
      <p>
        {withNodes(t.nearMe.placesCredit, {
          osm: (
            <a href="https://www.openstreetmap.org/copyright" {...EXTERNAL}>
              © OpenStreetMap contributors
            </a>
          ),
        })}
      </p>
    </footer>
  );
}

