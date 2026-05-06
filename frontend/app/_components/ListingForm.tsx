"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ApiError } from "../_lib/api";
import { Listing } from "../_lib/types";
import { ErrorBox } from "./ErrorBox";

export function NewListingForm({ smart_part_id }: { smart_part_id: string }) {
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend<Listing>("/listings", "POST", {
        smart_part_id,
        ebay_item_number: number,
        comment: comment.trim() ? comment : null,
      });
      setNumber("");
      setComment("");
      router.refresh();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card-stack" onSubmit={onSubmit} data-testid="new-listing-form">
      <div className="field">
        <label className="field-label" htmlFor="ebay-number">Номер eBay</label>
        <input
          id="ebay-number"
          className="input"
          required
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="например, 156512345678"
        />
        <span className="field-help">Номер уникален. Дубль уронит запись на UNIQUE-констрейнте.</span>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ebay-comment">Комментарий</label>
        <textarea
          id="ebay-comment"
          className="textarea"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="опционально, относится к этому объявлению"
        />
      </div>

      <ErrorBox error={error} />

      <div className="card-row">
        <button className="btn btn-primary" type="submit" disabled={busy || !number.trim()}>
          Добавить объявление.
        </button>
      </div>
    </form>
  );
}

export function ListingRow({
  listing,
}: {
  listing: Listing;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  async function endIt() {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/listings/${listing.id}/end`, "POST");
      router.refresh();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" data-testid={`listing-${listing.id}`}>
      <div className="card-row">
        <div>
          <div className="title-md">{listing.ebay_item_number}</div>
          {listing.comment ? <div className="body-sm">{listing.comment}</div> : null}
        </div>
        <div className="page-actions">
          {listing.is_ended ? (
            <span className="badge badge-ended">снято</span>
          ) : (
            <button
              type="button"
              className="btn btn-danger"
              onClick={endIt}
              disabled={busy}
              data-testid={`end-${listing.id}`}
            >
              Снять с публикации.
            </button>
          )}
        </div>
      </div>
      {error ? <div style={{ marginTop: 12 }}><ErrorBox error={error} /></div> : null}
    </div>
  );
}
