import { Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

// Placeholder shell — real student dashboard UI comes in a later phase.
function StudentLayout() {
  const user = useAuthStore((state) => state.user)

  return (
    <div className="p-6">
      <p className="text-brand-primary">Logged in as: {user?.fullName} (student)</p>
      <Outlet />
    </div>
  )
}

export default StudentLayout
