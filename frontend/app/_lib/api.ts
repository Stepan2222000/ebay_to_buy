// Тонкая обёртка над FastAPI.
// Все ошибки наружу с traceback по [[validation and errors]] — никаких подмен.

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  traceback: string;
  constructor(status: number, message: string, traceback: string) {
    super(message);
    this.status = status;
    this.traceback = traceback;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let message = res.statusText;
  let traceback = "";
  try {
    const data = await res.json();
    message = (data as { error?: string; detail?: string }).error
           ?? (data as { detail?: string }).detail
           ?? message;
    traceback = (data as { traceback?: string }).traceback ?? "";
  } catch {
    /* пустое тело — оставляем statusText */
  }
  return new ApiError(res.status, message, traceback);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return null;
  return (await res.json()) as T;
}

export function exportXlsxHref(query: URLSearchParams): string {
  const qs = query.toString();
  return `${API}/export.xlsx${qs ? "?" + qs : ""}`;
}
