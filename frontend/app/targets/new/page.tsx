"use client";

import { useState } from "react";
import { SmartSearch } from "../../_components/SmartSearch";
import { TargetForm } from "../../_components/TargetForm";
import { SmartSearchHit } from "../../_lib/types";

export default function NewTargetPage() {
  const [picked, setPicked] = useState<SmartSearchHit | null>(null);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <span className="caption-up">новая цель</span>
          <h1 className="display-md" style={{ marginTop: 4 }}>Новая цель.</h1>
          <p className="body-md">Найдите smart-артикул и зафиксируйте, сколько надо иметь.</p>
        </div>
      </div>

      {picked ? (
        <div className="card-stack">
          <div className="card">
            <span className="caption-up">выбранный smart</span>
            <div className="title-lg" style={{ marginTop: 4 }}>{picked.smart_name}</div>
            <div className="card-row" style={{ marginTop: 12 }}>
              <div>
                <span className="smart-id">{picked.smart_part_id}</span>
                {picked.articles_text ? <span className="mono" style={{ marginLeft: 12 }}>{picked.articles_text}</span> : null}
              </div>
              <button className="btn btn-secondary" type="button" onClick={() => setPicked(null)}>
                Выбрать другой smart.
              </button>
            </div>
          </div>

          <div className="card">
            <TargetForm
              mode="create"
              smart_part_id={picked.smart_part_id}
              smart_name={picked.smart_name}
              initial={
                picked.existing_target_qty != null
                  ? {
                      target_qty: picked.existing_target_qty,
                      is_active: picked.existing_is_active ?? true,
                    }
                  : { target_qty: 1, is_active: true }
              }
            />
          </div>
        </div>
      ) : (
        <div className="card">
          <SmartSearch autoFocus onPick={setPicked} />
        </div>
      )}
    </main>
  );
}
