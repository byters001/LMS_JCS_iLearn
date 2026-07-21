// React Router tree + role-based route guards. Guards live here, not
// scattered per-page (CLAUDE1.md "Boundary rules").
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import LoginPage from '@/features/auth/pages/LoginPage'
import BatchPerformancePage from '@/features/analytics/pages/BatchPerformancePage'
import AssessmentDetailPage from '@/features/assessments/pages/AssessmentDetailPage'
import AssessmentEditPage from '@/features/assessments/pages/AssessmentEditPage'
import AssessmentInstructionsPage from '@/features/assessments/pages/AssessmentInstructionsPage'
import AssessmentListPage from '@/features/assessments/pages/AssessmentListPage'
import CreateAssessmentPage from '@/features/assessments/pages/CreateAssessmentPage'
import StudentAssessmentsPage from '@/features/assessments/pages/StudentAssessmentsPage'
import AttemptPage from '@/features/attempts/pages/AttemptPage'
import CreatePoolPage from '@/features/question-bank/pages/CreatePoolPage'
import CreateQuestionPage from '@/features/question-bank/pages/CreateQuestionPage'
import PoolDetailPage from '@/features/question-bank/pages/PoolDetailPage'
import PoolListPage from '@/features/question-bank/pages/PoolListPage'
import QuestionDetailPage from '@/features/question-bank/pages/QuestionDetailPage'
import QuestionListPage from '@/features/question-bank/pages/QuestionListPage'
import AttemptResultPage from '@/features/reports/pages/AttemptResultPage'
import BatchListPage from '@/features/organization/pages/BatchListPage'
import CollegeListPage from '@/features/organization/pages/CollegeListPage'
import CreateBatchPage from '@/features/organization/pages/CreateBatchPage'
import MyBatchesPage from '@/features/organization/pages/MyBatchesPage'
import FacultyListPage from '@/features/users/pages/FacultyListPage'
import LeaderboardPage from '@/features/reports/pages/LeaderboardPage'
import MyAttemptsListPage from '@/features/reports/pages/MyAttemptsListPage'
import PerformancePage from '@/features/reports/pages/PerformancePage'
import StudentListPage from '@/features/students/pages/StudentListPage'
import TrainerDetailPage from '@/features/trainers/pages/TrainerDetailPage'
import TrainersDashboardPage from '@/features/trainers/pages/TrainersDashboardPage'
import AdminLayout from '@/layouts/AdminLayout'
import AttemptLayout from '@/layouts/AttemptLayout'
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
// Exported for direct unit testing (routes/RequireAuth.test.tsx) — the
// alternative would be rendering the full AppRoutes tree in tests, which
// drags in every feature page's own data-fetching just to exercise this
// guard's redirect logic.
export function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

