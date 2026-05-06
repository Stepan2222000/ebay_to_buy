"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, ReactNode } from "react";

// Headless dropdown: button + absolute-positioned panel.
// Без нативного <select>, чтобы Safari не показывал свои double-arrows.
// align="right" привязывает панель к правому краю кнопки (для toolbar-кнопок справа).

export function Dropdown({
  label,
  icon,
  align = "left",
  children,
  testId,
  width = 280,
}: {
  label: ReactNode;
  icon?: ReactNode;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
  testId?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={ref}>
      <button
        type="button"
        className={`btn btn-secondary dropdown-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        data-testid={testId}
      >
        {icon}
        <span className="dropdown-label">{label}</span>
        <ChevronDown size={14} strokeWidth={2} className="dropdown-chevron" />
      </button>
      {open ? (
        <div
          className={`dropdown-panel align-${align}`}
          style={{ width }}
          role="menu"
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
