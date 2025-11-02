import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

import {
  API_BASE_URL,
  OAUTH2_AUDIENCE,
  OAUTH2_AUTHORIZE_URL,
  OAUTH2_CLIENT_ID,
  OAUTH2_REDIRECT_URI,
  OAUTH2_SCOPE,
  STORAGE_TOKEN_EXPIRY_KEY,
  STORAGE_TOKEN_KEY,
  STORAGE_USER_KEY,
} from '../config'

const PKCE_VERIFIER_STORAGE_KEY = 'honahec_clipboard_pkce_verifier'
const PKCE_STATE_STORAGE_KEY = 'honahec_clipboard_pkce_state'
const LOGIN_IN_PROGRESS_KEY = 'honahec_clipboard_login_in_progress'

type BackendUser = {
  user_id: string
  email?: string
  username?: string
  claims?: Record<string, unknown>
}

type BackendTokenResponse = {
  access_token: string
  token_type?: string
  expires_in?: number | string | null
  refresh_token?: string
  scope?: string
  user: BackendUser
}

export interface AuthUser {
  userId: string
  email?: string
  username?: string
}

interface AuthContextValue {
  isAuthenticated: boolean
  token: string | null
  user: AuthUser | null
  startLogin: () => void
  logout: () => void
  isAuthenticating: boolean
  authStatus: string | null
  authError: string | null
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generateCodeVerifier(length = 64): string {
  const randomBytes = new Uint8Array(length)
  window.crypto.getRandomValues(randomBytes)
  return base64UrlEncode(randomBytes)
}

async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const digest = await window.crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(digest)
}

function normalizeBackendUser(user: BackendUser | undefined | null): AuthUser | null {
  if (!user?.user_id) {
    return null
  }
  return {
    userId: String(user.user_id),
    email: user.email ?? undefined,
    username: user.username ?? undefined,
  }
}

async function exchangeAuthorizationCodeViaBackend(
  code: string,
  codeVerifier: string,
): Promise<BackendTokenResponse | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: OAUTH2_REDIRECT_URI,
      }),
    })

    if (!response.ok) {
      console.warn(
        'Backend token exchange failed',
        response.status,
        response.statusText,
      )
      return null
    }

    const payload = (await response.json()) as BackendTokenResponse
    if (!payload.access_token) {
      console.warn('Backend token exchange response missing access_token')
      return null
    }

    return payload
  } catch (error) {
    console.warn('Unable to exchange authorization code via backend', error)
    return null
  }
}

async function fetchUserViaBackend(token: string): Promise<AuthUser | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      console.warn('Backend userinfo request failed', response.status)
      return null
    }

    const user = (await response.json()) as BackendUser
    return normalizeBackendUser(user)
  } catch (error) {
    console.warn('Unable to fetch user via backend', error)
    return null
  }
}

