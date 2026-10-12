import type { RegionCode } from "@/types";
import type { Messages } from "@/i18n/messages";

/** Keys of contacts.* in messages/*.json; every label and note is shown in the interface language. */
export type ContactKey = keyof Messages["contacts"];

export interface EmergencyContact {
  label: ContactKey;
  /** Shown exactly as written, in Western digits, so it can be dialled. */
  number: string;
  note?: ContactKey;
}

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  region: RegionCode;
  emergency: EmergencyContact[];
}

/**
 * Emergency numbers — DRAFT. These are widely published numbers, but each must
 * be re-verified against an official national source before launch, and
 * periodically after. The UI tells users to confirm locally.
 *
 * Countries added for coverage have an empty list until a number is verified
 * against an official source; the UI then shows the generic "call your local
 * emergency number" text instead.
 */
export const COUNTRIES: Country[] = [
  {
    code: "TH",
    name: "Thailand",
    region: "southeast_asia",
    emergency: [
      { label: "emergencyMedical", number: "1669" },
      { label: "ramathibodiPoison", number: "1367", note: "poisonAdvice24h" },
    ],
  },
  { code: "MY", name: "Malaysia", region: "southeast_asia", emergency: [{ label: "emergencyServices", number: "999" }] },
  { code: "SG", name: "Singapore", region: "southeast_asia", emergency: [{ label: "ambulanceFire", number: "995" }] },
  { code: "VN", name: "Vietnam", region: "southeast_asia", emergency: [{ label: "ambulance", number: "115" }] },
  { code: "PH", name: "Philippines", region: "southeast_asia", emergency: [{ label: "emergencyServices", number: "911" }] },
  { code: "ID", name: "Indonesia", region: "southeast_asia", emergency: [{ label: "emergencyServices", number: "112" }] },
  { code: "IN", name: "India", region: "south_asia", emergency: [
      { label: "emergencyServices", number: "112" },
      { label: "ambulanceMostStates", number: "108" },
    ] },
  { code: "AU", name: "Australia", region: "australia_png", emergency: [
      { label: "emergencyServices", number: "000" },
      { label: "auPoisonsCentre", number: "13 11 26" },
    ] },
  { code: "US", name: "United States", region: "north_america", emergency: [
      { label: "emergencyServices", number: "911" },
      { label: "usPoisonHelp", number: "1-800-222-1222" },
    ] },
  { code: "CA", name: "Canada", region: "north_america", emergency: [{ label: "emergencyServices", number: "911" }] },
  { code: "GB", name: "United Kingdom", region: "europe", emergency: [
      { label: "emergencyServices", number: "999" },
      { label: "nhs111", number: "111", note: "nhs111Note" },
    ] },
  { code: "DE", name: "Germany", region: "europe", emergency: [{ label: "emergencyServices", number: "112" }] },
  { code: "FR", name: "France", region: "europe", emergency: [{ label: "emergencyServices", number: "112" }] },
  { code: "ZA", name: "South Africa", region: "sub_saharan_africa", emergency: [
      { label: "ambulance", number: "10177" },
      { label: "emergencyFromMobile", number: "112" },
    ] },
  { code: "KE", name: "Kenya", region: "sub_saharan_africa", emergency: [{ label: "emergencyServices", number: "999" }] },

  // Southeast Asia — emergency numbers not yet verified.
  { code: "BN", name: "Brunei", region: "southeast_asia", emergency: [] },
  { code: "KH", name: "Cambodia", region: "southeast_asia", emergency: [] },
  { code: "LA", name: "Laos", region: "southeast_asia", emergency: [] },
  { code: "MM", name: "Myanmar", region: "southeast_asia", emergency: [] },
  { code: "TL", name: "Timor-Leste", region: "southeast_asia", emergency: [] },

  // South Asia — emergency numbers not yet verified.
  { code: "AF", name: "Afghanistan", region: "south_asia", emergency: [] },
  { code: "BD", name: "Bangladesh", region: "south_asia", emergency: [] },
  { code: "BT", name: "Bhutan", region: "south_asia", emergency: [] },
  { code: "MV", name: "Maldives", region: "south_asia", emergency: [] },
  { code: "NP", name: "Nepal", region: "south_asia", emergency: [] },
  { code: "PK", name: "Pakistan", region: "south_asia", emergency: [] },
  { code: "LK", name: "Sri Lanka", region: "south_asia", emergency: [] },
];

/** Region names are in messages/*.json under regions.*. */
export const REGION_CODES: RegionCode[] = [
  "south_asia",
  "southeast_asia",
  "east_asia",
  "australia_png",
  "north_america",
  "sub_saharan_africa",
  "europe",
];

export function getCountry(code: string | null | undefined): Country | null {
  if (!code) return null;
  return COUNTRIES.find((c) => c.code === code) ?? null;
}

export const COUNTRY_CODES = COUNTRIES.map((c) => c.code);
