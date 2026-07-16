// TanStack Query hooks for the "students" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { env } from '@/lib/env'
import { useAuthStore } from '@/store/authStore'
import type {
  CreateStudentsInBatchInput,
  CreateStudentsInBatchResponse,
  ExportStudentsParams,
  ListStudentProfilesParams,
  ListStudentProfilesResponse,
} from './types'

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

// --- Bulk student creation (Phase 3) ---
// Single-student manual entry reuses this exact mutation with a one-item
// `students` array — same endpoint, no separate hook, per the backend's own
// "same endpoint, friendlier single-row UI" design (see students.schema.ts's
// createStudentsInBatchSchema comment).
function createStudentsInBatch(
  batchId: string,
  input: CreateStudentsInBatchInput,
): Promise<CreateStudentsInBatchResponse> {
  return api.post<CreateStudentsInBatchResponse>(`/batches/${batchId}/students`, input)
}

export function useCreateStudentsInBatch(batchId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStudentsInBatchInput) => createStudentsInBatch(batchId, input),
    onSuccess: () => {
      // Both the college-scoped table (StudentListPage) and the per-college
      // count cards key off this same ['students', 'list', ...] prefix.
      queryClient.invalidateQueries({ queryKey: ['students', 'list'] })
    },
  })
}

// --- CSV export (Phase 3) ---
// Deliberately NOT routed through the shared `api` client: the backend
// sends a raw CSV file for this one endpoint, not the {success,data}
// envelope api/index.ts's response interceptor unconditionally expects (see
// students.controller.ts's exportStudentsCsv comment on the backend side) —
// running it through that interceptor would crash trying to read
// `body.success` off a Blob. Plain fetch, manual Authorization header
// (mirrors api/index.ts's own request interceptor), then a synthetic <a>
// click to trigger the browser's native download — there's no other way to
// name/save a fetched Blob as a file.
export async function downloadStudentsCsv(
  batchId: string,
  batchName: string,
  params: ExportStudentsParams,
): Promise<void> {
  const query = new URLSearchParams()
  if (params.limit) query.set('limit', String(params.limit))
  if (params.departmentId) query.set('departmentId', params.departmentId)
  if (params.status) query.set('status', params.status)
  const queryString = query.toString()

  const accessToken = useAuthStore.getState().accessToken
  const response = await fetch(
    `${env.apiBaseUrl}/batches/${batchId}/students/export${queryString ? `?${queryString}` : ''}`,
    {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      credentials: 'include',
    },
  )

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'Failed to export students.')
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${batchName.replace(/[^a-z0-9-]+/gi, '-')}-students.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
