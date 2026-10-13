import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import th from "../messages/th.json";
import my from "../messages/my.json";
import { CardView, elapsedText } from "@/components/doctorCard/CardView";
import type { Messages } from "@/i18n/messages";
import { cardSnake, elapsed, newCard, toggleSymptom, type CardDict, type CardDicts } from "@/lib/doctorCard";
import type { CandidateView, DescriptionResult, DisplayVenomStatus, IdentificationResult } from "@/types";

const pick = (m: Messages): CardDict => ({ doctorCard: m.doctorCard, venomStatus: m.venomStatus, venomType: m.venomType, risk: m.risk, candidate: m.candidate });
const DICTS: CardDicts = { en: pick(en), th: pick(th), my: pick(my) };

const krait: CandidateView = {
  kind: "species", speciesId: "malayan-krait", groupId: null, label: "Malayan Krait", scientificName: "Bungarus candidus",
  taxonomySlug: null, venomStatus: "venomous", venomBasis: "species", venomGroup: null, namedAs: null, probability: 0.8,
  band: "high", supportingFeatures: [], conflictingFeatures: [], outsideSelectedRegion: false,
};

function photo(displayVenomStatus: DisplayVenomStatus, over: Partial<IdentificationResult> = {}): IdentificationResult {
  return {
    id: "p1", status: "likely_identified", message: "", analyzedAt: "2026-10-01T08:00:00.000Z", country: "TH",
    engine: { provider: "anthropic", model: "m" }, imageIssues: [], top: krait, alternatives: [], confidenceBand: "high",
    displayVenomStatus, closestMatch: null, couldAlsoBe: [], observedFeatures: [], uncertaintyNotes: [], modelNotes: [], notes: [],
    safety: { headline: "", actions: [], actionKeys: [], lookAlike: { active: false, message: "", speciesIds: [] }, treatAsDangerous: true },
    ...over,
  };
}

function described(over: Partial<DescriptionResult> = {}): DescriptionResult {
  return {
    mode: "description", id: "d1", analyzedAt: "2026-10-01T08:00:00.000Z", engine: { provider: "openai", model: "m" },
    status: "possible_matches", country: "TH",
    answers: { place: null, colours: ["black"], pattern: "bands", head: "same_as_neck", size: "1m_2m", setting: "building", time: "night", behaviour: [] },
    pool: "everywhere", displayVenomStatus: "potentially_venomous", overallRisk: "very_high", dangerous: true,
    candidates: [
      { kind: "species", speciesId: "malayan-krait", taxonomySlug: null, commonName: "Malayan Krait", scientificName: "Bungarus candidus", venomStatus: "venomous", venomBasis: "species", venomGroup: null, medicalRisk: "very_high", score: 0.7, why: "x" },
      { kind: "species", speciesId: "laotian-wolf-snake", taxonomySlug: null, commonName: "Laotian Wolf Snake", scientificName: "Lycodon laoensis", venomStatus: "non_venomous", venomBasis: "species", venomGroup: null, medicalRisk: "low", score: 0.5, why: "x" },
    ],
    safety: { headline: "", actions: [], actionKeys: [], lookAlike: { active: false, message: "", speciesIds: [] }, treatAsDangerous: true },
    ...over,
  };
}

const STATUSES: DisplayVenomStatus[] = ["venomous", "potentially_venomous", "mildly_venomous", "non_venomous", "unknown"];

