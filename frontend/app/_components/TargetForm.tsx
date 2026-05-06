"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ApiError } from "../_lib/api";
import { Target } from "../_lib/types";
import { ErrorBox } from "./ErrorBox";

type Props =
  | {
      mode: "create";
      smart_part_id: string;
      smart_name?: string;
      initial?: Partial<Target>;
    }
  | {
      mode: "edit";
      smart_part_id: string;
      smart_name?: string;
      initial: Target;
    };

export function TargetForm(props: Props) {
  const router = useRouter();
  const [targetQty, setTargetQty] = useState<number>(props.initial?.target_qty ?? 1);
  const [isActive, setIsActive] = useState<boolean>(props.initial?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (props.mode === "create") {
        await apiSend<Target>("/targets", "POST", {
          smart_part_id: props.smart_part_id,
          target_qty: targetQty,
          is_active: isActive,
        });
        router.push(`/targets/${props.smart_part_id}`);
        router.refresh();
      } else {
        await apiSend<Target>(`/targets/${props.smart_part_id}`, "PATCH", {
          target_qty: targetQty,
          is_active: isActive,
        });
        router.refresh();
      }
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card-stack" onSubmit={onSubmit} data-testid={`target-form-${props.mode}`}>
      <div className="field">
        <label className="field-label" htmlFor="target-qty">Цель, штук</label>
        <input
          id="target-qty"
          className="input"
          type="number"
          min={1}
          required
          value={targetQty}
          onChange={(e) => setTargetQty(Number(e.target.value))}
        />
        <span className="field-help">Минимум 1. Для паузы используйте «активна = нет».</span>
      </div>

      <label className="toggle">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Цель активна.
      </label>

      <ErrorBox error={error} />

      <div className="card-row">
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || targetQty < 1}
        >
          {props.mode === "create" ? "Сохранить цель." : "Сохранить."}
        </button>
      </div>
    </form>
  );
}
