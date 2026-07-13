import { Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

// Placeholder shell — real trainer dashboard UI comes in a later phase.
// Backend role slug for this layout is 'faculty' (see routes/roles.ts).
function TrainerLayout() {
  const user = useAuthStore((state) => state.user)

  return (
    <div className="p-6">
      <p className="text-brand-primary">Logged in as: {user?.fullName} (faculty)</p>
      <Outlet />
    </div>
  )
}

export default TrainerLayout
