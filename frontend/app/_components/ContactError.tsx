"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect } from "react";

export function ContactError({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div className="contact-error" role="alert">
      <AlertTriangle size={14} strokeWidth={2} />
      <span>{message}</span>
      <button
        type="button"
        className="contact-error-close"
        onClick={onDismiss}
        aria-label="Закрыть"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
