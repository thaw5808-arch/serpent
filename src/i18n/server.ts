import { lang } from "next/root-params";
import { notFound } from "next/navigation";
import { hasLocale, type Locale } from "./config";
import type { Messages } from "./messages";

const dictionaries: Record<Locale, () => Promise<Messages>> = {
  en: () => import("../../messages/en.json").then((m) => m.default),
  th: () => import("../../messages/th.json").then((m) => m.default as Messages),
  my: () => import("../../messages/my.json").then((m) => m.default as Messages),
};

/** The locale of the current route, from the [lang] root segment. Unknown locales 404. */
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  if (!hasLocale(value)) notFound();
  return value;
}

export async function getDictionary(locale?: Locale): Promise<Messages> {
  return dictionaries[locale ?? (await getLocale())]();
}
