"use client";
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import { CityPicker } from "@/components/nearMe/CityPicker";
import { usePlace } from "@/components/nearMe/usePlace";
import { SavedToHistory } from "@/components/history/SavedToHistory";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { saveToHistory } from "@/lib/history";
import {
  BEHAVIOURS,
  COLOURS,
  HEADS,
  MAX_COLOURS,
  NOT_SURE,
  PATTERNS,
  SETTINGS,
  SIZES,
  TIMES,
  type Behaviour,
  type Colour,
  type DescribedPlace,
  type Description,
} from "@/lib/describe";
import type { DescriptionResult } from "@/types";
import { HeadDrawing, PatternDrawing } from "./Drawings";
import { DescriptionResultView } from "./DescriptionResultView";

const STEPS = ["place", "colours", "pattern", "head", "size", "setting", "time", "behaviour"] as const;
type Step = (typeof STEPS)[number];

/** Answers so far: undefined = not answered yet. */
type Draft = { [K in keyof Description]?: Description[K] };

type Phase =
  | { phase: "asking" }
  | { phase: "working" }
  | { phase: "done"; result: DescriptionResult }
  | { phase: "error"; message: string };

/** How long the result waits for History to save before showing anyway (as for photos). */
const HISTORY_SAVE_WAIT_MS = 1500;

const SINGLE: Partial<Record<Step, readonly string[]>> = { pattern: PATTERNS, head: HEADS, size: SIZES, setting: SETTINGS, time: TIMES };

/** Every question but the place and behaviour needs an answer (which may be "Not sure"). */
function answered(step: Step, draft: Draft): boolean {
  if (step === "place" || step === "behaviour") return true;
  const v = draft[step];
  return Array.isArray(v) ? v.length > 0 : v !== undefined;
}

function complete(draft: Draft): Description {
  return {
    place: draft.place ?? null,
    colours: draft.colours ?? NOT_SURE,
    pattern: draft.pattern ?? NOT_SURE,
    head: draft.head ?? NOT_SURE,
    size: draft.size ?? NOT_SURE,
    setting: draft.setting ?? NOT_SURE,
    time: draft.time ?? NOT_SURE,
    behaviour: draft.behaviour ?? [],
  };
}

function errorText(status: number, code: string | undefined, t: Messages): string {
  if (status === 429 || code === "rate_limited") return t.describe.errors.rateLimited;
  if (code === "invalid") return t.describe.errors.invalid;
  return t.errors.generic;
}

