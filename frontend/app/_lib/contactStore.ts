// LS-first store для отметок «контактировал» и тумблера подсветки.
//
// Cache (`ebay:contacts-cache`) — основная истина для UI: `{[target_key]: ts_ms}`.
// Pending (`ebay:contacts-pending`) — очередь операций, не дошедших до БД (retry на focus/mount).
// Mode (`ebay:contact-mode`) — per-browser UI-настройка ("on"|"off").
//
// БД — не источник истины, а sync-канал между браузерами:
// при mount/focus подтягиваем `/contacts`, мерджим с локальным cache, применяя поверх pending-операции.
// При успешной отправке pending — удаляем из очереди.

import { ApiError, apiGet, apiSend } from "./api";
import { ContactMark } from "./types";

const CACHE_KEY = "ebay:contacts-cache";
const PENDING_KEY = "ebay:contacts-pending";
const MODE_KEY = "ebay:contact-mode";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ContactCache = Record<string, number>;

export type PendingOp =
  | { op: "add"; key: string; ts: number }
  | { op: "del"; key: string; ts: number }
  | { op: "reset"; ts: number };

export function readCache(): ContactCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    const out: ContactCache = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && now - v < TTL_MS) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeCache(cache: ContactCache) {
  if (typeof window === "undefined") return;
  if (Object.keys(cache).length === 0) {
    window.localStorage.removeItem(CACHE_KEY);
  } else {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }
}

export function readPending(): PendingOp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PendingOp[];
  } catch {
    return [];
  }
}

export function writePending(ops: PendingOp[]) {
  if (typeof window === "undefined") return;
  if (ops.length === 0) {
    window.localStorage.removeItem(PENDING_KEY);
  } else {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
  }
}

function appendPending(op: PendingOp) {
  writePending([...readPending(), op]);
}

export function readMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MODE_KEY) === "on";
}

export function writeMode(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODE_KEY, value ? "on" : "off");
}

export function applyPending(base: ContactCache, ops: PendingOp[]): ContactCache {
  const result: ContactCache = { ...base };
  for (const op of ops) {
    if (op.op === "reset") {
      for (const k of Object.keys(result)) delete result[k];
    } else if (op.op === "add") {
      result[op.key] = op.ts;
    } else if (op.op === "del") {
      delete result[op.key];
    }
  }
  return result;
}

async function tryPersist(op: PendingOp): Promise<boolean> {
  try {
    if (op.op === "add") {
      await apiSend("/contacts", "POST", { target_key: op.key });
    } else if (op.op === "del") {
      await apiSend(`/contacts/${encodeURIComponent(op.key)}`, "DELETE");
    } else if (op.op === "reset") {
      await apiSend("/contacts", "DELETE");
    }
    return true;
  } catch (e) {
    // Неретрайабл клиентские ошибки (4xx) тоже кидаем в pending — пусть пользователь
    // на следующем focus увидит, или мы будем шлёт туда снова. На практике в этой системе
    // 4xx означает баг, но тихо терять оп не будем.
    if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) {
      // Логически нечего ретраить, но и терять записи не хочется. Логируем и не добавляем в очередь.
      // eslint-disable-next-line no-console
      console.warn("contactStore: dropping non-retryable op", op, e.status, e.message);
      return true;
    }
    return false;
  }
}

export async function persistOrEnqueue(op: PendingOp): Promise<void> {
  const ok = await tryPersist(op);
  if (!ok) appendPending(op);
}

export async function flushPending(): Promise<PendingOp[]> {
  const queue = readPending();
  if (queue.length === 0) return [];
  const results = await Promise.all(queue.map(tryPersist));
  const stillPending = queue.filter((_, i) => !results[i]);
  writePending(stillPending);
  return stillPending;
}

export async function fetchContactsFromDb(): Promise<ContactCache | null> {
  try {
    const data = await apiGet<ContactMark[]>("/contacts");
    const out: ContactCache = {};
    const now = Date.now();
    for (const m of data) {
      const ts = Date.parse(m.marked_at);
      if (Number.isFinite(ts) && now - ts < TTL_MS) out[m.target_key] = ts;
    }
    return out;
  } catch {
    return null;
  }
}

export async function syncWithDb(): Promise<ContactCache> {
  const stillPending = await flushPending();
  const db = await fetchContactsFromDb();
  if (db === null) return readCache();
  const merged = applyPending(db, stillPending);
  writeCache(merged);
  return merged;
}

export function shallowEqualMap(a: ContactCache, b: ContactCache): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

export function migrateLegacyCache(): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(CACHE_KEY)) return;
  const legacy = window.localStorage.getItem("ebay:contacted");
  if (!legacy) return;
  try {
    const parsed = JSON.parse(legacy);
    if (!parsed || typeof parsed !== "object") return;
    const now = Date.now();
    const cache: ContactCache = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && now - v < TTL_MS) cache[k] = v;
    }
    writeCache(cache);
    window.localStorage.removeItem("ebay:contacted");
  } catch {
    /* ignore */
  }
}
