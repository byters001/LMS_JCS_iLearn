// Frontend-side types for the "auth" feature (own copy, not shared with
// the backend's *.types.ts). Matches backend/src/modules/auth/auth.controller.ts's
// login response: { accessToken, user }.
import type { AuthUser } from '@/store/authStore'

export interface LoginInput {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}
