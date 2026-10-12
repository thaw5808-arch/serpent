import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import th from "../messages/th.json";
import my from "../messages/my.json";
import { COUNTRIES } from "@/data/countries";
import { SPECIES } from "@/data/species/catalog";
import { LOCALES, localePath, stripLocale, type Locale } from "@/i18n/config";
import { fmt, formatPercent } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { acceptedLanguages, pickLocale } from "@/i18n/negotiate";
import { candidateLabel } from "@/i18n/result";
import { flattenKeys, reviewKeys } from "@/i18n/review";
import { localizeSpecies, SPECIES_TEXT, TRANSLATABLE_SPECIES_FIELDS } from "@/i18n/species";
import { decide } from "@/services/safetyService";
import { getCountry } from "@/data/countries";
import { FORBIDDEN, NEGATED_WARNING_KEYS } from "./forbidden";
import { c, raw } from "./helpers";

const DICTS: Record<Locale, Messages> = { en, th, my };

/** key → string value, for every leaf. */
function leaves(obj: unknown, prefix = ""): [string, string][] {
  if (typeof obj === "string") return [[prefix, obj]];
  if (typeof obj !== "object" || obj === null) return [[prefix, String(obj)]];
  return Object.entries(obj).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("message files", () => {
  const enKeys = flattenKeys(en);

  it.each(["th", "my"] as const)("%s has every key in en.json", (locale) => {
    const keys = new Set(flattenKeys(DICTS[locale]));
    expect(enKeys.filter((k) => !keys.has(k))).toEqual([]);
  });

  it.each(["th", "my"] as const)("%s has no keys that en.json lacks", (locale) => {
    const keys = new Set(enKeys);
    expect(flattenKeys(DICTS[locale]).filter((k) => !keys.has(k))).toEqual([]);
  });

  it.each(LOCALES)("%s: every message is a non-empty string", (locale) => {
    for (const [key, value] of leaves(DICTS[locale])) {
      expect(typeof value, key).toBe("string");
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it.each(["th", "my"] as const)("%s uses exactly the same {placeholders} as English", (locale) => {
    const theirs = new Map(leaves(DICTS[locale]));
    for (const [key, value] of leaves(en)) {
      expect(placeholders(theirs.get(key) ?? ""), key).toEqual(placeholders(value));
    }
  });

  it.each([
    ["th", /[฀-๿]/],
    ["my", /[က-႟]/],
  ] as const)("%s is actually written in its script", (locale, script) => {
    const translated = leaves(DICTS[locale]).filter(([, v]) => script.test(v)).length;
    // A handful of keys are names or codes on purpose (e.g. "NHS 111").
    expect(translated / leaves(en).length).toBeGreaterThan(0.95);
  });
});

describe("Burmese is Myanmar Unicode, not Zawgyi", () => {
  const burmese = [
    ...leaves(my).map(([, v]) => v),
    ...Object.values(SPECIES_TEXT.my).flatMap((t) => Object.values(t).flat()),
  ];

  it("uses no code points that only Zawgyi puts in Burmese text", () => {
    // Zawgyi stores stacked and variant glyphs in U+1060–U+1097, which Unicode Burmese never uses.
    for (const s of burmese) expect(s, s).not.toMatch(/[ၠ-႗]/);
  });

  it("never stores the e-vowel sign before its consonant (Zawgyi's visual order)", () => {
    for (const s of burmese) expect(s, s).not.toMatch(/(^|[\s(“"-])ေ/);
  });
});

describe("never reassuring, in every language", () => {
  it.each(LOCALES)("%s messages contain no reassuring words", (locale) => {
    const hits = leaves(DICTS[locale]).filter(([k, v]) => !NEGATED_WARNING_KEYS.has(k) && FORBIDDEN[locale].test(v));
    expect(hits).toEqual([]);
  });

  it.each(["th", "my"] as const)("%s species text contains no reassuring words", (locale) => {
    const hits = Object.entries(SPECIES_TEXT[locale]).flatMap(([id, t]) =>
      Object.values(t)
        .flat()
        .filter((v) => FORBIDDEN[locale].test(String(v)))
        .map((v) => `${id}: ${v}`),
    );
    expect(hits).toEqual([]);
  });

  it("the patterns catch the Thai and Burmese for harmless / safe to touch / definitely", () => {
    for (const s of ["งูตัวนี้ไม่เป็นอันตราย", "จับได้อย่างปลอดภัย", "ปลอดภัยที่จะเข้าใกล้", "เป็นงูเหลือมแน่นอน"]) expect(s).toMatch(FORBIDDEN.th);
    for (const s of ["ဤမြွေသည် အန္တရာယ်မရှိပါ", "ကိုင်တွယ်ရန် ဘေးကင်းသည်", "သေချာပေါက် အဆိပ်မရှိ"]) expect(s).toMatch(FORBIDDEN.my);
    // …but not the negated forms, which mean "uncertain".
    expect("ความไม่แน่นอน").not.toMatch(FORBIDDEN.th);
    expect("မသေချာပါ").not.toMatch(FORBIDDEN.my);
  });
});

describe("names are never translated", () => {
  it.each(LOCALES)("%s: species names, scientific names, ids and taxonomy are identical to the catalog", (locale) => {
    for (const s of SPECIES) {
      const { species } = localizeSpecies(s, locale);
      expect(
        { id: species.id, commonName: species.commonName, otherNames: species.otherNames, scientificName: species.scientificName, genus: species.genus, family: species.family },
        s.id,
      ).toEqual({ id: s.id, commonName: s.commonName, otherNames: s.otherNames, scientificName: s.scientificName, genus: s.genus, family: s.family });
      // Every non-translatable field is untouched.
      const fixed = (r: typeof s) => Object.fromEntries(Object.entries(r).filter(([k]) => !(TRANSLATABLE_SPECIES_FIELDS as readonly string[]).includes(k)));
      expect(fixed(species), s.id).toEqual(fixed(s));
    }
  });

  it.each(["th", "my"] as const)("%s species translations only cover catalog species and translatable fields", (locale) => {
    const ids = new Set(SPECIES.map((s) => s.id));
    for (const [id, text] of Object.entries(SPECIES_TEXT[locale])) {
      expect(ids.has(id), id).toBe(true);
      for (const field of Object.keys(text)) expect(TRANSLATABLE_SPECIES_FIELDS, `${id}.${field}`).toContain(field);
      const original = SPECIES.find((s) => s.id === id)!;
      if (text.medicalEffects) expect(text.medicalEffects.length, `${id}.medicalEffects`).toBe(original.medicalEffects.length);
    }
  });

  it.each(["th", "my"] as const)("%s: a missing species translation is reported, never silent", (locale) => {
    const untranslated = SPECIES.find((s) => !SPECIES_TEXT[locale][s.id])!;
    expect(localizeSpecies(untranslated, locale).untranslated).toEqual(
      expect.arrayContaining(["appearance", "habitat", "riskRationale", "medicalEffects"]),
    );
  });

  it.each(LOCALES)("%s: candidate labels keep species, scientific, genus and group names as they are", (locale) => {
    const t = DICTS[locale];
    const TH = getCountry("TH");
    const named = (p: number, scientific_name: string, genus: string, family: string) => ({ ...c("not_in_catalog", p), scientific_name, genus, family });
    const d = decide(
      raw({
        overall_confidence: "low",
        candidates: [c("malayan-krait", 0.4), named(0.3, "Bungarus multicinctus", "Bungarus", "Elapidae"), named(0.2, "Bungarus fantasticus", "Bungarus", "Elapidae")],
      }),
      TH,
    );
    const views = [d.top, d.closestMatch, ...d.alternatives, ...d.couldAlsoBe].filter((v) => v !== null);
    for (const v of views) {
      const label = candidateLabel(v, t);
      if (v.kind === "species" || v.kind === "taxonomy") expect(label).toBe(v.label);
      if (v.kind === "group") {
        expect(label).toContain(v.venomGroup!.commonName);
        expect(label).toContain(v.venomGroup!.name);
      }
    }
    expect(views.some((v) => v.kind === "group")).toBe(true);
  });
});

describe("REVIEW.md", () => {
  const review = readFileSync(path.join(__dirname, "..", "messages", "REVIEW.md"), "utf8");
  const rows = new Map(
    [...review.matchAll(/^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => [m[1], { th: m[2].trim(), my: m[3].trim() }]),
  );

  it("lists every safety-critical key, with a Thai and a Burmese status (run npm run i18n:review)", () => {
    const missing = reviewKeys().filter((k) => !rows.has(k));
    expect(missing).toEqual([]);
    for (const [key, s] of rows) {
      expect(s.th, key).toMatch(/^reviewed: (no|yes\b.*)$/);
      expect(s.my, key).toMatch(/^reviewed: (no|yes\b.*)$/);
    }
  });

  it("has no stale keys", () => {
    const current = new Set(reviewKeys());
    expect([...rows.keys()].filter((k) => !current.has(k))).toEqual([]);
  });

  it("covers first aid, emergency, keep distance, venom and risk text", () => {
    for (const k of ["firstAid.do.call", "firstAid.dont.tourniquet", "emergency.callNow", "safety.keepDistance", "safety.actions.noTouch", "safety.lookAlike", "venomStatus.non_venomous.label", "venomType.neurotoxic.description", "risk.very_high", "venomPanel.riskExplainer"]) {
      expect(rows.has(k), k).toBe(true);
    }
  });
});

describe("contacts", () => {
  it("every emergency contact label has a translation in every language, and the number is dialable digits", () => {
    for (const country of COUNTRIES) {
      for (const contact of country.emergency) {
        for (const locale of LOCALES) {
          expect(DICTS[locale].contacts[contact.label], `${country.code} ${contact.number} ${locale}`).toBeTruthy();
          if (contact.note) expect(DICTS[locale].contacts[contact.note]).toBeTruthy();
        }
        expect(contact.number).toMatch(/^[0-9+\- ]+$/);
      }
    }
  });
});

describe("language choice", () => {
  it("prefers the saved choice", () => {
    expect(pickLocale({ saved: "my", acceptLanguage: "th-TH,th", country: "TH" })).toBe("my");
  });
  it("then Accept-Language, by quality", () => {
    expect(pickLocale({ acceptLanguage: "th-TH,th;q=0.9,en;q=0.8" })).toBe("th");
    expect(pickLocale({ acceptLanguage: "fr;q=1, my;q=0.7, en;q=0.5" })).toBe("my");
    expect(pickLocale({ acceptLanguage: "en-US,en;q=0.9", country: "TH" })).toBe("en");
    expect(acceptedLanguages("th;q=0, en")).toEqual(["en"]);
  });
  it("then the selected country, then English", () => {
    expect(pickLocale({ acceptLanguage: "zh-CN", country: "TH" })).toBe("th");
    expect(pickLocale({ acceptLanguage: "zh-CN", country: "MM" })).toBe("my");
    expect(pickLocale({ acceptLanguage: "zh-CN", country: "VN" })).toBe("en");
    expect(pickLocale({})).toBe("en");
  });
  it("ignores unsupported saved values", () => {
    expect(pickLocale({ saved: "fr", acceptLanguage: "th" })).toBe("th");
  });
  it("switching keeps the page", () => {
    expect(localePath("my", stripLocale("/th/species/malayan-krait"))).toBe("/my/species/malayan-krait");
    expect(localePath("th", stripLocale("/en"))).toBe("/th");
  });
});

describe("numbers", () => {
  it.each(LOCALES)("%s: percentages use Western digits", (locale) => {
    expect(formatPercent(0.55, locale)).toMatch(/^55\s?%$/);
  });
  it("interpolates names and numbers unchanged", () => {
    expect(fmt(th.result.call, { number: "1669" })).toContain("1669");
    expect(fmt(my.result.forMostLikely, { name: "Malayan Krait" })).toContain("Malayan Krait");
  });
});

describe("Burmese country names", () => {
  it("has a Myanmar Unicode name for every listed country", async () => {
    const { countryName } = await import("@/i18n/format");
    for (const c of COUNTRIES) expect(countryName(c.code, "my"), c.code).toMatch(/[က-႟]/);
  });
});
