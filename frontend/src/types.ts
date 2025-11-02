export interface ClipboardRecord {
  id: number
  clipboard_id: string
  content: string
  created_at: string
  updated_at?: string | null
  expires_at?: string | null
  is_encrypted: boolean
  encryption_key?: string | null
  user?: string | null
}

export interface CreateClipboardPayload {
  content: string
  expires_at?: string | null
  is_encrypted?: boolean
  encryption_key?: string | null
  user?: string | null
}

export interface UpdateClipboardPayload extends Partial<CreateClipboardPayload> {}
