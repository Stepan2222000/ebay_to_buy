export function listingContactKey(id: number) {
  return `listing:${id}`;
}

export function articleContactKey(smartPartId: string, article: string) {
  return `article:${smartPartId}:${encodeURIComponent(article.trim())}`;
}

export function splitArticles(raw: string | null | undefined) {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
