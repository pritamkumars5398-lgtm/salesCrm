/**
 * Client-side API layer. Components must not call fetch("/api/…") directly —
 * they go through these helpers so error handling, parsing, and response
 * shapes live in one place.
 */

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new ApiError(0, "Network error — check your connection.");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch { /* non-JSON response */ }

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data && typeof data.error === "string")
        ? data.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

export const apiGet = <T>(path: string) => apiFetch<T>(path);

export const apiPost = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const apiPut = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });

export const apiDelete = <T>(path: string) => apiFetch<T>(path, { method: "DELETE" });