describe("doctor card: the snake status is copied exactly", () => {
  it.each(STATUSES)("a photo result shown as %s stays %s, with the result's own label", (status) => {
    const s = cardSnake(photo(status), DICTS.en);
    expect(s.status).toBe(status);
    expect(s.statusText.startsWith(en.venomStatus[status].label)).toBe(true);
  });

  it("never upgrades: a venomous species shown as 'potentially venomous' stays potentially venomous", () => {
    const s = cardSnake(photo("potentially_venomous", { status: "conflicting_evidence", confidenceBand: "low" }), DICTS.en);
    expect(s.statusText).toBe("Potentially venomous — AI estimate from photo");
    expect(s.statusText).not.toMatch(/^Venomous/);
  });

  it("keeps the result's own hedge: non-venomous stays 'most likely'", () => {
    expect(cardSnake(photo("non_venomous"), DICTS.en).statusText).toBe("Non-venomous (most likely) — AI estimate from photo");
  });

  it("'Unknown' stays exactly 'Unknown'", () => {
    expect(cardSnake(photo("unknown", { status: "insufficient_image", top: null }), DICTS.en)).toMatchObject({ kind: "none", status: "unknown", statusText: "Unknown" });
    expect(cardSnake(photo("unknown"), DICTS.en).statusText).toBe("Unknown");
  });

  it("with no result: snake not identified, status Unknown", () => {
    expect(cardSnake(null, DICTS.en)).toMatchObject({ kind: "none", names: [], status: "unknown", statusText: "Unknown", risk: null, venomTypes: [] });
  });

  it("venom type and risk come from our species data, only for the identified species", () => {
    const s = cardSnake(photo("venomous"), DICTS.en);
    expect(s.venomTypes).toEqual(["neurotoxic"]);
    expect(s.risk?.text).toBe("Very high (for the most likely species)");
    // A closest match that isn't the identification gets neither.
    const closest = cardSnake(photo("potentially_venomous", { status: "unknown_species", top: null, closestMatch: krait }), DICTS.en);
    expect(closest.names[0].name).toBe("Malayan Krait");
    expect(closest.venomTypes).toEqual([]);
    expect(closest.risk).toBeNull();
  });

  it("a description shows possible matches, potentially venomous, and the worst risk", () => {
    const s = cardSnake(described(), DICTS.en);
    expect(s).toMatchObject({ kind: "possible", status: "potentially_venomous", statusText: "Potentially venomous — AI estimate from a description" });
    expect(s.names.map((n) => n.scientific)).toEqual(["Bungarus candidus", "Lycodon laoensis"]);
    expect(s.risk?.text).toBe("Very high (highest among the possible matches)");
    expect(cardSnake(described({ status: "not_enough_detail", candidates: [] }), DICTS.en)).toMatchObject({ kind: "none", names: [] });
  });
});

describe("doctor card: card language", () => {
  it("is its own setting: a new card starts in the site language and can be switched", () => {
    const card = newCard("p1", photo("venomous"), [], "en");
    expect(card.cardLocale).toBe("en");
    const thai = { ...card, cardLocale: "th" as const };
    const html = renderToStaticMarkup(createElement(CardView, { card: thai, t: DICTS[thai.cardLocale], locale: thai.cardLocale, now: Date.now() }));
    expect(html).toContain(th.doctorCard.cardTitle);
    expect(html).not.toContain(en.doctorCard.cardTitle);
    expect(html).toContain('lang="th"');
  });

  it.each(["en", "th", "my"] as const)("%s: names stay as they are; only Serpent's words change", (l) => {
    const s = cardSnake(photo("venomous"), DICTS[l]);
    expect(s.names).toEqual([{ name: "Malayan Krait", scientific: "Bungarus candidus" }]);
    expect(s.statusText.startsWith(DICTS[l].venomStatus.venomous.label)).toBe(true);
  });
});

describe("doctor card: elapsed time", () => {
  const bite = "2026-10-13T08:00:00.000Z";
  const at = (iso: string) => new Date(iso).getTime();

  it("counts whole hours and minutes", () => {
    expect(elapsed(bite, at("2026-10-13T10:05:59.000Z"))).toEqual({ h: 2, m: 5 });
    expect(elapsed(bite, at("2026-10-13T08:00:30.000Z"))).toEqual({ h: 0, m: 0 });
    expect(elapsed(bite, at("2026-10-14T09:30:00.000Z"))).toEqual({ h: 25, m: 30 });
  });

  it("rejects a bite time in the future (beyond a minute of clock difference)", () => {
    expect(elapsed(bite, at("2026-10-13T07:59:30.000Z"))).toEqual({ h: 0, m: 0 });
    expect(elapsed(bite, at("2026-10-13T07:58:00.000Z"))).toBeNull();
  });

  it("reads naturally in each card language", () => {
    const card = { ...newCard(null, null, [], "en"), biteTime: bite };
    expect(elapsedText(card, DICTS.en, at("2026-10-13T10:05:00.000Z"))).toBe("2 h 5 min ago");
    expect(elapsedText(card, DICTS.en, at("2026-10-13T08:45:00.000Z"))).toBe("45 min ago");
    expect(elapsedText(card, DICTS.th, at("2026-10-13T10:05:00.000Z"))).toBe("2 ชม. 5 นาทีที่แล้ว");
    expect(elapsedText(card, DICTS.en, at("2026-10-13T07:00:00.000Z"))).toBe(en.doctorCard.futureTime);
  });
});

