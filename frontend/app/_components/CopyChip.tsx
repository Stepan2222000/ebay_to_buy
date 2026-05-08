"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyText } from "../_lib/clipboard";

export function CopyChip({
  text,
  mono = true,
  contacted = false,
  onContact,
}: {
  text: string;
  mono?: boolean;
  contacted?: boolean;
  onContact?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function flash() {
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  }

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await copyText(text);
    flash();
    onContact?.();
  }

  return (
    <button
      type="button"
      className={
        `copy-chip${copied ? " copied" : ""}${contacted ? " contacted" : ""}${mono ? " mono" : ""}`
      }
      onClick={onClick}
      title="Кликните, чтобы скопировать."
    >
      <span>{text}</span>
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
    </button>
  );
}

export function CopyChipList({
  raw,
  separator = ", ",
  mono = true,
  isContacted,
  onContact,
}: {
  raw: string | null | undefined;
  separator?: string | RegExp;
  mono?: boolean;
  isContacted?: (text: string) => boolean;
  onContact?: (text: string) => void;
}) {
  if (!raw) return null;
  const items = raw.split(separator as string).map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="chip-row">
      {items.map((t, i) => (
        <CopyChip
          key={`${t}-${i}`}
          text={t}
          mono={mono}
          contacted={isContacted?.(t) ?? false}
          onContact={onContact ? () => onContact(t) : undefined}
        />
      ))}
    </div>
  );
}
