import { getCountry, type Country } from "@/data/countries";
import type {
  CandidateView,
  TaxonGroup,
  ConfidenceBand,
  DisplayVenomStatus,
  ImageIssue,
  IdentificationResult,
  IdentificationStatus,
  SafetyActionKey,
  SafetyAssessment,
  SpeciesRecord,
  SystemNote,
} from "@/types";
import en from "../../messages/en.json";
import { fmt } from "@/i18n/format";
import { BASE_ACTIONS } from "@/lib/safetyActions";
import { isMedicallySignificant } from "./venomDatabase";
import { lookAlikesOf, resolveTaxon, type Taxon } from "./taxonomy";
import { englishName } from "./taxonomyIndex";
import type { RawAnalysis } from "./providers/types";

/**
 * Deterministic safety policy. The vision model only ranks and names snakes;
 * everything a user reads about danger is decided here, from our own data,
 * with code that can be unit-tested. When in doubt, this layer errs toward
 * caution:
 * - anything we can't resolve to a catalog species is at least "potentially venomous";
 * - a plausible venomous candidate (species, genus or family) always leads;
 * - "non-venomous" needs a high-confidence exact catalog species, no plausible
 *   venomous candidate and no plausible unresolved candidate.
 */

export const POLICY = {
  /** Multiplier applied to species not recorded in the user's region. Reduces, never excludes. */
  outOfRegionFactor: 0.35,
  /** Candidates at or above this share are plausible: a venomous one makes the evidence conflicting. */
  plausibleThreshold: 0.1,
  /** Below this, the top candidate is not reported as an identification. */
  minTopProbability: 0.4,
  high: { top: 0.75, margin: 0.4 },
  moderate: { top: 0.5 },
} as const;

export type Decision = Omit<IdentificationResult, "id" | "analyzedAt" | "engine">;


/** Issues that mean part of the snake could not be assessed, even when the photo is usable. */
const DEGRADING_ISSUES: ReadonlySet<ImageIssue> = new Set([
  "blur",
  "partially_hidden",
  "obstructed",
  "too_small",
  "low_resolution",
]);

/*
 * Everything the policy says to a user is a message key; the English text kept on
 * the result (for logs and older clients) is rendered from messages/en.json, the
 * same strings the English interface shows.
 */

export function statusMessage(status: IdentificationStatus): string {
  return en.status[status];
}

/** English text of one of Serpent's own notes (group common names read in lower case mid-sentence). */
export function noteText(note: SystemNote): string {
  if (note.key === "outsideCountry") return fmt(en.notes.outsideCountry, { country: getCountry(note.params.country)?.name ?? note.params.country });
  const params: Record<string, string> = { ...note.params };
  if (params.common) params.common = params.common.toLowerCase();
  return fmt(en.notes[note.key], params);
}

export function baseSafety(extra: SafetyActionKey[] = []): SafetyAssessment {
  const keys = [...BASE_ACTIONS, ...extra];
  return {
    headline: en.safety.keepDistance,
    actions: keys.map((k) => en.safety.actions[k]),
    actionKeys: keys,
    lookAlike: { active: false, message: "", speciesIds: [] },
    treatAsDangerous: true,
  };
}

function addAction(safety: SafetyAssessment, key: SafetyActionKey, where: "start" | "end" = "end") {
  if (safety.actionKeys.includes(key)) return;
  if (where === "start") {
    safety.actionKeys.unshift(key);
    safety.actions.unshift(en.safety.actions[key]);
  } else {
    safety.actionKeys.push(key);
    safety.actions.push(en.safety.actions[key]);
  }
}

/** Appends one of Serpent's notes in both forms (key and English text). */
function addNote(d: Pick<Decision, "notes" | "uncertaintyNotes">, note: SystemNote) {
  d.notes.push(note);
  d.uncertaintyNotes.push(noteText(note));
}

/** A result that carries no identification. Used for gates and failures. */
export function nonIdentification(
  status: IdentificationStatus,
  issues: Decision["imageIssues"] = [],
  modelNotes: string[] = [],
  notes: SystemNote[] = [],
): Decision {
  const retake: SafetyActionKey[] =
    status === "insufficient_image" || status === "no_snake" || status === "multiple_snakes" ? ["retake"] : [];
  return {
    status,
    message: statusMessage(status),
    country: null,
    imageIssues: issues,
    top: null,
    alternatives: [],
    confidenceBand: null,
    displayVenomStatus: "unknown",
    closestMatch: null,
    couldAlsoBe: [],
    observedFeatures: [],
    uncertaintyNotes: [...modelNotes, ...notes.map((n) => noteText(n))],
    modelNotes: [...modelNotes],
    notes: [...notes],
    safety: baseSafety(retake),
  };
}

