// TanStack Query hooks for the "users" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type { ListUsersParams, ListUsersResponse } from './types'

function listUsers(params: ListUsersParams): Promise<ListUsersResponse> {
  return api.get<ListUsersResponse>('/users', { params })
}

// Backs the trainer picker (AssignTrainerDialog) via roleSlug: 'faculty'.
// GET /users requires users.view, which Faculty already holds (confirmed in
// backend/src/modules/organization/organization.routes.ts's own comment) —
// so this works for the same super_admin-or-faculty callers who can reach
// the assign-trainer endpoints.
export function useUsers(params: ListUsersParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['users', 'list', params],
    queryFn: () => listUsers(params),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  })
}
