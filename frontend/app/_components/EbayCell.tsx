"use client";

import { Check, Copy, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ApiError } from "../_lib/api";
import { Listing } from "../_lib/types";

// Авто-grow textarea: высота подстраивается под scrollHeight (cap maxHeight).
function useAutoGrow(value: string, ref: React.RefObject<HTMLTextAreaElement | null>, maxHeight = 200) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  }, [value, ref]);
}

function CopyChipMini({ text }: { text: string }) {
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
        try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
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

function ListingItem({ listing }: { listing: Listing }) {
  const router = useRouter();
  const [comment, setComment] = useState(listing.comment ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useAutoGrow(editing ? comment : "", ref, 220);

  // Синк со свежим listing.comment если бэкенд обновил.
  useEffect(() => { setComment(listing.comment ?? ""); }, [listing.comment]);

  async function save() {
    const trimmed = comment.trim();
    const original = (listing.comment ?? "").trim();
    if (trimmed === original) { setEditing(false); return; }
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/listings/${listing.id}`, "PATCH", { comment: trimmed || null });
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setComment(listing.comment ?? "");
    setEditing(false);
    setError(null);
  }

  async function markEnded() {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/listings/${listing.id}/end`, "POST");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`ebay-item${listing.is_ended ? " ended" : ""}`}>
      <div className="ebay-item-head">
        <CopyChipMini text={listing.ebay_item_number} />
        {listing.is_ended ? (
          <span className="ebay-tag">снято</span>
        ) : (
          <button
            type="button"
            className="ebay-end-btn"
            onClick={markEnded}
            disabled={busy}
            title="Снять с публикации."
          >
            снять
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          ref={ref}
          className="ebay-comment editing"
          value={comment}
          autoFocus
          placeholder="комментарий…"
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); cancel(); }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
          }}
          onBlur={save}
          disabled={busy}
        />
      ) : (
        <button
          type="button"
          className="ebay-comment"
          onClick={() => setEditing(true)}
          title={listing.is_ended ? "Снято — комментарий read-only-ish, но можно поправить." : "Кликните, чтобы редактировать."}
        >
          {comment || <span className="ebay-comment-placeholder">+ комментарий</span>}
        </button>
      )}
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
