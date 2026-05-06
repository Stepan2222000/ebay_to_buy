"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { apiGet, ApiError } from "../_lib/api";
import { SmartSearchHit } from "../_lib/types";
import { ErrorBox } from "./ErrorBox";
import { CopyChipList } from "./CopyChip";

export function SmartSearch({
  onPick,
  autoFocus,
}: {
  onPick: (hit: SmartSearchHit) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SmartSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setError(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet<SmartSearchHit[]>(
          `/smart/search?q=${encodeURIComponent(trimmed)}&limit=20`,
        );
        setHits(data);
      } catch (e) {
        setError(e as Error);
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div data-testid="smart-search">
      <div className="field">
        <label className="field-label" htmlFor="smart-q">Поиск smart-артикула</label>
        <div style={{ position: "relative" }}>
          <Search
            size={16}
            strokeWidth={2}
            style={{ position: "absolute", left: 12, top: 11, color: "var(--on-dark-soft)" }}
          />
          <input
            id="smart-q"
            className="input"
            placeholder="Часть smart_xxxxxxxx, артикула или названия"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus={autoFocus}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <span className="field-help">
          Минимум 2 символа. Без автоматического выбора по артикулу — выбираете вручную.
        </span>
      </div>

      <ErrorBox error={error} />

      {loading && q.trim().length >= 2 ? <p className="body-sm" style={{ marginTop: 8 }}>ищу…</p> : null}

      {!loading && q.trim().length >= 2 && hits.length === 0 && !error ? (
        <p className="body-sm" style={{ marginTop: 8, color: "var(--on-dark-soft)" }}>
          Ничего не нашлось по запросу «{q.trim()}».
        </p>
      ) : null}

      {hits.length > 0 ? (
        <ul className="search-list" data-testid="search-results">
          {hits.map((h) => (
            <li
              key={h.smart_part_id}
              className="search-item"
              onClick={() => onPick(h)}
              data-testid={`search-hit-${h.smart_part_id}`}
            >
              <div className="search-item-meta">
                <span className="smart-id">{h.smart_part_id}</span>
                <span className="caption-up">бакет {h.bucket_rank}</span>
                {h.existing_target_qty != null ? (
                  <span className="badge badge-need">цель: {h.existing_target_qty}</span>
                ) : null}
                <span className="badge badge-stocked">наличие: {h.stock_total_qty}</span>
              </div>
              <div className="title-md">{h.smart_name}</div>
              {h.articles_text ? <CopyChipList raw={h.articles_text} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
