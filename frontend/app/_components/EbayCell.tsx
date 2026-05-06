"use client";

import { Check, Copy, Pencil, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ApiError } from "../_lib/api";
import { Listing, ListingPatch } from "../_lib/types";

// Авто-grow textarea: высота под scrollHeight (max 220px).
function useAutoGrow(value: string, ref: React.RefObject<HTMLTextAreaElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(Math.max(el.scrollHeight, 28), 220) + "px";
  }, [value, ref]);
}

function NumChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  return (
    <button
      type="button"
      className={`ebay-num${copied ? " copied" : ""}`}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { await navigator.clipboard.writeText(text); } catch { /* fallback */ }
        setCopied(true);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1500);
      }}
      title="Кликните, чтобы скопировать."
    >
      <span>{text}</span>
      {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2} />}
    </button>
  );
}

function NumberCell({ listing, onError }: { listing: Listing; onError: (m: string) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(listing.ebay_item_number);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setValue(listing.ebay_item_number); }, [listing.ebay_item_number]);

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
  return (
    <div className="ebay-num-wrap">
      <NumChip text={listing.ebay_item_number} />
      <button
        type="button"
        className="ebay-num-edit-btn"
        onClick={() => setEditing(true)}
        title="Редактировать номер."
      >
        <Pencil size={11} strokeWidth={2} />
      </button>
    </div>
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

function StatusToggle({ listing, onError }: { listing: Listing; onError: (m: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const patch: ListingPatch = { is_ended: !listing.is_ended };
      await apiSend(`/listings/${listing.id}`, "PATCH", patch);
      router.refresh();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`ebay-status${listing.is_ended ? " is-ended" : " is-active"}`}
      onClick={toggle}
      disabled={busy}
      title={listing.is_ended ? "Сейчас снято. Кликните, чтобы вернуть в активные." : "Сейчас активно. Кликните, чтобы пометить снятым."}
    >
      <span className="ebay-status-dot" />
      <span>{listing.is_ended ? "снято" : "активно"}</span>
    </button>
  );
}

function ListingItem({ listing }: { listing: Listing }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={`ebay-row${listing.is_ended ? " ended" : ""}`}>
      <div className="ebay-row-num"><NumberCell listing={listing} onError={setError} /></div>
      <div className="ebay-row-comment"><CommentCell listing={listing} onError={setError} /></div>
      <div className="ebay-row-action"><StatusToggle listing={listing} onError={setError} /></div>
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
    <form className="ebay-new" onSubmit={submit}>
      <Plus size={12} strokeWidth={2} />
      <input
        className="ebay-new-input"
        placeholder="новый номер eBay"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        disabled={busy}
        onKeyDown={(e) => { if (e.key === "Escape") { setNumber(""); setError(null); } }}
      />
      {number ? (
        <button type="button" className="ebay-new-clear" onClick={() => setNumber("")} aria-label="Очистить">
          <X size={12} strokeWidth={2} />
        </button>
      ) : null}
      {error ? <div className="ebay-err">{error}</div> : null}
    </form>
  );
}

export function EbayCell({
  smart_part_id,
  listings,
}: {
  smart_part_id: string;
  listings: Listing[];
}) {
  const active = listings.filter((l) => !l.is_ended);
  const ended = listings.filter((l) => l.is_ended);
  return (
    <div className="ebay-cell">
      {active.map((l) => (<ListingItem key={l.id} listing={l} />))}
      {ended.length > 0 && active.length > 0 ? <div className="ebay-divider" /> : null}
      {ended.map((l) => (<ListingItem key={l.id} listing={l} />))}
      <NewListingRow smart_part_id={smart_part_id} />
    </div>
  );
}
