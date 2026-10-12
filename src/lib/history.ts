"use client";
import { MAX_PHOTOS_PER_REQUEST } from "@/lib/imageValidation";
import type { IdentificationResult } from "@/types";

/*
 * History: past identifications, kept only in this browser's IndexedDB on this
 * device. Nothing here is ever sent anywhere. Every call catches its own errors
 * so a blocked or missing IndexedDB (private browsing, site data off) never
 * breaks identification: reads come back as null ("unavailable") and writes as false.
 */

export const HISTORY_LIMIT = 50;

const DB_NAME = "serpent-history";
const DB_VERSION = 1;
const ENTRIES = "entries";
const SETTINGS = "settings";
const SAVE_ENABLED = "saveEnabled";
/** Some browsers never answer an open request when storage is blocked; give up instead of waiting forever. */
const OPEN_TIMEOUT_MS = 3000;
/**
 * On-device thumbnails are ≤480px JPEGs (src/lib/compressImage.ts), a few tens of KB.
 * Anything far larger isn't a thumbnail, so it is dropped rather than stored.
 */
const MAX_THUMBNAIL_CHARS = 250_000;

export interface HistoryEntry {
  /** The result's id. */
  id: string;
  /** ISO time the entry was saved. */
  savedAt: string;
  /** ISO country code chosen for the analysis, or null. */
  country: string | null;
  /** The result exactly as /api/identify returned it. */
  result: IdentificationResult;
  /** Small on-device JPEG thumbnails (data URLs), in upload order. Never the full-size photo. */
  thumbnails: string[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("IndexedDB did not open")), OPEN_TIMEOUT_MS);
    const done = <T>(fn: (v: T) => void) => (v: T) => {
      clearTimeout(timer);
      fn(v);
    };
    // Throws (and so rejects) where indexedDB doesn't exist or is blocked.
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ENTRIES)) db.createObjectStore(ENTRIES, { keyPath: "id" }).createIndex("savedAt", "savedAt");
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
    };
    req.onsuccess = done(() => {
      const db = req.result;
      // Another tab upgrading or deleting the database: let it, and reopen next time.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    });
    req.onerror = done(() => reject(req.error));
    req.onblocked = done(() => reject(new Error("IndexedDB blocked")));
  }).catch((e: unknown) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

/** Runs `body` in one transaction and resolves with what `body`'s returned reader gives once it commits. */
async function transact<T>(stores: string[], mode: IDBTransactionMode, body: (tx: IDBTransaction) => () => T): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const read = body(tx);
    tx.oncomplete = () => resolve(read());
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

const isThumbnail = (s: unknown): s is string =>
  typeof s === "string" && s.startsWith("data:image/jpeg;base64,") && s.length <= MAX_THUMBNAIL_CHARS;

/** Whether new results are saved. On by default; null when storage is unavailable. */
export async function getSaveSetting(): Promise<boolean | null> {
  try {
    const value = await transact([SETTINGS], "readonly", (tx) => {
      const req = tx.objectStore(SETTINGS).get(SAVE_ENABLED);
      return () => req.result as unknown;
    });
    return value !== false;
  } catch {
    return null;
  }
}

export async function setSaveSetting(enabled: boolean): Promise<boolean> {
  try {
    await transact([SETTINGS], "readwrite", (tx) => {
      tx.objectStore(SETTINGS).put(enabled, SAVE_ENABLED);
      return () => undefined;
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves a finished analysis and drops the oldest entries beyond HISTORY_LIMIT.
 * Returns the entry, or null when nothing was saved: saving is off, the service
 * was unavailable (no result to keep), or storage is unavailable.
 */
export async function saveToHistory(
  result: IdentificationResult,
  thumbnails: string[],
  { now = new Date() }: { now?: Date } = {},
): Promise<HistoryEntry | null> {
  if (result.status === "service_unavailable") return null;
  if ((await getSaveSetting()) !== true) return null;
  const thumbs = thumbnails.filter(isThumbnail).slice(0, MAX_PHOTOS_PER_REQUEST);
  // Thumbnails may exceed the storage quota; fall back to fewer, then none.
  for (const keep of [thumbs, thumbs.slice(0, 1), []]) {
    const entry: HistoryEntry = { id: result.id, savedAt: now.toISOString(), country: result.country ?? null, result, thumbnails: keep };
    try {
      await transact([ENTRIES], "readwrite", (tx) => {
        const store = tx.objectStore(ENTRIES);
        store.put(entry);
        const keys = store.index("savedAt").getAllKeys();
        keys.onsuccess = () => {
          const oldestFirst = keys.result;
          oldestFirst.slice(0, Math.max(0, oldestFirst.length - HISTORY_LIMIT)).forEach((k) => store.delete(k));
        };
        return () => undefined;
      });
      return entry;
    } catch {
      /* try with fewer thumbnails */
    }
  }
  return null;
}

/** All entries, newest first; null when storage is unavailable. */
export async function listHistory(): Promise<HistoryEntry[] | null> {
  try {
    const entries = await transact([ENTRIES], "readonly", (tx) => {
      const req = tx.objectStore(ENTRIES).index("savedAt").getAll();
      return () => req.result as HistoryEntry[];
    });
    return entries.reverse();
  } catch {
    return null;
  }
}

/** Whether this result is saved in History (false when storage is unavailable). */
export async function isInHistory(id: string): Promise<boolean> {
  try {
    const count = await transact([ENTRIES], "readonly", (tx) => {
      const req = tx.objectStore(ENTRIES).count(id);
      return () => req.result;
    });
    return count > 0;
  } catch {
    return false;
  }
}

export async function deleteFromHistory(id: string): Promise<boolean> {
  try {
    await transact([ENTRIES], "readwrite", (tx) => {
      tx.objectStore(ENTRIES).delete(id);
      return () => undefined;
    });
    return true;
  } catch {
    return false;
  }
}

/** Deletes every entry. The save setting is kept. */
export async function clearHistory(): Promise<boolean> {
  try {
    await transact([ENTRIES], "readwrite", (tx) => {
      tx.objectStore(ENTRIES).clear();
      return () => undefined;
    });
    return true;
  } catch {
    return false;
  }
}
