// TanStack Query hooks for the "auth" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuthStore } from '@/store/authStore'
import type { LoginInput, LoginResponse } from './types'

function login(input: LoginInput): Promise<LoginResponse> {
  return api.post<LoginResponse>('/auth/login', input)
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
