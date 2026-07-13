// TanStack Query hooks for the "students" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type { ListStudentProfilesParams, ListStudentProfilesResponse } from './types'

function listStudentProfiles(
  params: ListStudentProfilesParams,
): Promise<ListStudentProfilesResponse> {
  return api.get<ListStudentProfilesResponse>('/student-profiles', { params })
}

export function useStudentProfiles(params: ListStudentProfilesParams) {
  return useQuery({
    queryKey: ['students', 'list', params],
    queryFn: () => listStudentProfiles(params),
    // Keeps the previous page's rows on screen while the next page loads,
    // instead of flashing back to a loading state on every page click.
    placeholderData: keepPreviousData,
  })
}
