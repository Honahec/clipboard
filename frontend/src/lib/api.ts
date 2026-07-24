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
    throw new ApiError(payload?.error ?? "请求失败，请稍后重试", response.status)
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
  deleteClipboard: (code: string) =>
    request<void>(`/api/clipboards/${encodeURIComponent(code)}`, {
      method: "DELETE",
    }),
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试"
}
