import type { Clipboard, CreateClipboardInput, Session } from "@/lib/types"

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null
    throw new ApiError(payload?.error ?? "Request failed. Please try again.", response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export const api = {
  session: () => request<Session>("/api/auth/session"),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  listClipboards: () => request<Clipboard[]>("/api/clipboards"),
  getClipboard: (code: string) =>
    request<Clipboard>(`/api/clipboards/${encodeURIComponent(code)}`),
  createClipboard: (input: CreateClipboardInput) =>
    request<Clipboard>("/api/clipboards", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  setVisibility: (code: string, isPublic: boolean) =>
    request<Clipboard>(`/api/clipboards/${encodeURIComponent(code)}`, {
      method: "PATCH",
      body: JSON.stringify({ is_public: isPublic }),
    }),
  refreshCode: (code: string) =>
    request<Clipboard>(
      `/api/clipboards/${encodeURIComponent(code)}/refresh-code`,
      { method: "POST" },
    ),
  deleteClipboard: (code: string) =>
    request<void>(`/api/clipboards/${encodeURIComponent(code)}`, {
      method: "DELETE",
    }),
}

export function errorMessage(
  error: unknown,
  fallback = "Request failed. Please try again.",
): string {
  if (error instanceof ApiError) return fallback
  return error instanceof Error ? error.message : fallback
}
