// Axios instance, response-envelope unwrapping, and refresh-token
// interceptor. The only file in the app allowed to construct HTTP
// requests directly — see CLAUDE1.md "Boundary rules".
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { env } from '@/lib/env'
import { useAuthStore } from '@/store/authStore'

// Frontend's own copy of the backend envelope shape (CLAUDE1.md — feature
// code never sees this, only the unwrapped `data` or a thrown ApiError).
interface ApiSuccessBody<T> {
  success: true
  data: T
}

interface ApiErrorBody {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

type ApiResponseBody<T> = ApiSuccessBody<T> | ApiErrorBody

// The backend's authenticate plugin (backend/src/plugins/authenticate.plugin.ts)
// throws UnauthorizedError with this single code for BOTH an invalid and an
// expired access token — there is no separate "token expired" code to check
// for. So: any 401 with this code, on a non-auth endpoint, is treated as
// "try a refresh once" — that's the most specific signal the backend gives.
const UNAUTHORIZED_ERROR_CODE = 'UNAUTHORIZED'

export class ApiError extends Error {
  readonly code: string
  readonly details?: unknown

  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }
}

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean
  }
}

const rawApi = axios.create({
  baseURL: env.apiBaseUrl,
  withCredentials: true,
})

rawApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

// Module-level in-flight promise: the standard dedupe pattern for a 401
// storm. The first 401 sets this; every other request that 401s while a
// refresh is already in flight awaits the SAME promise instead of firing
// its own POST /auth/refresh, then retries once it resolves.
let refreshPromise: Promise<string> | null = null

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = rawApi
      // Body must be an explicit `{}`, not omitted — same as
      // features/auth/api.ts's logout(): the backend's refreshSchema is
      // `z.object({}).strict()`, which Zod rejects (422) when
      // request.body is undefined, not just when it has unexpected keys.
      .post<{ accessToken: string }>('/auth/refresh', {})
      .then((data) => {
        // Response interceptor below already unwrapped this to `{ accessToken }`
        // despite the AxiosResponse<T> return type axios declares.
        const accessToken = (data as unknown as { accessToken: string }).accessToken
        useAuthStore.getState().setAccessToken(accessToken)
        return accessToken
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

function isAuthEndpoint(url: string | undefined): boolean {
  return url === '/auth/login' || url === '/auth/refresh' || url === '/auth/logout'
}

rawApi.interceptors.response.use(
  // Declared to return AxiosResponse to satisfy axios's interceptor type,
  // but actually returns the unwrapped `data` payload directly — see the
  // ApiClient cast at the bottom of this file, which is what callers see.
  (response: AxiosResponse<ApiResponseBody<unknown>>): AxiosResponse => {
    // A 204 (e.g. POST /auth/logout) has no body at all by HTTP spec —
    // response.data is empty/undefined, not the {success,data} envelope.
    // Accessing body.success on that would throw (caught by nothing, since
    // a throw inside a fulfilled interceptor doesn't reach this same
    // .use() call's rejected handler below — it just silently rejects the
    // caller's promise). Confirmed live: this broke logout entirely,
    // useLogout's onSuccess never firing. Every caller of a 204 route
    // expects Promise<void> anyway, so returning undefined here is exactly
    // right, not just a defensive guard.
    if (response.status === 204 || !response.data) {
      return undefined as unknown as AxiosResponse
    }
    const body = response.data
    if (body.success) {
      return body.data as unknown as AxiosResponse
    }
    throw new ApiError(body.error.code, body.error.message, body.error.details)
  },
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error)
    }

    if (!error.response) {
      return Promise.reject(new ApiError('NETWORK_ERROR', error.message || 'Network error'))
    }

    const config = error.config
    const body = error.response.data as ApiErrorBody | undefined
    const code = body?.error?.code ?? 'UNKNOWN_ERROR'
    const message = body?.error?.message ?? 'An unexpected error occurred'
    const details = body?.error?.details

    const canRetry =
      error.response.status === 401 &&
      code === UNAUTHORIZED_ERROR_CODE &&
      config !== undefined &&
      !config._retry &&
      !isAuthEndpoint(config.url)

    if (canRetry) {
      config._retry = true
      try {
        const newToken = await refreshAccessToken()
        config.headers.set('Authorization', `Bearer ${newToken}`)
        return rawApi(config)
      } catch {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        return Promise.reject(new ApiError(code, message, details))
      }
    }

    return Promise.reject(new ApiError(code, message, details))
  },
)

// The interceptor above unwraps every response to just its `data` payload
// (or throws ApiError), so the real runtime return type of each method is
// `Promise<T>`, not axios's default `Promise<AxiosResponse<T>>`. This cast
// makes the exported client's type match what it actually returns.
interface ApiClient {
  get: <T>(url: string, config?: Parameters<typeof rawApi.get>[1]) => Promise<T>
  post: <T>(url: string, data?: unknown, config?: Parameters<typeof rawApi.post>[2]) => Promise<T>
  put: <T>(url: string, data?: unknown, config?: Parameters<typeof rawApi.put>[2]) => Promise<T>
  patch: <T>(url: string, data?: unknown, config?: Parameters<typeof rawApi.patch>[2]) => Promise<T>
  delete: <T>(url: string, config?: Parameters<typeof rawApi.delete>[1]) => Promise<T>
}

export const api = rawApi as unknown as ApiClient
