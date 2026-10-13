import { describe, expect, inject, it } from "vitest";
import en from "../messages/en.json";
import th from "../messages/th.json";
import my from "../messages/my.json";

const base = inject("baseUrl");
const DICTS = { th, my } as const;

/** Text as it appears in HTML (React escapes apostrophes and quotes). */
const html = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, { redirect: "manual", headers });
  const body = await res.text();
  // `visible` drops scripts, where the serialized dictionary for client components lives.
  return { status: res.status, location: res.headers.get("location"), body, visible: body.replace(/<script[\s\S]*?<\/script>/g, "") };
}

/** Every page in Thai and Burmese, with text that must appear on it (from that locale's dictionary). */
const PAGES: [string, (t: typeof th) => string[]][] = [
  ["", (t) => [t.home.title, t.home.cta, t.home.howTitle]],
  ["/identify", (t) => [t.identify.title, t.identify.takePhoto, t.country.label, t.describe.entry]],
  ["/identify/describe", (t) => [t.describe.title, t.describe.place.title, t.describe.result.disclaimer]],
  ["/result", (t) => [t.result.srTitle]],
  ["/emergency", (t) => [t.emergency.callNow, t.firstAid.doTitle, t.firstAid.do.call, t.firstAid.dont.tourniquet]],
  ["/species", (t) => [t.speciesList.title]],
  ["/species/malayan-krait", (t) => [t.species.appearance, t.venomPanel.potencyTitle, t.safety.keepDistance]],
  ["/privacy", (t) => [t.privacy.title, t.privacy.location]],
];

describe.each(["th", "my"] as const)("/%s routes", (locale) => {
  const t = DICTS[locale];

  it.each(PAGES)(`/${locale}%s renders in ${locale}`, async (path, expected) => {
    const page = await get(`/${locale}${path}`);
    expect(page.status).toBe(200);
    expect(page.body).toContain(`<html lang="${locale}"`);
    for (const text of expected(t)) expect(page.body).toContain(html(text));
    // The header and footer are translated too, with the switcher in every script.
    expect(page.body).toContain(html(t.common.bitten));
    for (const name of ["English", "ไทย", "မြန်မာ"]) expect(page.body).toContain(name);
    // hreflang alternates for every locale.
    for (const l of ["en", "th", "my"]) expect(page.body).toMatch(new RegExp(`hrefLang="${l}" href="[^"]*/${l}${path}"`));
    // No English UI leaks into the localized page.
    expect(page.visible).not.toContain(html(en.footer.disclaimer));
  });

  it(`/${locale}/species/malayan-krait keeps the species names in the original`, async () => {
    const page = await get(`/${locale}/species/malayan-krait`);
    expect(page.body).toContain("Malayan Krait");
    expect(page.body).toContain("Bungarus candidus");
    expect(page.body).toContain("Elapidae");
  });

  it(`/${locale} links stay in ${locale}`, async () => {
    const page = await get(`/${locale}`);
    expect(page.body).toContain(`href="/${locale}/identify"`);
    expect(page.body).not.toMatch(/href="\/(identify|species|emergency|privacy)"/);
  });

  // The catch-all calls notFound() while prerendering, so the server sends a 404 shell and
  // the browser renders the localized not-found page into it (checked in a real browser).
  it(`/${locale}/unknown is a 404 that is not indexed`, async () => {
    const page = await get(`/${locale}/does-not-exist`);
    expect(page.status).toBe(404);
    expect(page.body).toContain('<meta name="robots" content="noindex"/>');
  });
});

describe("Burmese note", () => {
  it("only the Burmese site says it uses Myanmar Unicode", async () => {
    expect((await get("/my")).visible).toContain(html(my.footer.unicodeNote));
    expect((await get("/th")).visible).not.toContain(html(th.footer.unicodeNote));
    expect((await get("/en")).visible).not.toContain(html(en.footer.unicodeNote));
  });
});

describe("language choice on first visit", () => {
  it("uses the saved choice first", async () => {
    const r = await get("/emergency", { "accept-language": "th", cookie: "serpent-lang=my" });
    expect(r.status).toBe(307);
    expect(new URL(r.location!, base).pathname).toBe("/my/emergency");
  });
  it("then Accept-Language", async () => {
    const r = await get("/species", { "accept-language": "th-TH,th;q=0.9,en;q=0.5" });
    expect(new URL(r.location!, base).pathname).toBe("/th/species");
  });
  it("then the selected country", async () => {
    const r = await get("/", { "accept-language": "zh-CN", cookie: "serpent-country=MM" });
    expect(new URL(r.location!, base).pathname).toBe("/my");
  });
  it("then English", async () => {
    const r = await get("/privacy", { "accept-language": "zh-CN" });
    expect(new URL(r.location!, base).pathname).toBe("/en/privacy");
  });
  it("keeps /api unprefixed", async () => {
    const r = await get("/api/species/search?q=krait");
    expect(r.status).toBe(200);
  });
  it("keeps the curated-species redirect in the same language", async () => {
    const r = await get("/th/species/bungarus-candidus");
    expect(r.status).toBe(308);
    expect(new URL(r.location!, base).pathname).toBe("/th/species/malayan-krait");
  });
});
