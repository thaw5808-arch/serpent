"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, ImageUp, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CountrySelect } from "@/components/safety/CountrySelect";
import { useLocale, useT } from "@/i18n/client";
import { localePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { useCountry } from "@/lib/useCountry";
import { prepareImage, PrepareImageError, type PreparedImage } from "@/lib/compressImage";
import { MAX_PHOTOS_PER_REQUEST } from "@/lib/imageValidation";
import { saveResult } from "@/lib/resultStore";
import type { IdentificationResult } from "@/types";
import { AnalysisProgress, type Phase } from "./AnalysisProgress";

type State =
  | { step: "choose" }
  | { step: "preview"; images: PreparedImage[]; message?: string }
  | { step: "working"; images: PreparedImage[]; phase: Phase; uploadPct: number }
  | { step: "error"; images: PreparedImage[]; message: string };

type ApiError = { error?: string; code?: string; photo?: number };

/** The API's error in the interface language; unknown codes get the generic message, never raw English. */
function apiErrorText(body: ApiError | null, t: Messages): string {
  const api = t.errors.api as Record<string, string>;
  const text = body?.code && body.code in api && body.code !== "photoPrefix" ? fmt(api[body.code], { max: MAX_PHOTOS_PER_REQUEST }) : null;
  if (!text) return t.errors.generic;
  return body?.photo ? fmt(t.errors.api.photoPrefix, { n: body.photo, error: text }) : text;
}

/** `notice` names the AI provider; it is rendered on the server so it matches the runtime config. */
export function IdentifyFlow({ notice }: { notice: ReactNode }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [country, setCountry] = useCountry();
  const [state, setState] = useState<State>({ step: "choose" });
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** Object URLs of previews currently on screen; revoked when their photos are dropped. */
  const previewUrls = useRef(new Set<string>());
  /** Bumped on every reset so photo preparation that finishes afterwards is discarded. */
  const generation = useRef(0);

  // Move focus to the step heading when the step changes, for screen-reader users.
  useEffect(() => {
    headingRef.current?.focus();
  }, [state.step]);

  /** Drops all photos and any in-flight request, back to the empty "Add a photo" step. */
  const clearFlow = useCallback(() => {
    generation.current++;
    const xhr = xhrRef.current;
    xhrRef.current = null;
    xhr?.abort();
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear();
    setState({ step: "choose" });
  }, []);

  // With Cache Components, Next.js hides this route with <Activity> on navigation instead of
  // unmounting it, so its state would come back on the next visit. Every visit should start a new
  // identification: clear the flow whenever the route is hidden (layout cleanup runs before hiding).
  useLayoutEffect(() => clearFlow, [clearFlow]);

  const images = state.step === "choose" ? [] : state.images;
  const room = MAX_PHOTOS_PER_REQUEST - images.length;

  /** Adds photos of the same snake, up to the limit. */
  async function onFiles(list: FileList | null) {
    const files = [...(list ?? [])].slice(0, room);
    if (files.length === 0) return;
    const gen = generation.current;
    try {
      const prepared = await Promise.all(files.map(prepareImage));
      if (gen !== generation.current) {
        prepared.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        return;
      }
      prepared.forEach((p) => previewUrls.current.add(p.previewUrl));
      setState({ step: "preview", images: [...images, ...prepared] });
    } catch (e) {
      if (gen !== generation.current) return;
      // Keep the photos already added; only the new one failed to open.
      const message = e instanceof PrepareImageError ? t.errors.photo[e.code] : t.errors.photo.process_failed;
      setState(images.length ? { step: "preview", images, message } : { step: "error", images, message });
    }
  }

  function removeImage(index: number) {
    const next = images.filter((_, i) => i !== index);
    URL.revokeObjectURL(images[index].previewUrl);
    previewUrls.current.delete(images[index].previewUrl);
    setState(next.length ? { step: "preview", images: next } : { step: "choose" });
  }

  function analyze(photos: PreparedImage[]) {
    setState({ step: "working", images: photos, phase: "uploading", uploadPct: 0 });

    const form = new FormData();
    photos.forEach((p, i) => form.append("image", p.blob, `photo-${i + 1}.jpg`));
    form.append("country", country);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/identify");
    xhr.responseType = "json";
    const current = () => xhrRef.current === xhr;
    xhr.upload.onprogress = (e) => {
      if (current() && e.lengthComputable) {
        setState((s) => (s.step === "working" ? { ...s, uploadPct: Math.round((e.loaded / e.total) * 100) } : s));
      }
    };
    xhr.upload.onload = () => {
      if (current()) setState((s) => (s.step === "working" ? { ...s, phase: "analyzing", uploadPct: 100 } : s));
    };
    xhr.onerror = () => {
      if (!current()) return;
      setState({ step: "error", images: photos, message: t.errors.network });
    };
    xhr.onload = () => {
      if (!current()) return;
      const body = xhr.response as (IdentificationResult & ApiError) | null;
      if (xhr.status !== 200 || !body || body.error) {
        setState({ step: "error", images: photos, message: apiErrorText(body, t) });
        return;
      }
      saveResult(body, photos.map((p) => p.thumbnail));
      // The request is done. Leaving hides this route, which runs clearFlow above, so the photos
      // and preview URLs are released without flashing the empty step before /result appears.
      xhrRef.current = null;
      router.push(localePath(locale, "/result"));
    };
    xhr.send(form);
  }

  const inputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );

  const plural = images.length > 1;

  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 text-small">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-caution" />
        <span>
          <strong className="font-semibold">{t.identify.warningStrong}</strong> {t.identify.warning}
        </span>
      </p>

      {state.step === "choose" && (
        <section aria-labelledby="step-heading" className="space-y-6 rounded-card border border-line bg-surface p-5 sm:p-8">
          <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="type-h2 outline-none">
            {t.identify.addPhotoTitle}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button viewfinder onClick={() => cameraRef.current?.click()}>
              <Camera aria-hidden className="size-5" /> {t.identify.takePhoto}
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} className="sm:min-h-15">
              <ImageUp aria-hidden className="size-5" /> {t.identify.uploadPhotos}
            </Button>
          </div>
          <p className="text-small text-ink-2">{fmt(t.identify.maxPhotos, { max: MAX_PHOTOS_PER_REQUEST })}</p>
          {inputs}
          <CountrySelect
            value={country}
            onChange={setCountry}
            hint={t.identify.countryHint}
          />
        </section>
      )}

      {state.step !== "choose" && images.length > 0 && (
        <section aria-labelledby="step-heading" className="space-y-5 rounded-card border border-line bg-surface p-5 sm:p-8">
          <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="type-h2 outline-none">
            {state.step === "working"
              ? plural ? t.identify.analyzingMany : t.identify.analyzingOne
              : state.step === "error"
                ? t.identify.failedTitle
                : plural ? t.identify.checkMany : t.identify.checkOne}
          </h2>

          <ul className={`grid gap-3 ${plural ? "grid-cols-2 sm:grid-cols-3" : ""}`}>
            {images.map((img, i) => (
              <li key={img.previewUrl} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img
                  src={img.previewUrl}
                  alt={fmt(t.identify.photoAlt, { n: i + 1 })}
                  className={`w-full rounded-card border border-line bg-surface-2 object-contain ${plural ? "aspect-square object-cover" : "max-h-[55vh]"}`}
                />
                {state.step === "preview" && (
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    aria-label={fmt(t.identify.removePhoto, { n: i + 1 })}
                    className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-full border border-line bg-paper text-ink"
                  >
                    <X aria-hidden className="size-5" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {state.step === "preview" && (
            <>
              {state.message && (
                <p role="alert" className="rounded-badge border border-high-border bg-high-bg px-4 py-3 text-small text-high">{state.message}</p>
              )}
              {images.some((i) => i.lowResolution) && (
                <p className="flex items-start gap-2 text-small text-caution">
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>{plural ? t.identify.lowResMany : t.identify.lowResOne}</span>
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                <Button onClick={() => analyze(images)}>
                  {plural ? fmt(t.identify.analyzeMany, { n: images.length }) : t.identify.analyzeOne}
                </Button>
                {room > 0 && (
                  <>
                    <Button variant="secondary" onClick={() => cameraRef.current?.click()}>
                      <Camera aria-hidden className="size-4" /> {t.identify.addPhoto}
                    </Button>
                    <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                      <ImageUp aria-hidden className="size-4" /> {t.identify.uploadMore}
                    </Button>
                  </>
                )}
              </div>
              <p className="text-small text-ink-2">
                {room > 0
                  ? room === 1 ? t.identify.roomOne : fmt(t.identify.roomMany, { n: room })
                  : fmt(t.identify.atMax, { max: MAX_PHOTOS_PER_REQUEST })}
              </p>
              {inputs}
              <p className="text-small text-ink-2">{notice}</p>
            </>
          )}

          {state.step === "working" && (
            <>
              <AnalysisProgress phase={state.phase} uploadPct={state.uploadPct} />
              <Button variant="ghost" onClick={clearFlow}>{t.common.cancel}</Button>
            </>
          )}

          {state.step === "error" && (
            <>
              <p role="alert" className="rounded-badge border border-high-border bg-high-bg px-4 py-3 text-small text-high">{state.message}</p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => analyze(images)}>{t.common.tryAgain}</Button>
                <Button variant="secondary" onClick={clearFlow}><RotateCcw aria-hidden className="size-4" /> {t.identify.startOver}</Button>
              </div>
            </>
          )}
        </section>
      )}

      {state.step === "error" && images.length === 0 && (
        <section aria-labelledby="step-heading" className="space-y-4 rounded-card border border-line bg-surface p-5 sm:p-8">
          <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="type-h2 outline-none">
            {t.identify.cantOpenTitle}
          </h2>
          <p role="alert" className="rounded-badge border border-high-border bg-high-bg px-4 py-3 text-small text-high">{state.message}</p>
          <Button onClick={clearFlow}>{t.identify.chooseAnother}</Button>
        </section>
      )}
    </div>
  );
}
