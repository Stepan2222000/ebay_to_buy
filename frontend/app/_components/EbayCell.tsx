"use client";

import { Check, ChevronDown, Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ApiError } from "../_lib/api";
import { copyText } from "../_lib/clipboard";
import { listingContactKey } from "../_lib/contactKeys";
import { Listing, ListingPatch } from "../_lib/types";

const PENDING_DELETE_KEY = "ebay:pending-delete";
const DELETE_DELAY_MS = 3 * 60 * 1000;

type PendingDeleteEntry = {
  deadline: number;
  smart_part_id?: string;
  ebay_item_number?: string;
};

function useAutoGrow(value: string, ref: React.RefObject<HTMLTextAreaElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(Math.max(el.scrollHeight, 24), 200) + "px";
  }, [value, ref]);
}

function loadPendingDeletes(): Record<string, PendingDeleteEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PENDING_DELETE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, PendingDeleteEntry> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Partial<PendingDeleteEntry>;
      if (typeof entry.deadline === "number") out[id] = {
        deadline: entry.deadline,
        smart_part_id: entry.smart_part_id,
        ebay_item_number: entry.ebay_item_number,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function savePendingDeletes(map: Record<string, PendingDeleteEntry>) {
  const entries = Object.entries(map);
  if (entries.length === 0) {
    window.localStorage.removeItem(PENDING_DELETE_KEY);
  } else {
    window.localStorage.setItem(PENDING_DELETE_KEY, JSON.stringify(Object.fromEntries(entries)));
  }
}

function getPendingDelete(id: number): PendingDeleteEntry | null {
  return loadPendingDeletes()[String(id)] ?? null;
}

function setPendingDelete(id: number, entry: PendingDeleteEntry) {
  const next = loadPendingDeletes();
  next[String(id)] = entry;
  savePendingDeletes(next);
}

function clearPendingDelete(id: number) {
  const next = loadPendingDeletes();
  delete next[String(id)];
  savePendingDeletes(next);
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function NumberCell({
  listing,
  contacted,
  pendingDelete,
  onContact,
  onScheduleDelete,
  onError,
}: {
  listing: Listing;
  contacted: boolean;
  pendingDelete: boolean;
  onContact: () => void;
  onScheduleDelete: () => void;
  onError: (m: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(listing.ebay_item_number);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => { setValue(listing.ebay_item_number); }, [listing.ebay_item_number]);
  useEffect(() => () => { if (copyTimer.current) window.clearTimeout(copyTimer.current); }, []);

  async function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await copyText(listing.ebay_item_number);
    setCopied(true);
    onContact();
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
  }

  async function save() {
    const trimmed = value.trim();
    if (trimmed === listing.ebay_item_number) { setEditing(false); return; }
    if (!trimmed) { setValue(listing.ebay_item_number); setEditing(false); return; }
    setBusy(true);
    try {
      await apiSend(`/listings/${listing.id}`, "PATCH", { ebay_item_number: trimmed });
      setEditing(false);
      router.refresh();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : (e as Error).message);
      setValue(listing.ebay_item_number);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  function remove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onScheduleDelete();
  }

  if (editing) {
    return (
      <input
        className="ebay-num-edit"
        value={value}
        autoFocus
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setValue(listing.ebay_item_number); setEditing(false); }
          if (e.key === "Enter") { e.preventDefault(); save(); }
        }}
        onBlur={save}
      />
    );
  }
  if (pendingDelete) {
    return (
      <span className={`ebay-num pending-delete${contacted ? " contacted" : ""}`}>
        <span className="ebay-num-text">{listing.ebay_item_number}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`ebay-num${copied ? " copied" : ""}${contacted ? " contacted" : ""}`}
      onClick={copy}
      disabled={busy}
      title="Кликните, чтобы скопировать."
    >
      <span className="ebay-num-text">{listing.ebay_item_number}</span>
      <span className="ebay-num-actions">
        <span
          role="button"
          tabIndex={-1}
          aria-label="Скопировать номер"
          className="ebay-num-act"
          onClick={copy}
        >
          {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2} />}
        </span>
        <span
          role="button"
          tabIndex={-1}
          aria-label="Редактировать номер"
          className="ebay-num-act"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true); }}
        >
          <Pencil size={11} strokeWidth={2} />
        </span>
        <span
          role="button"
          tabIndex={-1}
          aria-label="Удалить номер"
          className="ebay-num-act danger"
          onClick={remove}
        >
          <Trash2 size={11} strokeWidth={2} />
        </span>
      </span>
    </button>
  );
}