// Sits nested *inside* RequireAuth, not folded into it: RequireAuth answers
// "are you logged in at all" (failure -> /login); this answers "does your
// role match this specific route" (failure -> your OWN role home, since
// you're already authenticated, just not authorized for this route — a
// different redirect target than RequireAuth's, so it stays a separate
// component rather than an optional `roles` prop bolted onto RequireAuth).
export function RequireRole({ roles }: { roles: string[] }) {
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
            {/* Lockdown item 1 — the sole path into starting an attempt now
                goes through here first (AssessmentDetailPage's "Start
                Attempt" button navigates here instead of calling
                useStartAttempt itself). A distinct three-segment path, not
                nested under assessments/:id — React Router matches by exact
                segment count, so this never conflicts with the route above. */}
            <Route path="assessments/:id/instructions" element={<AssessmentInstructionsPage />} />
            <Route path="attempts" element={<MyAttemptsListPage />} />
            {/* attempts/:attemptId (the LIVE attempt screen) deliberately
                does NOT live here — see the sibling route below. Once
                submitted, though, there's nothing left to lock down or stay
                distraction-free for, so the results page keeps the normal
                StudentLayout shell (nav back to Your Assessments, etc.). */}
            <Route path="attempts/:attemptId/submitted" element={<AttemptResultPage />} />
            {/* 4-page nav phase — LeaderboardSection/PerformanceAnalyticsSection
                moved here from StudentAssessmentsPage.tsx (see those two
                pages' own comments) onto their own routes, matching
                StudentLayout.tsx's updated NAV_LINKS order. */}
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="performance" element={<PerformancePage />} />
          </Route>

          {/* Exam-mode layout (this phase) — a SEPARATE layout wrapper for
              the live attempt route, not nested inside StudentLayout and not
              StudentLayout conditionally hiding its own nav. Two reasons this
              beat conditional hiding: (1) StudentLayout's sidebar/header carry
              real interactive chrome (NavLinks, UserMenu/logout,
              NotificationBell) that would all need individual isAttemptRoute
              conditionals sprinkled through an otherwise-shared component,
              versus just not rendering that tree at all here; (2) this
              codebase's existing layout pattern is already "one shell per
              context" (StudentLayout/TrainerLayout/AdminLayout, one each,
              picked by route nesting) — a dedicated AttemptLayout for exam
              mode is the same pattern applied one level finer, not a new
              architectural concept. Still nested inside THIS SAME
              RequireRole roles={['student']} guard as the block above (both
              are its direct children) — only the chrome differs, the
              role-authorization boundary doesn't move. */}
          <Route path="/student/attempts/:attemptId" element={<AttemptLayout />}>
            <Route index element={<AttemptPage />} />
          </Route>
        </Route>

        <Route element={<RequireRole roles={['faculty']} />}>
          <Route path="/trainer" element={<TrainerLayout />}>
            {/* Fix-doc item 6: /trainer's index used to render
                StudentListPage's college-wise browser, which 403s for
                Faculty (GET /colleges is gated by colleges.view,
                super_admin-only — see TrainerLayout.tsx's NAV_LINKS
                comment). Redirects straight to My Batches, now the actual
                Trainer landing page and where student browsing lives
                (per-batch drill-down, not a separate route/page). */}
            <Route index element={<Navigate to="batches" replace />} />
            {/* Backed by GET /batches/mine (self-scoped via batch_trainers),
                real data as of Phase 4 — see BatchListPage.tsx's own comment,
                previously this route didn't exist because the scoping it
                depends on didn't exist yet. */}
            <Route path="batches" element={<MyBatchesPage />} />
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
            <Route path="questions">
              <Route index element={<QuestionListPage />} />
              <Route path="new" element={<CreateQuestionPage />} />
              <Route path=":id" element={<QuestionDetailPage />} />
            </Route>
            <Route path="pools">
              <Route index element={<PoolListPage />} />
              <Route path="new" element={<CreatePoolPage />} />
              <Route path=":id" element={<PoolDetailPage />} />
            </Route>
            <Route path="analytics" element={<BatchPerformancePage />} />
          </Route>
        </Route>

        <Route element={<RequireRole roles={['super_admin']} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<StudentListPage />} />
            {/* Item 10 tier 1 — platform-structure management (colleges +
                departments), Super-Admin-only by placement in this same
                RequireRole block, not a separate guard. Single route/nav
                entry: Departments lives as a Tab inside CollegeListPage
                itself (see that file's own comment), not a second nested
                route the way pools/questions below are. */}
            <Route path="colleges" element={<CollegeListPage />} />
            {/* Admin's full cross-college batch management (create, assign
                trainers, toggle active). Trainer's own scoped view is the
                separate /trainer/batches route above, backed by
                MyBatchesPage/listMyBatches — not this route. */}
            <Route path="batches">
              <Route index element={<BatchListPage />} />
              <Route path="new" element={<CreateBatchPage />} />
            </Route>
            <Route path="faculty" element={<FacultyListPage />} />
            {/* Phase 5 — Super-Admin-only trainer dashboard (brief §3.7):
                which trainer works in which college/department/batch, plus
                performance trends. Nested (not flat), same reasoning as
                pools/questions above — TrainersDashboardPage's row links
                use a relative `to={trainer.trainerId}` Link, which needs
                this nesting depth to resolve to .../trainers/:trainerId
                rather than replacing the whole /admin/trainers segment. */}
            <Route path="trainers">
              <Route index element={<TrainersDashboardPage />} />
              <Route path=":trainerId" element={<TrainerDetailPage />} />
            </Route>
            <Route path="assessments">
              <Route index element={<AssessmentListPage />} />
              <Route path="new" element={<CreateAssessmentPage />} />
              <Route path=":id/edit" element={<AssessmentEditPage />} />
            </Route>
            <Route path="questions">
              <Route index element={<QuestionListPage />} />
              <Route path="new" element={<CreateQuestionPage />} />
              <Route path=":id" element={<QuestionDetailPage />} />
            </Route>
            <Route path="pools">
              <Route index element={<PoolListPage />} />
              <Route path="new" element={<CreatePoolPage />} />
              <Route path=":id" element={<PoolDetailPage />} />
            </Route>
            <Route path="analytics" element={<BatchPerformancePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