export interface Working {
  /** "species:<id>", "group:<id>", "unknown:<name>" or "unknown". */
  key: string;
  taxon: Taxon;
  speciesId: string | null;
  groupId: string | null;
  taxonomySlug: string | null;
  /** Matched only after correcting a typo in the model's name. */
  fuzzy: boolean;
  /** The model's own name when it differs from what it resolved to (synonym, typo, unrecognised). */
  namedAs: string | null;
  p: number;
  supporting: string[];
  conflicting: string[];
  outside: boolean;
}

function keyFor(taxon: Taxon, namedAs: string | null): string {
  if (taxon.kind === "species") return `species:${taxon.species.id}`;
  if (taxon.kind === "taxonomy") return `taxonomy:${taxon.record.slug}`;
  if (taxon.kind === "group") return `group:${taxon.group.id}`;
  return namedAs ? `unknown:${namedAs.toLowerCase()}` : "unknown";
}

/**
 * Resolve each candidate against our own data (species → genus → family →
 * unknown), merge duplicates, apply geography, renormalize.
 */
export function rankCandidates(raw: RawAnalysis, country: Country | null): Working[] {
  const merged = new Map<string, Working>();
  for (const c of raw.candidates) {
    const taxon = resolveTaxon({ catalogId: c.catalog_id, scientificName: c.scientific_name, genus: c.genus, family: c.family });
    const given = c.scientific_name?.trim() || c.genus?.trim() || null;
    const resolvedName =
      taxon.kind === "species" ? taxon.species.scientificName : taxon.kind === "taxonomy" ? taxon.record.name : null;
    const fromCatalogId =
      (taxon.kind === "species" && taxon.species.id === c.catalog_id) ||
      (taxon.kind === "taxonomy" && taxon.record.slug === c.catalog_id);
    const namedAs = fromCatalogId || !given || given.toLowerCase() === resolvedName?.toLowerCase() ? null : given;
    const fuzzy = (taxon.kind === "species" || taxon.kind === "taxonomy") && Boolean(taxon.fuzzy);
    const key = keyFor(taxon, namedAs);
    const prev = merged.get(key);
    if (prev) {
      prev.p += c.probability;
      prev.supporting.push(...c.supporting_features);
      prev.conflicting.push(...c.conflicting_features);
    } else {
      merged.set(key, {
        key,
        taxon,
        speciesId: taxon.kind === "species" ? taxon.species.id : null,
        groupId: taxon.kind === "group" ? taxon.group.id : taxon.kind === "taxonomy" ? (taxon.group?.id ?? null) : null,
        taxonomySlug: taxon.kind === "taxonomy" ? taxon.record.slug : null,
        fuzzy,
        namedAs,
        p: c.probability,
        supporting: [...c.supporting_features],
        conflicting: [...c.conflicting_features],
        outside: false,
      });
    }
  }

  let list = [...merged.values()];
  const total = list.reduce((s, c) => s + c.p, 0);
  if (total > 1) list.forEach((c) => (c.p /= total));
  else if (total < 1) {
    // Unclaimed probability mass means "something else" — keep it visible.
    const rest = 1 - total;
    const unknown = merged.get("unknown");
    if (unknown) unknown.p += rest;
    else
      list.push({
        key: "unknown",
        taxon: { kind: "unknown" },
        speciesId: null,
        groupId: null,
        taxonomySlug: null,
        fuzzy: false,
        namedAs: null,
        p: rest,
        supporting: [],
        conflicting: [],
        outside: false,
      });
  }

  // Geography only down-weights catalog species. Venomous groups are never down-weighted.
  if (country) {
    for (const c of list) {
      if (c.taxon.kind === "species" && !c.taxon.species.regions.includes(country.region)) {
        c.p *= POLICY.outOfRegionFactor;
        c.outside = true;
      }
    }
    const sum = list.reduce((s, c) => s + c.p, 0) || 1;
    list.forEach((c) => (c.p /= sum));
  }

  list = list.filter((c) => c.p > 0.005).sort((a, b) => b.p - a.p);
  return list;
}

