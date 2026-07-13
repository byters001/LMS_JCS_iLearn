import { Outlet, useNavigate } from 'react-router-dom'
import { UserMenu } from '@/components/UserMenu'
import { useLogout } from '@/features/auth/api'
import { useAuthStore } from '@/store/authStore'

// Placeholder shell — real trainer dashboard UI comes in a later phase.
// Backend role slug for this layout is 'faculty' (see routes/roles.ts).
function TrainerLayout() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const logout = useLogout()

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })
  }

  return (
    <div>
      <header className="flex items-center justify-end border-b border-border bg-background px-6 py-3">
        <UserMenu
          name={user?.fullName ?? ''}
          email={user?.email ?? ''}
          onLogout={handleLogout}
          isLoggingOut={logout.isPending}
        />
      </header>
      <div className="p-6">
        <Outlet />
      </div>
    </div>
  )
}

export default TrainerLayout
