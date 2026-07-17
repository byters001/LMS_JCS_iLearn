// TanStack Query hooks for the "auth" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuthStore } from '@/store/authStore'
import type { LoginInput, LoginResponse } from './types'

function login(input: LoginInput): Promise<LoginResponse> {
  return api.post<LoginResponse>('/auth/login', input)
}

// Boot-time silent refresh (components/AuthBootstrap.tsx) — same endpoint
// api/index.ts's response interceptor already calls reactively on a 401,
// but called here proactively, once, before any route renders. The
// httpOnly refresh cookie (if still valid) is sent automatically via
// axios's withCredentials, same as every other call through `api`. Body
// must be an explicit `{}`, same reason as logout() above (Zod's
// .strict() rejects an undefined body). Returns the same
// { accessToken, user } shape as login() — see backend auth.service.ts's
// refresh(), extended to match so this boot path has a `user` to populate
// the store with, not just a token.
export function refreshSession(): Promise<LoginResponse> {
  return api.post<LoginResponse>('/auth/refresh', {})
}

// Body must be an explicit `{}`, not omitted — the backend's logoutSchema
// is `z.object({}).strict()`, which Zod rejects when request.body is
// undefined (no Content-Type/body sent at all), not just when it has
// unexpected keys. Confirmed live: omitting the body 422s.
function logout(): Promise<void> {
  return api.post<void>('/auth/logout', {})
}

export function useLogin() {
  const setAuth = useAuthStore((state) => state.setAuth)

  return useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user)
    },
  })
}

export function useLogout() {
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      clearAuth()
      // Cached server data belongs to the now-logged-out user's session —
      // drop it so the next login doesn't briefly render stale data.
      queryClient.clear()
    },
  })
}