/**
 * Venomous (or venom unknown) at species, genus or family level. Uncurated
 * species (venomous group or not assessed) and unresolved candidates all count
 * as significant: nothing outside the curated catalog can be reassuring.
 */
function isSignificant(w: Working): boolean {
  if (w.taxon.kind === "species") return isMedicallySignificant(w.taxon.species);
  return true;
}

/** Venomous by our data at species, genus or family level (not merely "not assessed"). */
function isKnownVenomous(w: Working): boolean {
  if (w.taxon.kind === "species") return isMedicallySignificant(w.taxon.species);
  if (w.taxon.kind === "taxonomy") return w.taxon.group !== null;
  return w.taxon.kind === "group";
}

const isResolved = (w: Working) => w.taxon.kind !== "unknown";

/** Venomous candidates first, then by likelihood, so nothing reassuring leads. */
function venomousFirst(list: Working[]): Working[] {
  return [...list].sort((a, b) => Number(isSignificant(b)) - Number(isSignificant(a)) || b.p - a.p);
}

export function calculateBand(
  top: number,
  second: number,
  modelConfidence: RawAnalysis["overall_confidence"],
): ConfidenceBand {
  if (modelConfidence === "low") return "low";
  if (modelConfidence === "high" && top >= POLICY.high.top && top - second >= POLICY.high.margin) return "high";
  if (top >= POLICY.moderate.top) return "moderate";
  return "low";
}

function bandForShare(p: number): ConfidenceBand {
  return p >= POLICY.high.top ? "high" : p >= POLICY.moderate.top ? "moderate" : "low";
}

function toView(w: Working, band: ConfidenceBand): CandidateView {
  const venomGroup = (g: TaxonGroup | null) => (g ? { name: g.name, commonName: g.commonName, rank: g.rank } : null);
  const base = {
    speciesId: w.speciesId,
    groupId: w.groupId,
    taxonomySlug: w.taxonomySlug,
    namedAs: w.namedAs,
    probability: Math.round(w.p * 100) / 100,
    band,
    supportingFeatures: w.supporting.slice(0, 6),
    conflictingFeatures: w.conflicting.slice(0, 6),
    outsideSelectedRegion: w.outside,
  };
  if (w.taxon.kind === "species") {
    const s = w.taxon.species;
    return {
      ...base,
      kind: "species",
      label: s.commonName,
      scientificName: s.scientificName,
      venomStatus: s.venomStatus,
      venomBasis: "species",
      venomGroup: null,
    };
  }
  if (w.taxon.kind === "taxonomy") {
    const { record, group } = w.taxon;
    return {
      ...base,
      kind: "taxonomy",
      label: englishName(record) ?? record.name,
      scientificName: record.name,
      venomStatus: group ? group.venomStatus : null,
      venomBasis: group ? (group.rank === "family" ? "family" : "genus") : "not_assessed",
      venomGroup: venomGroup(group),
    };
  }
  if (w.taxon.kind === "group") {
    const g = w.taxon.group;
    const level = g.rank === "family" ? `family ${g.name}` : g.rank === "genus" ? `genus ${g.name}` : g.name;
    return {
      ...base,
      kind: "group",
      venomGroup: venomGroup(g),
      label: `${g.commonName} (${level})`,
      // An unrecognised name is never shown as if it were a confirmed species.
      scientificName: g.rank === "genus" ? `${g.name} sp.` : null,
      venomStatus: g.venomStatus,
      venomBasis: g.rank === "family" ? "family" : "genus",
    };
  }
  return {
    ...base,
    kind: "unresolved",
    label: w.namedAs ? "An unrecognised snake" : "A species not in our database",
    scientificName: null,
    venomStatus: null,
    venomBasis: "unresolved",
    venomGroup: null,
  };
}

function dangerousLookAlikes(top: SpeciesRecord): SpeciesRecord[] {
  return lookAlikesOf(top).filter(
    (s) => isMedicallySignificant(s) !== isMedicallySignificant(top) || isMedicallySignificant(s),
  );
}

function addSpittingCobraAdvice(safety: SafetyAssessment, speciesIds: string[]) {
  if (speciesIds.includes("indochinese-spitting-cobra")) addAction(safety, "spitting", "start");
}

