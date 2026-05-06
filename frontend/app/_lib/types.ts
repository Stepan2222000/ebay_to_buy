// Контракт ответа FastAPI. См. backend/ebay_to_buy_backend/main.py.

export type OverviewRow = {
  smart_part_id: string;
  smart_name: string;
  articles_text: string | null;
  target_qty: number;
  stock_total_qty: number;
  need_qty: number;
  is_need: boolean;
  is_active: boolean;
  active_ebay_count: number;
  active_ebay_item_numbers: string | null;
  active_ebay_comments: string | null;
  ended_ebay_count: number;
  ended_ebay_item_numbers: string | null;
  ended_ebay_comments: string | null;
  created_at: string;
  updated_at: string;
};

export type SmartSearchHit = {
  smart_part_id: string;
  smart_name: string;
  articles_text: string | null;
  stock_total_qty: number;
  existing_target_qty: number | null;
  existing_is_active: boolean | null;
  bucket_rank: number;
};

export type Target = {
  smart_part_id: string;
  target_qty: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Listing = {
  id: number;
  smart_part_id: string;
  ebay_item_number: string;
  comment: string | null;
  is_ended: boolean;
  created_at: string;
  updated_at: string;
};

export type ListingPatch = Partial<Pick<Listing, "ebay_item_number" | "comment" | "is_ended">>;

export type TargetPatch = Partial<Pick<Target, "target_qty" | "is_active">>;

export type SortKey =
  | "needed-priority"
  | "smart_part_id"
  | "need_qty_desc"
  | "created_desc";

export type OverviewFilters = {
  is_need?: "true" | "false";
  is_active?: "true" | "false";
  has_active_ebay?: "true" | "false";
  has_ended_ebay?: "true" | "false";
  q?: string;
  min_need_qty?: string;
  sort?: SortKey;
};