function CommentCell({ listing, onError }: { listing: Listing; onError: (m: string) => void }) {
  const router = useRouter();
  const [value, setValue] = useState(listing.comment ?? "");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useAutoGrow(value, ref);

  useEffect(() => {
    setValue(listing.comment ?? "");
    setDirty(false);
  }, [listing.comment]);

  async function save() {
    if (!dirty) return;
    const trimmed = value.trim();
    const original = (listing.comment ?? "").trim();
    if (trimmed === original) { setDirty(false); return; }
    setBusy(true);
    try {
      await apiSend(`/listings/${listing.id}`, "PATCH", { comment: trimmed || null });
      setDirty(false);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
      router.refresh();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`ebay-comment-wrap${savedFlash ? " saved" : ""}`}>
      <textarea
        ref={ref}
        className="ebay-comment"
        value={value}
        rows={1}
        placeholder="комментарий…"
        disabled={busy}
        onChange={(e) => { setValue(e.target.value); setDirty(true); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { (e.target as HTMLTextAreaElement).blur(); }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
        }}
        onBlur={save}
      />
      {savedFlash ? <Check size={12} strokeWidth={2.5} className="ebay-saved-mark" /> : null}
    </div>
  );
}

function StatusSelect({ listing, onError }: { listing: Listing; onError: (m: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function pick(next: boolean) {
    setOpen(false);
    if (next === listing.is_ended) return;
    setBusy(true);
    try {
      const patch: ListingPatch = { is_ended: next };
      await apiSend(`/listings/${listing.id}`, "PATCH", patch);
      router.refresh();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isEnded = listing.is_ended;
  return (
    <div className="ebay-status-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`ebay-status${isEnded ? " is-ended" : " is-active"}${open ? " open" : ""}`}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="ebay-status-dot" />
        <span>{isEnded ? "снято" : "активно"}</span>
        <ChevronDown size={11} strokeWidth={2} />
      </button>
      {open ? (
        <div className="ebay-status-menu" role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={!isEnded}
            className={`ebay-status-opt is-active${!isEnded ? " selected" : ""}`}
            onClick={() => pick(false)}
          >
            <span className="ebay-status-dot" />
            <span>активно</span>
            {!isEnded ? <Check size={12} strokeWidth={2.5} className="ebay-status-check" /> : null}
          </button>
          <button
            type="button"
            role="option"
            aria-selected={isEnded}
            className={`ebay-status-opt is-ended${isEnded ? " selected" : ""}`}
            onClick={() => pick(true)}
          >
            <span className="ebay-status-dot" />
            <span>снято</span>
            {isEnded ? <Check size={12} strokeWidth={2.5} className="ebay-status-check" /> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ListingItem({
  listing,
  firstEnded,
  contacted,
  onContact,
}: {
  listing: Listing;
  firstEnded: boolean;
  contacted: boolean;
  onContact: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDeleteState] = useState<PendingDeleteEntry | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  useEffect(() => {
    setPendingDeleteState(getPendingDelete(listing.id));
  }, [listing.id]);

  useEffect(() => {
    if (!pendingDelete) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pendingDelete]);

  useEffect(() => {
    if (!pendingDelete || deletingRef.current) return;
    const delay = Math.max(0, pendingDelete.deadline - Date.now());
    const timer = window.setTimeout(() => {
      deletingRef.current = true;
      setDeleting(true);
      apiSend(`/listings/${listing.id}`, "DELETE")
        .then(() => {
          clearPendingDelete(listing.id);
          setPendingDeleteState(null);
          router.refresh();
        })
        .catch((e) => {
          clearPendingDelete(listing.id);
          setPendingDeleteState(null);
          setError(e instanceof ApiError ? e.message : (e as Error).message);
        })
        .finally(() => {
          deletingRef.current = false;
          setDeleting(false);
        });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [listing.id, pendingDelete, router]);

  function scheduleDelete() {
    const entry = {
      deadline: Date.now() + DELETE_DELAY_MS,
      smart_part_id: listing.smart_part_id,
      ebay_item_number: listing.ebay_item_number,
    };
    setPendingDelete(listing.id, entry);
    setPendingDeleteState(entry);
    setNow(Date.now());
    setError(null);
  }

  function undoDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    clearPendingDelete(listing.id);
    setPendingDeleteState(null);
    setError(null);
  }

  const remaining = pendingDelete ? formatRemaining(pendingDelete.deadline - now) : "";
  const klass =
    "ebay-row" +
    (listing.is_ended ? " ended" : "") +
    (firstEnded ? " first-ended" : "") +
    (pendingDelete ? " pending-delete" : "");
  return (
    <div className={klass}>
      <div className="ebay-cell-num">
        <NumberCell
          listing={listing}
          contacted={contacted}
          pendingDelete={!!pendingDelete}
          onContact={onContact}
          onScheduleDelete={scheduleDelete}
          onError={setError}
        />
      </div>
      <div className="ebay-cell-comment">
        {pendingDelete ? (
          <div className="ebay-delete-note">
            {deleting ? "удаляю..." : <>удалится через <span>{remaining}</span></>}
          </div>
        ) : (
          <CommentCell listing={listing} onError={setError} />
        )}
      </div>
      <div className="ebay-cell-status">
        {pendingDelete ? (
          <button
            type="button"
            className="ebay-undo-delete"
            onClick={undoDelete}
            disabled={deleting}
          >
            отменить
          </button>
        ) : (
          <StatusSelect listing={listing} onError={setError} />
        )}
      </div>
      {error ? <div className="ebay-err">{error}</div> : null}
    </div>
  );
}

function NewListingRow({ smart_part_id }: { smart_part_id: string }) {
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = number.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend("/listings", "POST", { smart_part_id, ebay_item_number: trimmed });
      setNumber("");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ebay-row new" onSubmit={submit}>
      <div className="ebay-cell-num">
        <Plus size={12} strokeWidth={2} className="ebay-new-plus" />
        <input
          className="ebay-new-input"
          placeholder="добавить номер"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          disabled={busy}
          onKeyDown={(e) => { if (e.key === "Escape") { setNumber(""); setError(null); } }}
        />
      </div>
      <div className="ebay-cell-comment" />
      <div className="ebay-cell-status">
        {number ? (
          <button
            type="button"
            className="ebay-new-clear"
            onClick={() => { setNumber(""); setError(null); }}
            aria-label="Очистить"
          >
            <X size={12} strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {error ? <div className="ebay-err">{error}</div> : null}
    </form>
  );
}

export function EbayCell({
  smart_part_id,
  listings,
  contactMode,
  contactedMap,
  onContact,
  rowContacted,
  onClearRowContacts,
}: {
  smart_part_id: string;
  listings: Listing[];
  contactMode: boolean;
  contactedMap: Record<string, number>;
  onContact: (targetKey: string) => void;
  rowContacted: boolean;
  onClearRowContacts: () => void;
}) {
  const active = listings.filter((l) => !l.is_ended);
  const ended = listings.filter((l) => l.is_ended);
  const isContacted = (id: number) =>
    contactMode && (!!contactedMap[listingContactKey(id)] || !!contactedMap[String(id)]);
  return (
    <div className="ebay-cell">
      {contactMode && rowContacted ? (
        <div className="ebay-contact-tools">
          <button
            type="button"
            className="ebay-clear-contact"
            onClick={onClearRowContacts}
            title="Снять контактную отметку со всей строки"
          >
            <X size={11} strokeWidth={2} />
            <span>снять отметку</span>
          </button>
        </div>
      ) : null}
      {active.map((l) => (
        <ListingItem
          key={l.id}
          listing={l}
          firstEnded={false}
          contacted={isContacted(l.id)}
          onContact={() => onContact(listingContactKey(l.id))}
        />
      ))}
      {ended.map((l, i) => (
        <ListingItem
          key={l.id}
          listing={l}
          firstEnded={i === 0 && active.length > 0}
          contacted={isContacted(l.id)}
          onContact={() => onContact(listingContactKey(l.id))}
        />
      ))}
      <NewListingRow smart_part_id={smart_part_id} />
    </div>
  );
}
