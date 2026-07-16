// TanStack Query hooks for the "students" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type { ListStudentProfilesParams, ListStudentProfilesResponse } from './types'

function listStudentProfiles(
  params: ListStudentProfilesParams,
): Promise<ListStudentProfilesResponse> {
  return api.get<ListStudentProfilesResponse>('/student-profiles', { params })
}

// `enabled` lets a caller defer this query until it actually has a scope to
// query by (e.g. StudentListPage's college-scoped table, which shouldn't
// fire with an empty collegeId before any college card is selected) — same
// shape as organization/api.ts's useBatches/useTrainingPrograms.
export function useStudentProfiles(
  params: ListStudentProfilesParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['students', 'list', params],
    queryFn: () => listStudentProfiles(params),
    // Keeps the previous page's rows on screen while the next page loads,
    // instead of flashing back to a loading state on every page click.
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  })
}

// One pageSize:1 "total students" count per college — same "one query per
// item" shape as question-bank/api.ts's useQuestionsForPicker/
// useQuestionsWithText (useQueries for a dynamic, per-item set of queries a
// fixed number of useQuery calls can't express). Used by StudentListPage's
// college-card grid so each card shows its own total without fetching every
// student up front. includeArchived:true matches the existing Total stat's
// own definition (active + archived combined), not just active.
export function useStudentCountsByCollege(collegeIds: string[]) {
  const results = useQueries({
    queries: collegeIds.map((collegeId) => ({
      queryKey: [
        'students',
        'list',
        { collegeId, page: 1, pageSize: 1, includeArchived: true },
      ] as const,
      queryFn: () =>
        listStudentProfiles({ collegeId, page: 1, pageSize: 1, includeArchived: true }),
    })),
  })

  const countsByCollegeId = new Map<string, number | undefined>()
  collegeIds.forEach((collegeId, index) => {
    countsByCollegeId.set(collegeId, results[index]?.data?.total)
  })

  return { countsByCollegeId }
}
