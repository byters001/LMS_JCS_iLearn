// TanStack Query hooks for the "users" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type {
  CreateFacultyUserInput,
  ListUsersParams,
  ListUsersResponse,
  SafeUser,
  UpdateUserInput,
} from './types'

function listUsers(params: ListUsersParams): Promise<ListUsersResponse> {
  return api.get<ListUsersResponse>('/users', { params })
}

// Backs the trainer picker (AssignTrainerDialog) via roleSlug: 'faculty',
// and the Admin Faculty management page (same filter, different caller).
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

function createFacultyUser(input: CreateFacultyUserInput): Promise<SafeUser> {
  return api.post<SafeUser>('/users', input)
}

export function useCreateFacultyUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createFacultyUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'list'] })
    },
  })
}

function updateUser(id: string, input: UpdateUserInput): Promise<SafeUser> {
  return api.patch<SafeUser>(`/users/${id}`, input)
}

// Backs the Faculty management page's Deactivate/Reactivate action —
// reuses the EXISTING PATCH /users/:id { isActive } endpoint (already
// super_admin-only via users.edit) rather than a new delete route. See
// backend/src/modules/users/users.routes.ts's own comment on why hard
// delete was rejected.
export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) => updateUser(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'list'] })
    },
  })
}