function lookAlikeWarning(speciesIds: string[]): SafetyAssessment["lookAlike"] {
  return { active: true, speciesIds, message: en.safety.lookAlike };
}

/**
 * Plain-language notes for candidates resolved above species level or not at all.
 * Parameters are names (never translated), so the note reads the same in every language.
 */
function taxonNotes(list: Working[]): SystemNote[] {
  const notes: SystemNote[] = [];
  for (const w of list) {
    if (w.fuzzy && w.namedAs) {
      const resolved = w.taxon.kind === "species" ? w.taxon.species.scientificName : w.taxon.kind === "taxonomy" ? w.taxon.record.name : "";
      notes.push({ key: "typo", params: { namedAs: w.namedAs, resolved } });
    }
    if (w.taxon.kind === "taxonomy") {
      const { record, group } = w.taxon;
      notes.push(
        group
          ? { key: "unreviewedInGroup", params: { name: record.name, common: group.commonName, group: group.name } }
          : { key: "unreviewedNotAssessed", params: { name: record.name } },
      );
    } else if (w.taxon.kind === "group") {
      const g = w.taxon.group;
      const params = { common: g.commonName, group: g.name };
      notes.push(w.namedAs ? { key: "groupSuggested", params: { ...params, namedAs: w.namedAs } } : { key: "groupPoints", params });
    } else if (w.taxon.kind === "unknown" && w.namedAs) {
      notes.push({ key: "unrecognised", params: { namedAs: w.namedAs } });
    }
  }
  return notes;
}

/**
 * No catalog species is a reliable identification: either the best match is a
 * genus/family group, an unrecognised name, or too weak. No species is shown
 * as "the" answer and the venom status is never reassuring.
 */
function decideUnresolved(raw: RawAnalysis, ranked: Working[], country: Country | null): Decision {
  const issues = raw.image_quality.issues;
  const resolved = ranked.filter(isResolved);
  const plausible = resolved.filter((c) => c.p >= POLICY.plausibleThreshold);
  const considered = plausible.length > 0 ? plausible : resolved;
  const significant = considered.filter(isSignificant);
  const status: IdentificationStatus =
    significant.length > 0 && significant.length < considered.length ? "conflicting_evidence" : "unknown_species";

  const top = ranked[0];
  // A confident match to something venomous by our data (genus/family group, or an
  // uncurated species in a venomous group) is reported as venomous; everything else
  // — including uncurated species whose venom isn't assessed — as potentially venomous.
  const displayVenomStatus: DisplayVenomStatus =
    top && top.taxon.kind !== "species" && isKnownVenomous(top) && top.p >= POLICY.minTopProbability
      ? "venomous"
      : "potentially_venomous";

  const consideredSpecies = considered.flatMap((c) => (c.taxon.kind === "species" ? [c.taxon.species] : []));
  // The candidates themselves, plus look-alikes of a different venom class. Not
  // look-alikes of look-alikes: those drown the warning in unrelated species.
  const lookAlikeIds = [
    ...new Set([
      ...consideredSpecies.filter(isMedicallySignificant).map((s) => s.id),
      ...consideredSpecies.flatMap((s) =>
        lookAlikesOf(s)
          .filter((l) => isMedicallySignificant(l) !== isMedicallySignificant(s))
          .map((l) => l.id),
      ),
    ]),
  ];

  const d = nonIdentification(status, issues, raw.uncertainty_notes, taxonNotes(ranked));
  if (issues.some((i) => DEGRADING_ISSUES.has(i))) addAction(d.safety, "retake");
  // Species-specific advice only for species that are actually candidates.
  addSpittingCobraAdvice(d.safety, consideredSpecies.map((s) => s.id));
  if (status === "conflicting_evidence" || lookAlikeIds.length > 0 || consideredSpecies.some((s) => s.otherLookAlikes)) {
    d.safety.lookAlike = lookAlikeWarning(lookAlikeIds);
  }
  const unknownMass = ranked.filter((c) => !isResolved(c)).reduce((s, c) => s + c.p, 0);
  if (unknownMass >= POLICY.plausibleThreshold) addNote(d, { key: "notInDatabase" });

  return {
    ...d,
    country: country?.code ?? null,
    alternatives: venomousFirst(ranked.filter((c) => isResolved(c) || c.namedAs))
      .slice(0, 4)
      .map((c) => toView(c, "low")),
    confidenceBand: "low",
    displayVenomStatus,
    observedFeatures: raw.observed_features,
  };
}

