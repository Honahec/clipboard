// Clipboard types
export interface ClipboardRecord {
  id: number;
  clipboard_id: string;
  content: string;
  created_at: string;
  updated_at?: string | null;
  expires_at?: string | null;
  is_encrypted: boolean;
  encryption_key?: string | null;
  user?: string | null;
  is_public: boolean;
}

export interface CreateClipboardPayload {
  content: string;
  expires_at?: string | null;
  is_encrypted?: boolean;
  encryption_key?: string | null;
  user?: string | null;
  is_public?: boolean;
}

export type UpdateClipboardPayload = Partial<CreateClipboardPayload>;

// Auth types
export interface AuthUser {
  userId: string;
  email?: string;
  username?: string;
}

export interface AuthContextValue {
  isAuthenticated: boolean;
  token: string | null;
  user: AuthUser | null;
  startLogin: () => void;
  logout: () => void;
  isAuthenticating: boolean;
  authStatus: string | null;
  authError: string | null;
}
