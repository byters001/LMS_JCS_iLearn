// React Router tree + role-based route guards. Guards live here, not
// scattered per-page (CLAUDE1.md "Boundary rules").
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import LoginPage from '@/features/auth/pages/LoginPage'
import StudentListPage from '@/features/students/pages/StudentListPage'
import AdminLayout from '@/layouts/AdminLayout'
import StudentLayout from '@/layouts/StudentLayout'
import TrainerLayout from '@/layouts/TrainerLayout'
import { useAuthStore } from '@/store/authStore'
import { getRoleHomePath } from './roles'

// A stable reference so the `?? EMPTY_ROLES` fallback below doesn't hand
// useSyncExternalStore a new array on every call — Zustand/React compares
// snapshots by reference, and a fresh `[]` literal each render is an
// infinite render loop ("Maximum update depth exceeded"), not a no-op.
const EMPTY_ROLES: string[] = []

// Unauthenticated users hitting a protected route are sent to /login.
function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

// Sits nested *inside* RequireAuth, not folded into it: RequireAuth answers
// "are you logged in at all" (failure -> /login); this answers "does your
// role match this specific route" (failure -> your OWN role home, since
// you're already authenticated, just not authorized for this route — a
// different redirect target than RequireAuth's, so it stays a separate
// component rather than an optional `roles` prop bolted onto RequireAuth).
function RequireRole({ roles }: { roles: string[] }) {
  const userRoles = useAuthStore((state) => state.user?.roles ?? EMPTY_ROLES)
  const isAllowed = userRoles.some((role) => roles.includes(role))
  return isAllowed ? <Outlet /> : <Navigate to={getRoleHomePath(userRoles)} replace />
}

// Authenticated users hitting /login are sent to their role's dashboard
// instead of seeing the login form again.
function RedirectIfAuthenticated() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const roles = useAuthStore((state) => state.user?.roles ?? EMPTY_ROLES)
  return isAuthenticated ? <Navigate to={getRoleHomePath(roles)} replace /> : <Outlet />
}

// "/" itself isn't a real dashboard — it just resolves to whichever
// role-namespaced placeholder dashboard the signed-in user belongs to.
function RoleHomeRedirect() {
  const roles = useAuthStore((state) => state.user?.roles ?? EMPTY_ROLES)
  return <Navigate to={getRoleHomePath(roles)} replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/" element={<RoleHomeRedirect />} />

        <Route element={<RequireRole roles={['student']} />}>
          <Route path="/student" element={<StudentLayout />} />
        </Route>

        <Route element={<RequireRole roles={['faculty']} />}>
          <Route path="/trainer" element={<TrainerLayout />}>
            <Route index element={<StudentListPage />} />
          </Route>
        </Route>

        <Route element={<RequireRole roles={['super_admin']} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<StudentListPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