/**
 * The model saw one snake but not enough of it for an identification. No
 * species is reported as "the" answer: plausible candidates are listed as
 * low-confidence possibilities and the worst plausible case drives the venom
 * status, which is never reassuring here.
 */
function decideDegraded(raw: RawAnalysis, ranked: Working[], country: Country | null): Decision {
  const d = decideUnresolved(raw, ranked, country);
  addAction(d.safety, "retake");
  addNote(d, { key: "partialOnly" });
  // A low-confidence band never shows a reassuring or definite status.
  return { ...d, displayVenomStatus: "potentially_venomous" };
}

/** Turns a validated model analysis into the result a user sees. */
export function decide(raw: RawAnalysis, country: Country | null): Decision {
  return withPresentation(decideSafety(raw, country), rankCandidates(raw, country));
}

const BAND_ORDER: ConfidenceBand[] = ["low", "moderate", "high"];
const lowerBand = (a: ConfidenceBand, b: ConfidenceBand) => BAND_ORDER[Math.min(BAND_ORDER.indexOf(a), BAND_ORDER.indexOf(b))];

/**
 * Presentation only: which candidate to name as the closest match, and which
 * plausible candidates of another venom class to show beside it. It never
 * changes the safety fields (venom badge, status, look-alikes, actions).
 *
 * Closest match: the identified species when there is one; otherwise the most
 * likely plausible resolved species (curated or taxonomy), else the most likely
 * plausible genus/family group, else the most likely candidate of any kind.
 * Unrecognised names are labelled "An unrecognised snake", never as a species.
 */
function withPresentation(d: Decision, ranked: Working[]): Decision {
  const candidates = ranked.filter((w) => w.key !== "unknown");
  if (candidates.length === 0 || ["no_snake", "multiple_snakes", "insufficient_image"].includes(d.status)) return d;

  const plausible = (w: Working) => w.p >= POLICY.plausibleThreshold;
  const isSpecies = (w: Working) => w.taxon.kind === "species" || w.taxon.kind === "taxonomy";
  const closest =
    (d.top && candidates.find((w) => w.speciesId === d.top!.speciesId)) ??
    candidates.find((w) => plausible(w) && isSpecies(w)) ??
    candidates.find((w) => plausible(w) && w.taxon.kind === "group") ??
    candidates[0];

  // The band shown for a candidate never exceeds the result's own band.
  const bandOf = (w: Working) => lowerBand(d.confidenceBand ?? "low", bandForShare(w.p));
  const closestView = d.top && closest.speciesId === d.top.speciesId ? d.top : toView(closest, bandOf(closest));

  const couldAlsoBe = candidates
    .filter((w) => w !== closest && plausible(w) && isSignificant(w) !== isSignificant(closest))
    .sort(
      (a, b) =>
        Number(isKnownVenomous(b)) - Number(isKnownVenomous(a)) ||
        Number(isSignificant(b)) - Number(isSignificant(a)) ||
        b.p - a.p,
    )
    .map((w) => toView(w, bandOf(w)));

  return { ...d, closestMatch: closestView, couldAlsoBe };
}

