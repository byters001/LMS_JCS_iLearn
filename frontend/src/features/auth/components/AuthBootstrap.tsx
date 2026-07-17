// Silent refresh-on-boot: attempts POST /auth/refresh once, before any
// route (including /login) ever renders. Without this, a hard reload with
// a still-valid refresh cookie showed the login form for an instant, then
// yanked the user to it anyway on their first 401 — the httpOnly cookie
// was fine the whole time, nothing was actually checking it until a
// protected request happened to fail. This is the proactive counterpart to
// api/index.ts's existing reactive 401-interceptor refresh; that path
// still only fires later, mid-session, when an access token actually
// expires — it does nothing for the "just reloaded, store is empty"
// moment this component covers.
//
// Lives here (feature-local component, mounted once from App.tsx) rather
// than main.tsx: the refresh call itself needs nothing from React (axios +
// the Zustand store are plain modules), but rendering a real loading UI
// while it's in flight is easiest to express as a normal component inside
// the tree App.tsx already owns, gating AppRoutes's children instead of
// standing up a second, parallel pre-React render path.
import { useEffect, useState, type ReactNode } from 'react'
import { GraduationCap, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { refreshSession } from '../api'

// Module-level singleton, same dedupe shape as api/index.ts's own
// refreshPromise for the reactive 401 path. Without it, React 19
// StrictMode's dev-only double-invoke of this component's effect (mount ->
// cleanup -> mount) fires two concurrent POST /auth/refresh calls against a
// single-use, rotating refresh token (auth.service.ts's refresh() revokes
// the old jti as soon as it verifies it). Confirmed live: both calls can
// land as 200 if the race resolves in either order, but there's no
// guarantee — the second one arriving after the first's revoke lands in
// Redis gets a real 401, and AuthBootstrap's .catch(() => {}) would then
// silently leave a genuinely valid session logged out. Sharing one promise
// means every mount of this effect awaits the exact same in-flight
// request, so only one refresh token is ever actually rotated per boot.
let bootRefreshPromise: ReturnType<typeof refreshSession> | null = null

function refreshSessionOnBoot() {
  if (!bootRefreshPromise) {
    bootRefreshPromise = refreshSession().finally(() => {
      bootRefreshPromise = null
    })
  }
  return bootRefreshPromise
}

function BootLoadingScreen() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-brand-gradient-from to-brand-gradient-to">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
          <GraduationCap className="h-7 w-7 text-white" />
        </div>
        <Loader2 className="h-6 w-6 animate-spin text-white/80" />
      </div>
    </div>
  )
}

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const setAuth = useAuthStore((state) => state.setAuth)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    let cancelled = false

    refreshSessionOnBoot()
      .then((data) => {
        if (!cancelled) {
          setAuth(data.accessToken, data.user)
        }
      })
      // No valid refresh cookie (never logged in, or it expired) — fall
      // through to the unauthenticated state routes/index.tsx's
      // RequireAuth already handles by sending to /login. Nothing to
      // surface to the user here; this is the expected steady state for
      // anyone who isn't mid-session.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setIsChecking(false)
        }
      })

    return () => {
      cancelled = true
    }
    // Intentionally runs once per app load — a boot-time check, not a
    // subscription to auth state (setAuth is a stable Zustand action
    // reference and wouldn't meaningfully change anyway).
  }, [])

  if (isChecking) {
    return <BootLoadingScreen />
  }

  return <>{children}</>
}
