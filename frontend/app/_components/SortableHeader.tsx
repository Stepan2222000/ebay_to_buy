"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { CSSProperties, ReactNode } from "react";
import { ColumnKey } from "./overviewColumns";

export function SortableHeader({
  id,
  className,
  width,
  onResizeStart,
  isLast,
  children,
}: {
  id: ColumnKey;
  className?: string;
  width: number;
  onResizeStart: (e: React.MouseEvent, col: ColumnKey) => void;
  isLast: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    width,
    minWidth: width,
    maxWidth: width,
  };

  const klass = [
    className,
    isDragging ? "is-dragging" : "",
    isOver ? "is-drop-target" : "",
  ].filter(Boolean).join(" ");

  return (
    <th ref={setNodeRef} className={klass} style={style}>
      <div className="th-inner">
        <button
          type="button"
          className="col-drag-handle"
          aria-label="Перетащить колонку"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={12} strokeWidth={2} />
        </button>
        <span className="th-label">{children}</span>
      </div>
      {!isLast ? (
        <div
          className="col-resizer"
          onMouseDown={(e) => onResizeStart(e, id)}
        />
      ) : null}
    </th>
  );
}
