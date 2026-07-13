// Zustand store for auth/session state. In-memory only — nothing here
// touches localStorage/sessionStorage; the access token lives only for
// the life of the tab (CLAUDE1.md "Backend contract" — Auth).
import { create } from 'zustand'

export interface AuthUser {
  id: string
  email: string
  fullName: string
  roles: string[]
  activeCollegeId: string | null
}

interface AuthState {
  accessToken: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  setAuth: (accessToken: string, user: AuthUser) => void
  setAccessToken: (accessToken: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  setAuth: (accessToken, user) => set({ accessToken, user, isAuthenticated: true }),
  // Used by the api/ client's refresh-retry flow, which only gets back a
  // new accessToken (no user payload) from POST /auth/refresh.
  setAccessToken: (accessToken) => set({ accessToken, isAuthenticated: true }),
  clearAuth: () => set({ accessToken: null, user: null, isAuthenticated: false }),
}))