/** The safety policy alone, without presentation. Exported for tests. */
export function decideSafety(raw: RawAnalysis, country: Country | null): Decision {
  const q = raw.image_quality;
  const issues = q.issues;

  if (!q.snake_detected || q.snake_count === "none") return { ...nonIdentification("no_snake", issues), country: country?.code ?? null };
  if (q.snake_count === "multiple") return { ...nonIdentification("multiple_snakes", issues), country: country?.code ?? null };

  const ranked = rankCandidates(raw, country);

  // A partial or imperfect photo still gets a cautious, low-confidence result
  // as long as the model could name at least one snake we can look up.
  if (!q.usable_for_identification) {
    if (!ranked.some(isResolved)) {
      return { ...nonIdentification("insufficient_image", issues, raw.uncertainty_notes), country: country?.code ?? null };
    }
    return decideDegraded(raw, ranked, country);
  }

  const topW = ranked[0];
  const topSpecies = topW?.taxon.kind === "species" ? topW.taxon.species : null;
  if (!topW || !topSpecies || topW.p < POLICY.minTopProbability) return decideUnresolved(raw, ranked, country);

  const second = ranked[1]?.p ?? 0;
  const degraded = issues.some((i) => DEGRADING_ISSUES.has(i));
  const computedBand = calculateBand(topW.p, second, raw.overall_confidence);
  // An imperfect photo can support a moderate identification, never a high one.
  const band: ConfidenceBand = degraded && computedBand === "high" ? "moderate" : computedBand;

  const plausible = ranked.filter((c) => c.p >= POLICY.plausibleThreshold);
  const plausibleVenomous = plausible.filter((c) => isResolved(c) && isSignificant(c));
  const unknownMass = ranked.filter((c) => !isResolved(c)).reduce((s, c) => s + c.p, 0);
  const topSignificant = isMedicallySignificant(topSpecies);

  // Any plausible candidate of the other venom class (species, genus or family) is conflicting evidence.
  const conflicting = plausible.slice(1).filter((c) => isResolved(c) && isSignificant(c) !== topSignificant);
  const status: IdentificationStatus = conflicting.length > 0 ? "conflicting_evidence" : "likely_identified";

  // Non-venomous (or mildly venomous) is shown only when every one of these holds.
  // A typo-corrected match is not an exact catalog species.
  const reassuranceAllowed =
    band === "high" && !topW.fuzzy && plausibleVenomous.length === 0 && unknownMass < POLICY.plausibleThreshold;
  const displayVenomStatus: DisplayVenomStatus = topSignificant
    ? topSpecies.venomStatus
    : reassuranceAllowed
      ? topSpecies.venomStatus
      : "potentially_venomous";

  const conflictingSpecies = conflicting.flatMap((c) => (c.taxon.kind === "species" ? [c.taxon.species] : []));
  const lookAlikes = dangerousLookAlikes(topSpecies);
  const lookAlikeIds = [...new Set([...conflictingSpecies.map((s) => s.id), ...lookAlikes.map((s) => s.id)])];
  const lookAlikeActive =
    status === "conflicting_evidence" ||
    lookAlikes.some((s) => isMedicallySignificant(s) !== topSignificant) ||
    (band !== "high" && (lookAlikes.length > 0 || Boolean(topSpecies.otherLookAlikes)));

  const safety = baseSafety(degraded ? ["retake"] : []);
  safety.treatAsDangerous = displayVenomStatus !== "non_venomous" && displayVenomStatus !== "mildly_venomous";
  addSpittingCobraAdvice(safety, [topSpecies.id, ...lookAlikeIds]);
  if (lookAlikeActive) safety.lookAlike = lookAlikeWarning(lookAlikeIds);

  const modelNotes = [...raw.uncertainty_notes];
  const noteList: Pick<Decision, "notes" | "uncertaintyNotes"> = { notes: [], uncertaintyNotes: [...modelNotes] };
  taxonNotes(ranked.slice(1)).forEach((n) => addNote(noteList, n));
  if (topW.outside && country) addNote(noteList, { key: "outsideCountry", params: { country: country.code } });
  if (unknownMass >= POLICY.plausibleThreshold) addNote(noteList, { key: "notInDatabase" });
  const { notes, uncertaintyNotes } = noteList;

  // Can't tell apart a non-venomous top from a venomous candidate: no single
  // non-venomous headline. Lead with the venomous possibilities instead.
  if (status === "conflicting_evidence" && !topSignificant) {
    return {
      status,
      message: statusMessage(status),
      country: country?.code ?? null,
      imageIssues: issues,
      top: null,
      alternatives: venomousFirst(ranked.filter((c) => isResolved(c) || c.namedAs))
        .slice(0, 4)
        .map((c) => toView(c, bandForShare(c.p))),
      confidenceBand: band,
      displayVenomStatus,
      closestMatch: null,
      couldAlsoBe: [],
      observedFeatures: raw.observed_features,
      uncertaintyNotes,
      modelNotes,
      notes,
      safety,
    };
  }

  return {
    status,
    message: statusMessage(status),
    country: country?.code ?? null,
    imageIssues: issues,
    top: toView(topW, band),
    alternatives: ranked.slice(1, 4).map((c) => toView(c, bandForShare(c.p))),
    confidenceBand: band,
    displayVenomStatus,
    closestMatch: null,
    couldAlsoBe: [],
    observedFeatures: raw.observed_features,
    uncertaintyNotes,
    modelNotes,
    notes,
    safety,
  };
}
