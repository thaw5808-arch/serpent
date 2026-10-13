import "server-only";
import { getCountry } from "@/data/countries";
import { roundedPoint } from "@/lib/geo";
import { NOT_SURE, tooVague, type DescribedPlace, type Description } from "@/lib/describe";
import { candidatesForCountry } from "@/services/countryCandidates";
import { getSightings } from "@/services/nearMe";
import type { NearbySnakes } from "@/services/nearMe/classify";
import { decideDescription } from "@/services/safetyService";
import { allTaxonomyRecords } from "@/services/taxonomyIndex";
import { listSpecies } from "@/services/venomDatabase";
import { DescribeOutputSchema, ProviderUnavailableError, type DescribeOutput, type VisionProvider } from "@/services/providers/types";
import type { DescriptionPool, DescriptionResult } from "@/types";

/*
 * "Describe a snake": matches answers to simple questions against the species
 * that could plausibly be there, with one text-only model call.
 *
 *   answers → mostly "Not sure"? → "not enough detail" (no model call)
 *           → candidate pool: snakes recorded near the place (GBIF, as on Near me)
 *             + the reviewed catalog; else the place's country; else every species
 *           → provider.describe (names only, forced structured JSON)
 *           → zod validation (anything malformed is rejected, never faked)
 *           → safety policy (src/services/safetyService.ts): our data decides venom
 *             and risk; the overall result is never reassuring
 */

export interface PoolName {
  name: string;
  common: string | null;
  genus: string;
}

export interface Pool {
  kind: DescriptionPool;
  names: PoolName[];
}

/** Species recorded near a place, as Near me shows them. Null or a throw means unavailable. */
export type SightingsLookup = (place: DescribedPlace) => Promise<NearbySnakes | null>;

/** A first GBIF lookup for a new area can take a minute; past this, use the country list instead. */
export const SIGHTINGS_WAIT_MS = 20_000;

const defaultSightings: SightingsLookup = async (place) => {
  const point = roundedPoint(place.lat, place.lng);
  if (!point) return null;
  // The lookup carries on (and fills the cache) if it outlasts the wait.
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), SIGHTINGS_WAIT_MS));
  return Promise.race([getSightings(point, place.name), timeout]);
};

const curatedNames = (): PoolName[] =>
  listSpecies().map((s) => ({ name: s.scientificName, common: s.commonName, genus: s.genus }));

function unique(names: PoolName[]): PoolName[] {
  const seen = new Set<string>();
  return names.filter((n) => !seen.has(n.name) && seen.add(n.name));
}

/** The species the model may choose from: nearby records, else the country, else everything. */
export async function buildPool(place: DescribedPlace | null, sightings: SightingsLookup = defaultSightings): Promise<Pool> {
  if (place) {
    const nearby = await sightings(place).catch((err: unknown) => {
      console.error("[describe] sightings unavailable:", (err as Error).message);
      return null;
    });
    // Only rows we recognise as species: a GBIF name we can't place isn't a usable candidate.
    const rows = nearby ? [...nearby.dangerous, ...nearby.other].filter((r) => r.kind === "species" || r.kind === "taxonomy") : [];
    if (rows.length > 0) {
      const local = rows.map((r) => ({ name: r.scientificName, common: r.commonName, genus: r.scientificName.split(" ")[0] }));
      return { kind: "nearby", names: unique([...local, ...curatedNames()]) };
    }
    const country = getCountry(place.countryCode);
    if (country) {
      const names = candidatesForCountry(country.code).map((e) => ({
        name: e.scientificName,
        common: e.commonName === e.scientificName ? null : e.commonName,
        genus: e.genus ?? e.scientificName.split(" ")[0],
      }));
      return { kind: "country", names: unique([...names, ...curatedNames()]) };
    }
  }
  // Every recognised species, without common names to keep the request small.
  const all = allTaxonomyRecords().map((r) => ({ name: r.name, common: null, genus: r.genus }));
  return { kind: "everywhere", names: unique([...curatedNames().map((n) => ({ ...n, common: null })), ...all]) };
}

