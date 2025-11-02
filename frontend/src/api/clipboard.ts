import { API_BASE_URL } from '../config'
import type {
  ClipboardRecord,
  CreateClipboardPayload,
  UpdateClipboardPayload,
} from '../types'

const defaultHeaders = { 'Content-Type': 'application/json' }

type RequestOptions = {
  token?: string | null
}

function buildHeaders(token?: string | null): HeadersInit {
  if (token) {
    return {
      ...defaultHeaders,
      Authorization: `Bearer ${token}`,
    }
  }
  return defaultHeaders
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response
      .json()
      .catch(() => ({ detail: response.statusText }))
    throw new Error(
      message?.detail ?? `Request failed with status ${response.status}`,
    )
  }
  return (await response.json()) as T
}

export async function fetchClipboards(
  options: RequestOptions = {},
): Promise<ClipboardRecord[]> {
  const response = await fetch(`${API_BASE_URL}/clipboard`, {
    headers: buildHeaders(options.token),
  })
  return handleResponse<ClipboardRecord[]>(response)
}

export async function createClipboard(
  payload: CreateClipboardPayload,
  options: RequestOptions = {},
): Promise<ClipboardRecord> {
  const response = await fetch(`${API_BASE_URL}/clipboard`, {
    method: 'POST',
    headers: buildHeaders(options.token),
    body: JSON.stringify(payload),
  })
  return handleResponse<ClipboardRecord>(response)
}

export async function updateClipboard(
  clipboardId: string,
  payload: UpdateClipboardPayload,
  options: RequestOptions = {},
): Promise<ClipboardRecord> {
  const response = await fetch(`${API_BASE_URL}/clipboard/${clipboardId}`, {
    method: 'PUT',
    headers: buildHeaders(options.token),
    body: JSON.stringify(payload),
  })
  return handleResponse<ClipboardRecord>(response)
}

export async function deleteClipboard(
  clipboardId: string,
  options: RequestOptions = {},
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/clipboard/${clipboardId}`, {
    method: 'DELETE',
    headers: buildHeaders(options.token),
  })
  if (!response.ok) {
    const message = await response
      .json()
      .catch(() => ({ detail: response.statusText }))
    throw new Error(
      message?.detail ?? `Request failed with status ${response.status}`,
    )
  }
}