function isTokenExpired(expiry?: number): boolean {
  if (!expiry) {
    return false
  }
  const now = Math.floor(Date.now() / 1000)
  return expiry <= now
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authStatus, setAuthStatus] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)

  const reloadTimeoutRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (reloadTimeoutRef.current !== null) {
        window.clearTimeout(reloadTimeoutRef.current)
        reloadTimeoutRef.current = null
      }
    }
  }, [])

  const clearSession = useCallback(
    (
      options?: {
        keepPkce?: boolean
        preserveStatus?: boolean
        preserveLoginFlag?: boolean
      },
    ) => {
      localStorage.removeItem(STORAGE_TOKEN_KEY)
      localStorage.removeItem(STORAGE_TOKEN_EXPIRY_KEY)
      localStorage.removeItem(STORAGE_USER_KEY)
      if (!options?.keepPkce) {
        sessionStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY)
        sessionStorage.removeItem(PKCE_STATE_STORAGE_KEY)
      }
      if (reloadTimeoutRef.current !== null) {
        window.clearTimeout(reloadTimeoutRef.current)
        reloadTimeoutRef.current = null
      }
      if (!options?.preserveLoginFlag) {
        sessionStorage.removeItem(LOGIN_IN_PROGRESS_KEY)
      }
      if (!options?.preserveStatus) {
        setAuthStatus(null)
        setAuthError(null)
      }
      setIsAuthenticating(false)
      if (isMountedRef.current) {
        setToken(null)
        setUser(null)
      }
    },
    [],
  )

  const persistSession = useCallback(
    (
      accessToken: string,
      userInfo: AuthUser,
      expiresInSeconds?: number | string | null,
    ) => {
      let expiryTimestamp: number | undefined
      if (typeof expiresInSeconds === 'number') {
        if (Number.isFinite(expiresInSeconds)) {
          const normalized = Math.max(0, Math.trunc(expiresInSeconds))
          expiryTimestamp = Math.floor(Date.now() / 1000) + normalized
        }
      } else if (typeof expiresInSeconds === 'string') {
        const parsed = Number.parseInt(expiresInSeconds, 10)
        if (!Number.isNaN(parsed)) {
          expiryTimestamp = Math.floor(Date.now() / 1000) + parsed
        }
      }

      localStorage.setItem(STORAGE_TOKEN_KEY, accessToken)
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(userInfo))

      if (expiryTimestamp) {
        localStorage.setItem(
          STORAGE_TOKEN_EXPIRY_KEY,
          expiryTimestamp.toString(),
        )
      } else {
        localStorage.removeItem(STORAGE_TOKEN_EXPIRY_KEY)
      }

      if (isMountedRef.current) {
        setToken(accessToken)
        setUser(userInfo)
      }
    },
    [],
  )

  const initializeFromStorage = useCallback(async () => {
    const pendingAuth = Boolean(
      sessionStorage.getItem(LOGIN_IN_PROGRESS_KEY) ||
        sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY) ||
        new URL(window.location.href).searchParams.get('code'),
    )

    const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY)
    if (!storedToken) {
      clearSession({
        keepPkce: true,
        preserveStatus: true,
        preserveLoginFlag: pendingAuth,
      })
      setIsAuthenticating(pendingAuth)
      return
    }

    const storedExpiry = localStorage.getItem(STORAGE_TOKEN_EXPIRY_KEY)
    const expiry = storedExpiry ? Number.parseInt(storedExpiry, 10) : undefined
    if (expiry && isTokenExpired(expiry)) {
      clearSession({
        keepPkce: true,
        preserveStatus: true,
        preserveLoginFlag: pendingAuth,
      })
      setIsAuthenticating(pendingAuth)
      return
    }

    const storedUserRaw = localStorage.getItem(STORAGE_USER_KEY)
    if (storedUserRaw) {
      try {
        const storedUser = JSON.parse(storedUserRaw) as AuthUser
        if (isMountedRef.current) {
          setToken(storedToken)
          setUser(storedUser)
        }
        setIsAuthenticating(false)
        sessionStorage.removeItem(LOGIN_IN_PROGRESS_KEY)
        return
      } catch {
        localStorage.removeItem(STORAGE_USER_KEY)
      }
    }

    const fetchedUser = await fetchUserViaBackend(storedToken)
    if (!fetchedUser) {
      clearSession({ keepPkce: true, preserveStatus: true })
      setIsAuthenticating(false)
      return
    }

    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(fetchedUser))
    if (isMountedRef.current) {
      setToken(storedToken)
      setUser(fetchedUser)
    }
    sessionStorage.removeItem(LOGIN_IN_PROGRESS_KEY)
    setIsAuthenticating(false)
  }, [authStatus, clearSession])

  useEffect(() => {
    setIsAuthenticating(true)
    void initializeFromStorage()
  }, [initializeFromStorage])

  const codeHandledRef = useRef(false)

  useEffect(() => {
    if (codeHandledRef.current) return
    codeHandledRef.current = true

    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (error) {
      console.warn('OAuth2 authorization error', error)
      sessionStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY)
      sessionStorage.removeItem(PKCE_STATE_STORAGE_KEY)

      const errorDescription = url.searchParams.get('error_description')
      const rawMessage = errorDescription ?? error
      let readableMessage = rawMessage
      try {
        readableMessage = decodeURIComponent(rawMessage.replace(/\+/g, ' '))
      } catch {
        readableMessage = rawMessage
      }

      clearSession({ preserveStatus: true })
      setAuthStatus(null)
      setAuthError(`登录失败：${readableMessage}`)
      setIsAuthenticating(false)
      sessionStorage.removeItem(LOGIN_IN_PROGRESS_KEY)

      window.history.replaceState(
        null,
        document.title,
        `${window.location.origin}/`,
      )
      return
    }

    if (!code) {
      setIsAuthenticating(Boolean(sessionStorage.getItem(LOGIN_IN_PROGRESS_KEY)))
      setAuthStatus(null)
      sessionStorage.removeItem(LOGIN_IN_PROGRESS_KEY)
      return
    }

    const storedState = sessionStorage.getItem(PKCE_STATE_STORAGE_KEY)
    const stateParam = url.searchParams.get('state')
    if (storedState && stateParam && storedState !== stateParam) {
      console.warn('OAuth2 state mismatch detected, aborting login.')
      sessionStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY)
      sessionStorage.removeItem(PKCE_STATE_STORAGE_KEY)

      clearSession({ preserveStatus: true })
      setAuthStatus(null)
      setAuthError('登录状态校验失败，请重试。')
      setIsAuthenticating(false)
      sessionStorage.removeItem(LOGIN_IN_PROGRESS_KEY)

      window.history.replaceState(
        null,
        document.title,
        `${window.location.origin}/`,
      )
      return
    }

    const verifier = sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY)
    if (!verifier) {
      console.warn('Missing PKCE verifier for OAuth2 code exchange.')
      sessionStorage.removeItem(PKCE_STATE_STORAGE_KEY)

      clearSession({ preserveStatus: true })
      setAuthStatus(null)
      setAuthError('登录校验信息已失效，请重试。')
      setIsAuthenticating(false)
      sessionStorage.removeItem(LOGIN_IN_PROGRESS_KEY)

      window.history.replaceState(
        null,
        document.title,
        `${window.location.origin}/`,
      )
      return
    }

    let exchangeSucceeded = false

    const handleCodeExchange = async () => {
      setAuthStatus(null)
      setAuthError(null)
      setIsAuthenticating(true)

      const tokenResponse = await exchangeAuthorizationCodeViaBackend(
        code,
        verifier,
      )
      if (!tokenResponse) {
        setAuthError('登录失败，请稍后再试。')
        clearSession({ preserveStatus: true })
        return
      }

      const userInfo = normalizeBackendUser(tokenResponse.user)
      if (!userInfo) {
        setAuthError('未能获取用户信息，请重试登录。')
        clearSession({ preserveStatus: true })
        return
      }

      persistSession(
        tokenResponse.access_token,
        userInfo,
        tokenResponse.expires_in ?? null,
      )
      exchangeSucceeded = true

      if (reloadTimeoutRef.current !== null) {
        window.clearTimeout(reloadTimeoutRef.current)
        reloadTimeoutRef.current = null
      }
      setAuthError(null)
      setAuthStatus(null)
      sessionStorage.removeItem(LOGIN_IN_PROGRESS_KEY)
      reloadTimeoutRef.current = window.setTimeout(() => {
        window.location.reload()
      }, 1200)
    }

    void handleCodeExchange().finally(() => {
      sessionStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY)
      sessionStorage.removeItem(PKCE_STATE_STORAGE_KEY)

      url.searchParams.delete('code')
      url.searchParams.delete('state')
      url.searchParams.delete('session_state')

      window.history.replaceState(
        null,
        document.title,
        `${window.location.origin}/`,
      )
      sessionStorage.removeItem(LOGIN_IN_PROGRESS_KEY)
      setIsAuthenticating(exchangeSucceeded)
    })
  }, [clearSession, persistSession])

  const startLogin = useCallback(() => {
    if (!OAUTH2_CLIENT_ID) {
      console.error('OAuth2 client id is not configured')
      setAuthStatus(null)
      setAuthError('未配置 OAuth2 客户端信息，请联系管理员。')
      return
    }

    if (!window.crypto?.getRandomValues || !window.crypto?.subtle) {
      console.error('Current environment does not support Web Crypto API.')
      setAuthStatus(null)
      setAuthError('当前浏览器不支持安全登录流程。')
      return
    }

    setAuthError(null)
    setAuthStatus(null)
    setIsAuthenticating(true)
    sessionStorage.setItem(LOGIN_IN_PROGRESS_KEY, '1')

    const initiateLogin = async () => {
      try {
        const codeVerifier = generateCodeVerifier()
        const codeChallenge = await createCodeChallenge(codeVerifier)
        const state = crypto.randomUUID()

        sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, codeVerifier)
        sessionStorage.setItem(PKCE_STATE_STORAGE_KEY, state)

        const authorizeUrl = new URL(OAUTH2_AUTHORIZE_URL)
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: OAUTH2_CLIENT_ID,
          redirect_uri: OAUTH2_REDIRECT_URI,
          scope: OAUTH2_SCOPE,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        })
        if (OAUTH2_AUDIENCE) {
          params.set('audience', OAUTH2_AUDIENCE)
        }
        authorizeUrl.search = params.toString()
        window.location.assign(authorizeUrl.toString())
      } catch (error) {
        console.error('Failed to initiate OAuth2 login', error)
        clearSession({ preserveStatus: true })
        setAuthStatus(null)
        setAuthError('无法启动登录流程，请稍后重试。')
      }
    }

    void initiateLogin()
  }, [clearSession])

  const logout = useCallback(() => {
    clearSession({ preserveLoginFlag: true })
    window.location.assign(`${window.location.origin}/`)
  }, [clearSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: Boolean(token && user),
      token,
      user,
      startLogin,
      logout,
      isAuthenticating,
      authStatus,
      authError,
    }),
    [token, user, startLogin, logout, isAuthenticating, authStatus, authError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
