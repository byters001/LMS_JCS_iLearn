// TanStack Query hooks for the "assessments" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type { ListAvailableAssessmentsParams, ListAvailableAssessmentsResponse } from './types'

// Calls the student-scoped GET /assessments/available (batch-authorized
// only) — NOT GET /assessments, which is staff-only and unscoped. See
// backend/src/modules/assessments/assessments.routes.ts's comment on why
// these are separate routes.
function listAvailableAssessments(
  params: ListAvailableAssessmentsParams,
): Promise<ListAvailableAssessmentsResponse> {
  return api.get<ListAvailableAssessmentsResponse>('/assessments/available', { params })
}

export function useAvailableAssessments(params: ListAvailableAssessmentsParams) {
  return useQuery({
    queryKey: ['assessments', 'available', params],
    queryFn: () => listAvailableAssessments(params),
    placeholderData: keepPreviousData,
  })
}
