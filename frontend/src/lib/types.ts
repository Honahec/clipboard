export type User = {
  subject: string
  name?: string
  email?: string
  picture?: string
}

export type Session = {
  authenticated: boolean
  oidc_enabled: boolean
  user: User | null
}

export type Clipboard = {
  code: string
  content: string
  is_public: boolean
  expires_at?: string
  created_at: string
  updated_at: string
  owned_by_me: boolean
}

export type CreateClipboardInput = {
  content: string
  is_public: boolean
  expires_at: string | null
}