/** `notice` names the AI provider; it is rendered on the server so it matches the runtime config. */
export function DescribeFlow({ notice }: { notice: ReactNode }) {
  const t = useT();
  const [nearMePlace] = usePlace();
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>({});
  const [missing, setMissing] = useState(false);
  const [state, setState] = useState<Phase>({ phase: "asking" });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const request = useRef<AbortController | null>(null);

  const step = STEPS[index];
  // The place remembered from Snakes near me starts as the answer; it can be changed or skipped.
  const place = draft.place === undefined ? nearMePlace : draft.place;

  // Focus each new question's heading (and the result's), but not on first load.
  useEffect(() => {
    if (!moved.current) return;
    headingRef.current?.focus();
  }, [index, state.phase]);

  function go(to: number) {
    moved.current = true;
    setMissing(false);
    setIndex(to);
  }

  function next() {
    if (!answered(step, draft)) {
      setMissing(true);
      return;
    }
    if (step === "place" && draft.place === undefined) setDraft((d) => ({ ...d, place: nearMePlace }));
    if (index < STEPS.length - 1) go(index + 1);
    else void submit({ ...draft, place });
  }

  async function submit(answers: Draft) {
    moved.current = true;
    setState({ phase: "working" });
    const ctrl = new AbortController();
    request.current = ctrl;
    try {
      const res = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(complete(answers)),
        signal: ctrl.signal,
      });
      const body = (await res.json().catch(() => null)) as (DescriptionResult & { code?: string }) | null;
      if (!res.ok || !body || body.mode !== "description") {
        setState({ phase: "error", message: errorText(res.status, body?.code, t) });
        return;
      }
      // Saved on this device only, and only when "Save my results" is on. Slow or blocked storage never holds up the result.
      await Promise.race([saveToHistory(body, []), new Promise((r) => setTimeout(r, HISTORY_SAVE_WAIT_MS))]);
      if (!ctrl.signal.aborted) setState({ phase: "done", result: body });
    } catch {
      if (!ctrl.signal.aborted) setState({ phase: "error", message: t.errors.network });
    }
  }

  function startOver() {
    request.current?.abort();
    setDraft({});
    setState({ phase: "asking" });
    go(0);
  }

  if (state.phase === "done") {
    return (
      <>
        <DescriptionResultView result={state.result} headingRef={headingRef} onStartOver={startOver} />
        {state.result.status !== "service_unavailable" && <SavedToHistory resultId={state.result.id} />}
      </>
    );
  }

  if (state.phase === "working" || state.phase === "error") {
    return (
      <section aria-labelledby="describe-step" className="space-y-5 rounded-card border border-line bg-surface p-5 sm:p-8">
        <h2 id="describe-step" ref={headingRef} tabIndex={-1} className="type-h2 outline-none">
          {state.phase === "working" ? t.describe.working : t.identify.failedTitle}
        </h2>
        {state.phase === "working" ? (
          <div role="status" aria-label={t.describe.working} className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="indeterminate h-full w-1/3 rounded-full bg-gold" />
          </div>
        ) : (
          <>
            <p role="alert" className="rounded-badge border border-high-border bg-high-bg px-4 py-3 text-small text-high">{state.message}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button onClick={() => submit({ ...draft, place })}>{t.common.tryAgain}</Button>
              <Button variant="secondary" onClick={startOver}>{t.describe.result.startOver}</Button>
            </div>
          </>
        )}
      </section>
    );
  }

  const last = index === STEPS.length - 1;
  const title = t.describe[step].title;
  const hint = step === "place" ? t.describe.place.hint : step === "colours" ? t.describe.colours.hint : step === "behaviour" ? t.describe.behaviour.hint : null;

  return (
    <section aria-labelledby="describe-step" className="space-y-6 rounded-card border border-line bg-surface p-5 sm:p-8">
      <Progress index={index} />
      <Question
        title={title}
        hint={hint}
        headingRef={headingRef}
        group={step !== "place"}
        error={missing ? t.describe.chooseAnswer : null}
      >
        {step === "place" && (
          <PlaceStep
            place={place}
            onPick={(p) => setDraft((d) => ({ ...d, place: p }))}
            onSkip={() => {
              setDraft((d) => ({ ...d, place: null }));
              go(index + 1);
            }}
          />
        )}
        {step === "colours" && (
          <ColoursStep
            value={draft.colours}
            onChange={(colours) => {
              setMissing(false);
              setDraft((d) => ({ ...d, colours }));
            }}
          />
        )}
        {step === "behaviour" && <BehaviourStep value={draft.behaviour} onChange={(behaviour) => setDraft((d) => ({ ...d, behaviour }))} />}
        {SINGLE[step] && (
          <SingleStep
            name={step}
            options={SINGLE[step]!}
            labels={t.describe[step as "pattern"] as Record<string, string>}
            value={draft[step as "pattern"]}
            art={step === "pattern" ? PatternDrawing : step === "head" ? HeadDrawing : undefined}
            onChange={(v) => {
              setMissing(false);
              setDraft((d) => ({ ...d, [step]: v }));
            }}
          />
        )}
      </Question>

      <div className="flex flex-wrap-reverse gap-3 sm:flex-nowrap">
        {index > 0 && (
          <Button variant="secondary" onClick={() => go(index - 1)} className="flex-1 sm:flex-none">
            <ArrowLeft aria-hidden className="size-4" /> {t.describe.back}
          </Button>
        )}
        <Button onClick={next} className="flex-[2] sm:ml-auto sm:min-w-56 sm:flex-none">
          {last ? t.describe.seeMatches : t.describe.next} {!last && <ArrowRight aria-hidden className="size-4" />}
        </Button>
      </div>
      {last && <p className="text-small text-ink-2">{notice}</p>}
    </section>
  );
}

function Progress({ index }: { index: number }) {
  const t = useT();
  const text = fmt(t.describe.progress, { n: index + 1, total: STEPS.length });
  return (
    <div>
      <p className="text-small font-medium text-ink-2" aria-hidden>{text}</p>
      <div
        role="progressbar"
        aria-label={t.describe.title}
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={index + 1}
        aria-valuetext={text}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
      </div>
    </div>
  );
}

