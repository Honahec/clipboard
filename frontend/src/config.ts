const env = import.meta.env

export const API_BASE_URL =
  env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:8000'

export const OAUTH2_AUTHORIZE_URL =
  env.VITE_OAUTH2_AUTHORIZE_URL?.trim() ?? 'https://sso.honahec.cc/oauth/authorize'

export const OAUTH2_CLIENT_ID = env.VITE_OAUTH2_CLIENT_ID ?? ''

export const OAUTH2_REDIRECT_URI =
  env.VITE_OAUTH2_REDIRECT_URI ?? `${window.location.origin}/callback`

export const OAUTH2_AUDIENCE = env.VITE_OAUTH2_AUDIENCE

export const OAUTH2_SCOPE =
  env.VITE_OAUTH2_SCOPE ?? 'username email'

export const OAUTH2_USERINFO_URL =
  env.VITE_OAUTH2_USERINFO_URL?.trim() ?? 'https://sso.honahec.cc/oauth/userinfo'

export const OAUTH2_LOGOUT_URL =
  env.VITE_OAUTH2_LOGOUT_URL?.trim() ?? 'https://sso.honahec.cc/oauth/logout'

export const STORAGE_TOKEN_KEY = 'honahec_clipboard_token'
export const STORAGE_TOKEN_EXPIRY_KEY = 'honahec_clipboard_token_exp'
export const STORAGE_USER_KEY = 'honahec_clipboard_user'
