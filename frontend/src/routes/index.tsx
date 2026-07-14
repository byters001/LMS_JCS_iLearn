// React Router tree + role-based route guards. Guards live here, not
// scattered per-page (CLAUDE1.md "Boundary rules").
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import LoginPage from '@/features/auth/pages/LoginPage'
import BatchPerformancePage from '@/features/analytics/pages/BatchPerformancePage'
import AssessmentDetailPage from '@/features/assessments/pages/AssessmentDetailPage'
import AssessmentEditPage from '@/features/assessments/pages/AssessmentEditPage'
import AssessmentListPage from '@/features/assessments/pages/AssessmentListPage'
import CreateAssessmentPage from '@/features/assessments/pages/CreateAssessmentPage'
import StudentAssessmentsPage from '@/features/assessments/pages/StudentAssessmentsPage'
import AttemptPage from '@/features/attempts/pages/AttemptPage'
import AttemptResultPage from '@/features/reports/pages/AttemptResultPage'
import MyAttemptsListPage from '@/features/reports/pages/MyAttemptsListPage'
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
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<StudentAssessmentsPage />} />
            <Route path="assessments/:id" element={<AssessmentDetailPage />} />
            <Route path="attempts" element={<MyAttemptsListPage />} />
            <Route path="attempts/:attemptId" element={<AttemptPage />} />
            {/* Same route Part 3's manual-submit and timer-auto-submit
                navigate() calls already target — merged onto this new
                results page rather than adding a new URL, so that
                untouched (features/attempts is off-limits this phase
                beyond this file) navigation logic lands somewhere useful
                without needing its own changes. */}
            <Route path="attempts/:attemptId/submitted" element={<AttemptResultPage />} />
          </Route>
        </Route>

        <Route element={<RequireRole roles={['faculty']} />}>
          <Route path="/trainer" element={<TrainerLayout />}>
            <Route index element={<StudentListPage />} />
            {/* Properly NESTED (not flat siblings) — React Router resolves
                relative navigate()/Link paths (".." , "new", "${id}/edit")
                against the ROUTE TREE's nesting depth, not URL segment
                count. Flat siblings here previously sent CreateAssessmentPage's
                post-create navigate('../id/edit') up to /trainer itself
                instead of /trainer/assessments — confirmed live before this
                fix. Omitting `element` on the parent "assessments" Route
                renders an implicit <Outlet />. */}
            <Route path="assessments">
              <Route index element={<AssessmentListPage />} />
              <Route path="new" element={<CreateAssessmentPage />} />
              <Route path=":id/edit" element={<AssessmentEditPage />} />
            </Route>
            <Route path="analytics" element={<BatchPerformancePage />} />
          </Route>
        </Route>

        <Route element={<RequireRole roles={['super_admin']} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<StudentListPage />} />
            <Route path="assessments">
              <Route index element={<AssessmentListPage />} />
              <Route path="new" element={<CreateAssessmentPage />} />
              <Route path=":id/edit" element={<AssessmentEditPage />} />
            </Route>
            <Route path="analytics" element={<BatchPerformancePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
