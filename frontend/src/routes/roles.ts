// Role-to-dashboard-path mapping. Lives here (not inline in routes/index.tsx
// or duplicated in LoginPage) so both the route tree's redirect logic and
// LoginPage's post-login navigation share one source of truth without
// creating a circular import between routes/ and features/auth/.
//
// Role slugs match the backend's actual seed data
// (backend/drizzle/reference/schema.sql roles table: 'super_admin',
// 'faculty', 'student' — confirmed via the roles table INSERTs). There is
// no 'admin' or 'trainer' slug on the backend; those are this frontend's
// existing layout/file naming only (StudentLayout/TrainerLayout/AdminLayout
// from the scaffold phase), so the URL paths below intentionally keep that
// naming while the lookup key is the real slug.
const ROLE_HOME_PATHS: Record<string, string> = {
  super_admin: '/admin',
  faculty: '/trainer',
  student: '/student',
}

// A user can hold more than one role assignment — the backend's userRoles
// join table supports it (see backend auth.service.ts's
// resolveActiveCollegeId comment), though no current seed data actually
// assigns a user two roles at once. If/when it happens, the most-privileged
// role decides which dashboard wins.
const ROLE_PRIORITY = ['super_admin', 'faculty', 'student']

export function getPrimaryRole(roles: string[]): string | undefined {
  return ROLE_PRIORITY.find((role) => roles.includes(role))
}

export function getRoleHomePath(roles: string[]): string {
  const primaryRole = getPrimaryRole(roles)
  return primaryRole ? ROLE_HOME_PATHS[primaryRole] : '/login'
}