/** The question heading (focused on each new question) and its answers as one labelled group. */
function Question({
  title,
  hint,
  headingRef,
  group,
  error,
  children,
}: {
  title: string;
  hint: string | null;
  headingRef: Ref<HTMLHeadingElement>;
  /** Radios and checkboxes go in a fieldset named by the heading; the place search labels itself. */
  group: boolean;
  error: string | null;
  children: ReactNode;
}) {
  const id = useId();
  const heading = (
    <>
      <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="type-h2 outline-none">{title}</h2>
      {hint && <p id={`${id}-hint`} className="mt-2 text-small text-ink-2">{hint}</p>}
    </>
  );
  const alert = (
    <p role="alert" id={`${id}-error`} className={error ? "mt-4 rounded-badge border border-high-border bg-high-bg px-4 py-3 text-small text-high" : "sr-only"}>
      {error}
    </p>
  );
  if (!group) {
    return (
      <div>
        {heading}
        <div className="mt-5">{children}</div>
        {alert}
      </div>
    );
  }
  return (
    <div>
      {heading}
      <fieldset
        aria-labelledby={`${id}-title`}
        aria-describedby={[hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
        className="mt-5"
      >
        {children}
      </fieldset>
      {alert}
    </div>
  );
}

function OptionCard({
  type,
  name,
  checked,
  disabled,
  onChange,
  art,
  notSure = false,
  children,
}: {
  type: "radio" | "checkbox";
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  art?: ReactNode;
  notSure?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`opt-card ${notSure ? "opt-not-sure" : ""}`}>
      <input type={type} name={name} checked={checked} disabled={disabled} onChange={onChange} className="opt-input" />
      {art && (
        <span aria-hidden className="opt-art">
          {art}
        </span>
      )}
      <span className="min-w-0">{children}</span>
    </label>
  );
}

const GRID = "grid gap-3 sm:grid-cols-2";

function SingleStep({
  name,
  options,
  labels,
  value,
  art: Art,
  onChange,
}: {
  name: string;
  options: readonly string[];
  labels: Record<string, string>;
  value: string | undefined;
  art?: (p: { value: string }) => ReactNode;
  onChange: (v: string) => void;
}) {
  const t = useT();
  return (
    <div className={GRID}>
      {options.map((o) => (
        <OptionCard key={o} type="radio" name={name} checked={value === o} onChange={() => onChange(o)} art={Art ? <Art value={o} /> : undefined}>
          {labels[o]}
        </OptionCard>
      ))}
      <OptionCard type="radio" name={name} checked={value === NOT_SURE} onChange={() => onChange(NOT_SURE)} notSure>
        {t.describe.notSure}
      </OptionCard>
    </div>
  );
}

/** Up to three colours, or "Not sure" (which clears the colours, and is cleared by choosing one). */
function ColoursStep({ value, onChange }: { value: Description["colours"] | undefined; onChange: (v: Description["colours"]) => void }) {
  const t = useT();
  const chosen: Colour[] = Array.isArray(value) ? value : [];
  const full = chosen.length >= MAX_COLOURS;
  const toggle = (c: Colour) => onChange(chosen.includes(c) ? chosen.filter((x) => x !== c) : [...chosen, c]);
  return (
    <>
      <div className={GRID}>
        {COLOURS.map((c) => (
          <OptionCard
            key={c}
            type="checkbox"
            name="colours"
            checked={chosen.includes(c)}
            disabled={full && !chosen.includes(c)}
            onChange={() => toggle(c)}
            art={<span className={`swatch swatch-${c}`} />}
          >
            {t.describe.colours[c]}
          </OptionCard>
        ))}
        <OptionCard type="checkbox" name="colours" checked={value === NOT_SURE} onChange={() => onChange(value === NOT_SURE ? [] : NOT_SURE)} notSure>
          {t.describe.notSure}
        </OptionCard>
      </div>
      <p aria-live="polite" className="mt-3 text-small text-ink-2">{full ? t.describe.colours.limit : ""}</p>
    </>
  );
}

/** Optional: any that apply, or "Not sure". */
function BehaviourStep({ value, onChange }: { value: Description["behaviour"] | undefined; onChange: (v: Description["behaviour"]) => void }) {
  const t = useT();
  const chosen: Behaviour[] = Array.isArray(value) ? value : [];
  const toggle = (b: Behaviour) => onChange(chosen.includes(b) ? chosen.filter((x) => x !== b) : [...chosen, b]);
  return (
    <div className={GRID}>
      {BEHAVIOURS.map((b) => (
        <OptionCard key={b} type="checkbox" name="behaviour" checked={chosen.includes(b)} onChange={() => toggle(b)}>
          {t.describe.behaviour[b]}
        </OptionCard>
      ))}
      <OptionCard type="checkbox" name="behaviour" checked={value === NOT_SURE} onChange={() => onChange(value === NOT_SURE ? [] : NOT_SURE)} notSure>
        {t.describe.notSure}
      </OptionCard>
    </div>
  );
}

/** The Near me city picker, or the chosen place with a way to change it. */
function PlaceStep({ place, onPick, onSkip }: { place: DescribedPlace | null; onPick: (p: DescribedPlace) => void; onSkip: () => void }) {
  const t = useT();
  const [changing, setChanging] = useState(false);
  const skip = (
    <button
      type="button"
      onClick={onSkip}
      className="inline-flex min-h-11 items-center font-medium text-ink-2 underline underline-offset-4 hover:text-ink"
    >
      {t.describe.place.skip}
    </button>
  );
  if (place && !changing) {
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-3 rounded-card border border-gold bg-surface-2 px-4 py-3">
          <MapPin aria-hidden className="mt-1 size-5 shrink-0 text-gold-light" />
          <span className="min-w-0">
            <span className="block font-semibold">{fmt(t.describe.place.seenNear, { place: place.name })}</span>
            <span className="block text-small text-ink-2">{[place.region, place.country].filter(Boolean).join(", ")}</span>
          </span>
        </p>
        <div className="flex flex-wrap gap-x-6">
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4"
          >
            {t.describe.place.change}
          </button>
          {skip}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <CityPicker
        autoFocus={changing}
        onPick={(p) => {
          setChanging(false);
          onPick(p);
        }}
      />
      {skip}
    </div>
  );
}
