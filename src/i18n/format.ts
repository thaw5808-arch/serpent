import { getCountry } from "@/data/countries";
import type { Locale } from "./config";

/** Replaces {name} placeholders. Unknown placeholders are left visible so a missing param is noticed. */
export function fmt(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

const INTL: Record<Locale, string> = { en: "en", th: "th-TH", my: "my-MM" };

/** BCP 47 tag for Intl. Thai dates use the Buddhist calendar (th-TH default). */
export const intlLocale = (locale: Locale) => INTL[locale];

/** Numbers that must stay dialable or comparable (percentages) always use Western digits. */
const latn = (locale: Locale) => `${INTL[locale]}-u-nu-latn`;

/*
 * Some browsers (Chrome among them) ship without Burmese locale data, and Intl then
 * silently formats in English. Detect that and use a language-neutral fallback
 * instead of showing English inside a Burmese page.
 */
const hasData = (api: { supportedLocalesOf(l: string[]): string[] }, locale: Locale) =>
  locale === "en" || api.supportedLocalesOf([INTL[locale]]).length > 0;

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDateTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (!hasData(Intl.DateTimeFormat, locale)) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return new Intl.DateTimeFormat(INTL[locale], { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** A calendar date such as "2025-03-01" (no time zone shift). */
export function formatDate(isoDate: string, locale: Locale): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  if (!hasData(Intl.DateTimeFormat, locale)) return isoDate.slice(0, 10);
  return new Intl.DateTimeFormat(INTL[locale], { dateStyle: "long", timeZone: "UTC" }).format(d);
}

/** Burmese names for the countries we list, for browsers without Burmese locale data. DRAFT, see REVIEW.md. */
const MY_COUNTRY_NAMES: Record<string, string> = {
  TH: "ထိုင်း", MY: "မလေးရှား", SG: "စင်္ကာပူ", VN: "ဗီယက်နမ်", PH: "ဖိလစ်ပိုင်", ID: "အင်ဒိုနီးရှား",
  IN: "အိန္ဒိယ", AU: "ဩစတြေးလျ", US: "အမေရိကန်ပြည်ထောင်စု", CA: "ကနေဒါ", GB: "ယူနိုက်တက်ကင်းဒမ်း",
  DE: "ဂျာမနီ", FR: "ပြင်သစ်", ZA: "တောင်အာဖရိက", KE: "ကင်ညာ", BN: "ဘရူနိုင်း", KH: "ကမ္ဘောဒီးယား",
  LA: "လာအို", MM: "မြန်မာ", TL: "အရှေ့တီမော", AF: "အာဖဂန်နစ္စတန်", BD: "ဘင်္ဂလားဒေ့ရှ်", BT: "ဘူတန်",
  MV: "မော်လ်ဒိုက်", NP: "နီပေါ", PK: "ပါကစ္စတန်", LK: "သီရိလင်္ကာ",
};

/** 0.55 → "55%", always in Western digits. */
export function formatPercent(fraction: number, locale: Locale): string {
  return new Intl.NumberFormat(latn(locale), { style: "percent", maximumFractionDigits: 0 }).format(fraction);
}

/** Country name in the interface language, falling back to the English name in our data. */
export function countryName(code: string | null | undefined, locale: Locale): string {
  if (!code) return "";
  const english = getCountry(code)?.name ?? code;
  if (locale === "en") return english;
  if (locale === "my" && !hasData(Intl.DisplayNames, locale)) return MY_COUNTRY_NAMES[code] ?? english;
  try {
    return new Intl.DisplayNames([INTL[locale]], { type: "region" }).of(code) ?? english;
  } catch {
    return english;
  }
}
