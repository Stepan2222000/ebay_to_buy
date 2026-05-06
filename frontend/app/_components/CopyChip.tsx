"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyChip({ text, mono = true }: { text: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // если clipboard недоступен — fallback через выделение
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      type="button"
      className={`copy-chip${copied ? " copied" : ""}${mono ? " mono" : ""}`}
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
}: {
  raw: string | null | undefined;
  separator?: string | RegExp;
  mono?: boolean;
}) {
  if (!raw) return null;
  const items = (typeof separator === "string"
    ? raw.split(separator)
    : raw.split(separator)
  )
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="chip-row">
      {items.map((t, i) => (
        <CopyChip key={`${t}-${i}`} text={t} mono={mono} />
      ))}
    </div>
  );
}
