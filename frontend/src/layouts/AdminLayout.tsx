import { Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

// Placeholder shell — real admin dashboard UI comes in a later phase.
function AdminLayout() {
  const user = useAuthStore((state) => state.user)

  return (
    <div className="p-6">
      <p className="text-brand-primary">Logged in as: {user?.fullName} (super_admin)</p>
      <Outlet />
    </div>
  )
}

export default AdminLayout
