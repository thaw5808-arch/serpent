import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IdentificationResult } from "@/types";

type HistoryModule = typeof import("@/lib/history");

const THUMB = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ";

function result(id: string, overrides: Partial<IdentificationResult> = {}): IdentificationResult {
  return {
    id,
    status: "likely_identified",
    message: "",
    analyzedAt: "2026-10-01T08:00:00.000Z",
    country: "TH",
    engine: { provider: "anthropic", model: "test" },
    imageIssues: [],
    top: null,
    alternatives: [],
    confidenceBand: "high",
    displayVenomStatus: "venomous",
    closestMatch: null,
    couldAlsoBe: [],
    observedFeatures: [],
    uncertaintyNotes: [],
    modelNotes: [],
    notes: [],
    safety: { headline: "", actions: [], actionKeys: [], lookAlike: { active: false, message: "", speciesIds: [] }, treatAsDangerous: true },
    ...overrides,
  };
}

/** Minute `i` after a fixed start, so save order is unambiguous. */
const at = (i: number) => ({ now: new Date(Date.UTC(2026, 9, 1, 8, i)) });

let history: HistoryModule;

/** A fresh, empty IndexedDB and a fresh module (its cached connection) for every test. */
async function load(factory: unknown = new IDBFactory()) {
  vi.stubGlobal("indexedDB", factory);
  vi.resetModules();
  history = await import("@/lib/history");
}

beforeEach(() => load());
afterEach(() => vi.unstubAllGlobals());

describe("history storage", () => {
  it("saves an entry with its id, time, country, full result and thumbnails", async () => {
    const r = result("a");
    const entry = await history.saveToHistory(r, [THUMB], at(0));
    expect(entry).toEqual({ id: "a", savedAt: "2026-10-01T08:00:00.000Z", country: "TH", result: r, thumbnails: [THUMB] });
    expect(await history.listHistory()).toEqual([entry]);
    expect(await history.isInHistory("a")).toBe(true);
    expect(await history.isInHistory("b")).toBe(false);
  });

  it("lists newest first", async () => {
    await history.saveToHistory(result("first"), [], at(1));
    await history.saveToHistory(result("third"), [], at(3));
    await history.saveToHistory(result("second"), [], at(2));
    expect((await history.listHistory())!.map((e) => e.id)).toEqual(["third", "second", "first"]);
  });

  it(`keeps only the newest ${50} entries, deleting the oldest`, async () => {
    expect(history.HISTORY_LIMIT).toBe(50);
    for (let i = 0; i < 53; i++) await history.saveToHistory(result(`r${i}`), [THUMB], at(i));
    const ids = (await history.listHistory())!.map((e) => e.id);
    expect(ids).toHaveLength(50);
    expect(ids[0]).toBe("r52");
    expect(ids.at(-1)).toBe("r3");
    expect(ids).not.toContain("r0");
    expect(ids).not.toContain("r2");
  });

  it("deletes one entry", async () => {
    await history.saveToHistory(result("a"), [], at(1));
    await history.saveToHistory(result("b"), [], at(2));
    expect(await history.deleteFromHistory("a")).toBe(true);
    expect((await history.listHistory())!.map((e) => e.id)).toEqual(["b"]);
    expect(await history.isInHistory("a")).toBe(false);
  });

  it("clears everything but keeps the setting", async () => {
    await history.setSaveSetting(false);
    await history.setSaveSetting(true);
    await history.saveToHistory(result("a"), [], at(1));
    await history.saveToHistory(result("b"), [], at(2));
    expect(await history.clearHistory()).toBe(true);
    expect(await history.listHistory()).toEqual([]);
    await history.setSaveSetting(false);
    await history.clearHistory();
    expect(await history.getSaveSetting()).toBe(false);
  });

  it("saving is on by default; when off, nothing new is saved and existing entries stay", async () => {
    expect(await history.getSaveSetting()).toBe(true);
    await history.saveToHistory(result("kept"), [], at(1));
    expect(await history.setSaveSetting(false)).toBe(true);
    expect(await history.getSaveSetting()).toBe(false);
    expect(await history.saveToHistory(result("skipped"), [], at(2))).toBeNull();
    expect((await history.listHistory())!.map((e) => e.id)).toEqual(["kept"]);
    await history.setSaveSetting(true);
    expect(await history.saveToHistory(result("again"), [], at(3))).not.toBeNull();
  });

  it("never saves a service_unavailable result", async () => {
    expect(await history.saveToHistory(result("x", { status: "service_unavailable" }), [], at(1))).toBeNull();
    expect(await history.listHistory()).toEqual([]);
  });

  it("stores only small JPEG thumbnails, never anything photo-sized", async () => {
    const huge = `data:image/jpeg;base64,${"A".repeat(400_000)}`;
    const png = "data:image/png;base64,iVBORw0KGgo";
    const entry = await history.saveToHistory(result("a"), [huge, png, THUMB, THUMB, THUMB, THUMB], at(1));
    expect(entry!.thumbnails).toEqual([THUMB, THUMB, THUMB]);
  });

  it("saving the same result twice keeps one entry", async () => {
    await history.saveToHistory(result("a"), [], at(1));
    await history.saveToHistory(result("a"), [], at(2));
    expect(await history.listHistory()).toHaveLength(1);
  });
});

describe("history storage unavailable", () => {
  const cases: [string, unknown][] = [
    ["no indexedDB at all", null],
    ["open throws (blocked)", { open: () => { throw new DOMException("denied", "SecurityError"); } }],
    [
      "open fails",
      {
        open: () => {
          const req: Record<string, unknown> = { error: new DOMException("denied", "InvalidStateError") };
          queueMicrotask(() => (req.onerror as () => void)());
          return req;
        },
      },
    ],
  ];

  it.each(cases)("%s: every call resolves without throwing", async (_, factory) => {
    await load(factory);
    expect(await history.listHistory()).toBeNull();
    expect(await history.getSaveSetting()).toBeNull();
    expect(await history.saveToHistory(result("a"), [THUMB])).toBeNull();
    expect(await history.isInHistory("a")).toBe(false);
    expect(await history.deleteFromHistory("a")).toBe(false);
    expect(await history.clearHistory()).toBe(false);
    expect(await history.setSaveSetting(false)).toBe(false);
  });

  it("open never answering: gives up instead of hanging", async () => {
    vi.useFakeTimers();
    try {
      await load({ open: () => ({}) });
      const pending = history.listHistory();
      await vi.advanceTimersByTimeAsync(3000);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