describe("doctor card: symptoms", () => {
  it("records when each symptom was ticked; 'None yet' and real symptoms exclude each other", () => {
    let list = toggleSymptom([], "none", new Date("2026-10-13T08:05:00Z"));
    expect(list).toEqual([{ key: "none", at: "2026-10-13T08:05:00.000Z" }]);
    list = toggleSymptom(list, "eyelids_vision", new Date("2026-10-13T09:10:00Z"));
    expect(list).toEqual([{ key: "eyelids_vision", at: "2026-10-13T09:10:00.000Z" }]);
    list = toggleSymptom(list, "breathing", new Date("2026-10-13T09:40:00Z"));
    expect(list.map((s) => s.key)).toEqual(["eyelids_vision", "breathing"]);
    expect(toggleSymptom(list, "eyelids_vision").map((s) => s.key)).toEqual(["breathing"]);
  });
});

describe("doctor card: printing", () => {
  const css = readFileSync(path.join(__dirname, "..", "src", "app", "globals.css"), "utf8");
  const print = css.slice(css.lastIndexOf("@media print"));

  it("the print view hides site navigation, header, footer and screen-only parts, on white paper", () => {
    expect(print).toMatch(/header,\s*nav,\s*footer,\s*\.no-print\s*\{\s*display:\s*none !important;/);
    expect(print).toMatch(/background:\s*#fff !important;/);
    expect(print).toMatch(/color:\s*#000 !important;/);
  });

  it("the card itself has no nav, header or footer elements (so printing never hides part of it)", () => {
    const card = { ...newCard("p1", photo("venomous"), [], "en"), biteTime: "2026-10-13T08:00:00.000Z", firstAid: ["tourniquet" as const] };
    const html = renderToStaticMarkup(createElement(CardView, { card, t: DICTS.en, locale: "en", now: Date.now() }));
    expect(html).not.toMatch(/<(nav|header|footer)\b/);
    expect(html).toContain(en.doctorCard.footer.replace(/'/g, "&#x27;"));
    expect(html).toContain(en.doctorCard.tellDoctor);
  });
});

describe("doctor card: no network, no treatment advice", () => {
  const files = [
    ...readdirSync(path.join(__dirname, "..", "src", "components", "doctorCard")).map((f) => path.join("src", "components", "doctorCard", f)),
    "src/lib/doctorCard.ts",
    "src/lib/doctorCardStore.ts",
  ];

  it.each(files)("%s makes no network calls", (file) => {
    const src = readFileSync(path.join(__dirname, "..", file), "utf8");
    expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|\/api\//);
  });

  it.each(["en", "th", "my"] as const)("%s card text has no treatment, dosing or antivenom advice", (l) => {
    const text = JSON.stringify(DICTS[l].doctorCard);
    expect(text).not.toMatch(/antivenom|antivenin|dose|dosage|\bmg\b|\bml\b|inject|เซรุ่ม|ขนาดยา|ဆေးထိုး|ဆေးပမာဏ/i);
  });
});

describe("doctor card: storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is kept on this device even with 'Save my results' off, and can be deleted", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    vi.resetModules();
    const history = await import("@/lib/history");
    const store = await import("@/lib/doctorCardStore");
    await history.setSaveSetting(false);
    const card = { ...newCard("p1", photo("venomous"), [], "en"), biteTime: "2026-10-13T08:00:00.000Z" };
    expect(await store.saveDoctorCard(card)).toBe(true);
    expect(await store.getDoctorCard("result:p1")).toEqual(card);
    expect(await store.deleteDoctorCard("result:p1")).toBe(true);
    expect(await store.getDoctorCard("result:p1")).toBeNull();
  });
});