/** One line per genus: "Bungarus: candidus (Malayan Krait), fasciatus (Banded Krait)". */
export function poolText(pool: Pool): string {
  const byGenus = new Map<string, string[]>();
  for (const n of pool.names) {
    const epithet = n.name.split(" ").slice(1).join(" ");
    if (!epithet) continue;
    const list = byGenus.get(n.genus) ?? [];
    list.push(n.common ? `${epithet} (${n.common})` : epithet);
    byGenus.set(n.genus, list);
  }
  return [...byGenus].map(([genus, eps]) => `${genus}: ${eps.join(", ")}`).join("\n");
}

/** English wording of each answer id, for the prompt only (the screens use messages/*.json). */
const ANSWER_TEXT: Record<string, string> = {
  black: "black", brown: "brown", grey: "grey", green: "green", yellow: "yellow", red_orange: "red or orange",
  white_cream: "white or cream", blue_iridescent: "blue-ish or iridescent",
  bands: "bands or rings around the body", stripes: "stripes along the body", blotches: "blotches or diamonds",
  speckled: "speckled or spotted", plain: "plain, one colour",
  triangular: "clearly wider than the neck (triangular)", same_as_neck: "about the same width as the neck", hood: "it spread a hood",
  under_50cm: "under 50 cm", "50cm_1m": "50 cm to 1 m", "1m_2m": "1 to 2 m", over_2m: "over 2 m",
  building: "inside a building", garden: "garden or yard", water: "in water or a rice field", tree: "in a tree or bush",
  road: "on a road or path", forest: "forest",
  day: "day", night: "night",
  raised_head: "raised its head or hood", hissed: "hissed", flattened_neck: "flattened its neck", fled: "tried to flee",
  stayed_still: "stayed still",
};

const say = (v: string) => (v === NOT_SURE ? "not sure" : (ANSWER_TEXT[v] ?? v));
const sayList = (v: string[] | typeof NOT_SURE, none: string) => (v === NOT_SURE ? "not sure" : v.length ? v.map(say).join(", ") : none);

export function answersText(d: Description): string {
  return [
    `- Main colours: ${sayList(d.colours, "not sure")}`,
    `- Pattern: ${say(d.pattern)}`,
    `- Head: ${say(d.head)}`,
    `- Size: ${say(d.size)}`,
    `- Where exactly: ${say(d.setting)}`,
    `- Time: ${say(d.time)}`,
    `- Behaviour: ${sayList(d.behaviour, "not given")}`,
  ].join("\n");
}

const placeName = (p: DescribedPlace | null) => (p ? [p.name, p.region, p.country].filter(Boolean).join(", ") : null);

export class DescribeService {
  constructor(
    private readonly provider: VisionProvider,
    private readonly deps: { sightings?: SightingsLookup } = {},
  ) {}

  get engine() {
    return { provider: this.provider.name, model: this.provider.model };
  }

  /** Never throws for provider problems: returns service_unavailable instead. */
  async describe(description: Description, meta: { id: string; analyzedAt: string }): Promise<DescriptionResult> {
    const country = description.place?.countryCode ?? null;
    const result = (pool: DescriptionPool, output: DescribeOutput | null): DescriptionResult => ({
      mode: "description",
      ...meta,
      engine: this.engine,
      ...decideDescription({ description, output, pool, country }),
    });

    // Mostly "Not sure": nothing to match on, so no model call at all.
    if (tooVague(description)) return result(description.place ? "nearby" : "everywhere", null);

    const pool = await buildPool(description.place, this.deps.sightings);
    try {
      if (!this.provider.describe) throw new ProviderUnavailableError(`${this.provider.name} can't match descriptions`);
      const raw = await this.provider.describe({
        answers: answersText(description),
        placeName: placeName(description.place),
        pool: poolText(pool),
        poolKind: pool.kind,
      });
      const parsed = DescribeOutputSchema.safeParse(raw);
      if (!parsed.success) throw new ProviderUnavailableError("Provider returned invalid matches", parsed.error);
      return result(pool.kind, parsed.data);
    } catch (err) {
      if (err instanceof ProviderUnavailableError) {
        console.error("[describe] provider unavailable:", err.message);
        return result(pool.kind, null);
      }
      throw err;
    }
  }
}
