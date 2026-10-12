import "server-only";
import { Suspense } from "react";
import { connection } from "next/server";
import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { getDictionary } from "@/i18n/server";
import { VISION_PROVIDER } from "@/lib/labels";
import { configuredProvider } from "@/services/providers/config";

/*
 * Names the AI provider that actually receives the photo. Read at request time
 * (not at build) so the disclosure always matches VISION_PROVIDER in the
 * running environment. Product and company names are never translated.
 */

async function currentProvider() {
  await connection();
  const provider = configuredProvider();
  return provider ? VISION_PROVIDER[provider] : null;
}

async function NoticeText() {
  const [t, p] = await Promise.all([getDictionary(), currentProvider()]);
  return <>{p ? fmt(t.notice.uploadKnown, p) : t.notice.uploadUnknown}</>;
}

/** The short notice shown before a photo is uploaded. `t` is the current dictionary, for the fallback. */
export function PhotoUploadNotice({ t }: { t: Messages }) {
  return (
    <Suspense fallback={<>{t.notice.uploadUnknown}</>}>
      <NoticeText />
    </Suspense>
  );
}

async function PrivacyText() {
  const [t, p] = await Promise.all([getDictionary(), currentProvider()]);
  return <>{p ? fmt(t.notice.privacyKnown, p) : t.notice.privacyUnknown}</>;
}

/** The "Your photo" entry on the privacy page. */
export function PhotoPrivacyText({ t }: { t: Messages }) {
  return (
    <Suspense fallback={<>{t.notice.privacyUnknown}</>}>
      <PrivacyText />
    </Suspense>
  );
}
