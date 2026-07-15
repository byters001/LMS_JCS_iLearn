// Tests RequireAuth/RequireRole (routes/index.tsx) directly, against a
// small purpose-built route tree rather than the real AppRoutes — AppRoutes
// wires in every feature's real page components (each with their own
// TanStack Query data-fetching), which would need a QueryClientProvider
// plus mocks for a dozen unrelated hooks just to reach the guard logic this
// file actually cares about. RequireAuth/RequireRole were exported
// specifically to make this possible (see their export comments).
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/store/authStore'
import { RequireAuth, RequireRole } from './index'

const INITIAL_AUTH_STATE = useAuthStore.getState()

function renderProtectedRoute(initialEntry: string, roles: string[]) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route element={<RequireAuth />}>
          {/* Mirrors AppRoutes' own shape: "/" resolves to the caller's own
              role home, used as RequireRole's wrong-role redirect target. */}
          <Route path="/" element={<Navigate to="/student" replace />} />
          <Route element={<RequireRole roles={roles} />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
          <Route path="/student" element={<div>Student Home</div>} />
          <Route path="/trainer" element={<div>Trainer Home</div>} />
          <Route path="/admin" element={<div>Admin Home</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuthStore.setState(INITIAL_AUTH_STATE, true)
})

describe('RequireAuth', () => {
  it('redirects an unauthenticated user to /login', () => {
    useAuthStore.setState({ isAuthenticated: false, accessToken: null, user: null })

    renderProtectedRoute('/protected', ['faculty'])

    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })
})

describe('RequireRole', () => {
  it("redirects an authenticated user with the wrong role to their own role's home", () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accessToken: 'token',
      user: {
        id: 'u1',
        email: 'student@example.com',
        fullName: 'A Student',
        roles: ['student'],
        activeCollegeId: null,
      },
    })

    // /protected requires 'faculty' — this user only holds 'student'.
    renderProtectedRoute('/protected', ['faculty'])

    expect(screen.getByText('Student Home')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders the protected route for a user holding the required role', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accessToken: 'token',
      user: {
        id: 'u2',
        email: 'faculty@example.com',
        fullName: 'A Trainer',
        roles: ['faculty'],
        activeCollegeId: null,
      },
    })

    renderProtectedRoute('/protected', ['faculty'])

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })
})
