"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ApiError } from "../_lib/api";
import { TargetPatch } from "../_lib/types";

export function ActiveSelect({
  smart_part_id,
  is_active,
}: {
  smart_part_id: string;
  is_active: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    if (next === is_active) return;
    setBusy(true);
    setError(null);
    try {
      const patch: TargetPatch = { is_active: next };
      await apiSend(`/targets/${smart_part_id}`, "PATCH", patch);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ebay-status-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`ebay-status${is_active ? " is-active" : " is-ended"}${open ? " open" : ""}`}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="ebay-status-dot" />
        <span>{is_active ? "активна" : "пауза"}</span>
        <ChevronDown size={11} strokeWidth={2} />
      </button>
      {open ? (
        <div className="ebay-status-menu" role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={is_active}
            className={`ebay-status-opt is-active${is_active ? " selected" : ""}`}
            onClick={() => pick(true)}
          >
            <span className="ebay-status-dot" />
            <span>активна</span>
            {is_active ? <Check size={12} strokeWidth={2.5} className="ebay-status-check" /> : null}
          </button>
          <button
            type="button"
            role="option"
            aria-selected={!is_active}
            className={`ebay-status-opt is-ended${!is_active ? " selected" : ""}`}
            onClick={() => pick(false)}
          >
            <span className="ebay-status-dot" />
            <span>пауза</span>
            {!is_active ? <Check size={12} strokeWidth={2.5} className="ebay-status-check" /> : null}
          </button>
        </div>
      ) : null}
      {error ? <div className="ebay-err">{error}</div> : null}
    </div>
  );
}
