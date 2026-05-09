// LS — единственная истина для UI. БД — periodic backup, не merge-партнёр.
//
// Поток:
//   click  → writeCache + markDirty           (мгновенно, без сети)
//   tab    → 'storage' event для других вкладок (бесплатная межвкладочная sync)
//   sync   → раз в 60с одна вкладка-лидер (Web Locks) шлёт PUT /contacts/bulk
//   hide   → visibilitychange:hidden шлёт сразу через fetch keepalive
//   reset  → DELETE /contacts мгновенно
//   mount  → если LS пустой → один GET /contacts → копируем в LS
//
// Никаких pending-очередей, op-логов, merge'ей.

import { ApiError, apiGet, apiSend } from "./api";
import { ContactMark } from "./types";

const CACHE_KEY = "ebay:contacts-cache";
const DIRTY_KEY = "ebay:contacts-dirty";
const MODE_KEY = "ebay:contact-mode";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SYNC_INTERVAL_MS = 60_000;
const LOCK_NAME = "ebay:contacts-sync-leader";
const SAME_TAB_EVENT = "ebay:contacts-cache-changed";

export type ContactCache = Record<string, number>;

// ---------- LS read/write ---------------------------------------------------

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
  markDirty();
  // 'storage' event срабатывает только в других вкладках. Для same-tab ручной канал.
  window.dispatchEvent(new Event(SAME_TAB_EVENT));
}

function markDirty() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DIRTY_KEY, "1");
}

function clearDirty() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DIRTY_KEY);
}

function isDirty(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DIRTY_KEY) === "1";
}

export function readMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MODE_KEY) === "on";
}

export function writeMode(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODE_KEY, value ? "on" : "off");
}

// ---------- Subscribe (cross-tab + same-tab) --------------------------------

export function subscribeCache(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === CACHE_KEY || e.key === null) callback();
  };
  const onSameTab = () => callback();
  window.addEventListener("storage", onStorage);
  window.addEventListener(SAME_TAB_EVENT, onSameTab);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SAME_TAB_EVENT, onSameTab);
  };
}

// ---------- Network ---------------------------------------------------------

const CONTACTS_BULK_URL = "/contacts/bulk";

function cacheToBulkPayload(cache: ContactCache): { target_key: string; marked_at: string }[] {
  return Object.entries(cache).map(([k, ts]) => ({
    target_key: k,
    marked_at: new Date(ts).toISOString(),
  }));
}

async function pushSnapshot(cache: ContactCache): Promise<boolean> {
  try {
    await apiSend(CONTACTS_BULK_URL, "PUT", cacheToBulkPayload(cache));
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
      // 4xx = клиентская ошибка, ретрай не поможет — снимаем dirty,
      // чтобы не зацикливаться. Логируем для диагностики.
      // eslint-disable-next-line no-console
      console.warn("contactStore: bulk PUT 4xx", e.status, e.message);
      return true;
    }
    return false;
  }
}

export async function flushIfDirty(): Promise<void> {
  if (!isDirty()) return;
  const ok = await pushSnapshot(readCache());
  if (ok) clearDirty();
}

// keepalive-вариант для visibilitychange:hidden / pagehide.
// fetch с keepalive поддерживается в Safari 11.1+. PUT туда можно (sendBeacon только POST).
function flushBeacon(): void {
  if (typeof window === "undefined" || !isDirty()) return;
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    fetch(`${apiBase}${CONTACTS_BULK_URL}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cacheToBulkPayload(readCache())),
      keepalive: true,
    });
    // Не ждём ответ, не снимаем dirty — это сделает следующий обычный flush.
  } catch {
    /* unload-контекст; ничего не поделаешь */
  }
}

// ---------- Bootstrap (mount) -----------------------------------------------

export async function bootstrapFromDb(): Promise<ContactCache> {
  const local = readCache();
  if (Object.keys(local).length > 0) return local; // LS не пустой — БД не трогаем
  try {
    const data = await apiGet<ContactMark[]>("/contacts");
    const out: ContactCache = {};
    const now = Date.now();
    for (const m of data) {
      const ts = Date.parse(m.marked_at);
      if (Number.isFinite(ts) && now - ts < TTL_MS) out[m.target_key] = ts;
    }
    if (Object.keys(out).length > 0) {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(out));
      // bootstrap — не dirty: данные уже из БД, гонять обратно не надо
      window.dispatchEvent(new Event(SAME_TAB_EVENT));
    }
    return out;
  } catch {
    return local;
  }
}

// ---------- Reset -----------------------------------------------------------

export async function resetAll(): Promise<void> {
  writeCache({});
  clearDirty(); // DELETE сделает то же самое мгновенно
  try {
    await apiSend("/contacts", "DELETE");
  } catch {
    // если DELETE упал — пометим dirty, регулярный flush догонит пустым PUT
    markDirty();
  }
}

// ---------- Sync loop (один лидер на все вкладки) ---------------------------

export function startSyncLoop(): () => void {
  if (typeof window === "undefined") return () => {};
  const ac = new AbortController();

  // visibility/pagehide — каждая вкладка: успеть дослать перед уходом.
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flushBeacon();
  };
  const onPageHide = () => flushBeacon();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  // Web Locks: одна вкладка получает exclusive lock и крутит интервал.
  // При закрытии вкладки лок автоматом освобождается → следующая вкладка станет лидером.
  const supportsLocks = typeof navigator !== "undefined" && "locks" in navigator;
  if (supportsLocks) {
    void navigator.locks
      .request(LOCK_NAME, { signal: ac.signal }, async () => {
        const tick = async () => {
          if (ac.signal.aborted) return;
          await flushIfDirty();
        };
        const interval = window.setInterval(tick, SYNC_INTERVAL_MS);
        await tick(); // первый flush сразу при получении лидерства
        try {
          await new Promise<void>((_, reject) => {
            ac.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
          });
        } finally {
          window.clearInterval(interval);
        }
      })
      .catch(() => {/* AbortError при размонтировании — это норма */});
  } else {
    // фоллбек для древних браузеров без Web Locks: каждая вкладка тикает сама.
    // Возможна гонка двух PUT, но replace-семантика бэка делает её безопасной.
    const interval = window.setInterval(flushIfDirty, SYNC_INTERVAL_MS);
    void flushIfDirty();
    ac.signal.addEventListener("abort", () => window.clearInterval(interval));
  }

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    ac.abort();
  };
}
