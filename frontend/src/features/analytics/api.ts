// TanStack Query hooks for the "analytics" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { env } from '@/lib/env'
import { triggerBlobDownload } from '@/lib/spreadsheet'
import { useAuthStore } from '@/store/authStore'
import type {
  BatchAssessmentParticipationResult,
  BatchPerformanceSummary,
  CategoryImprovementRow,
  CollegePerformanceRow,
  GetBatchPerformanceParams,
  MyBatchPerformanceRow,
  MyOverview,
  PerStudentPerformanceRow,
  PlatformOverview,
  ProctoringActivityResult,
} from './types'

// Exported (Faculty "needs attention" widget, FacultyAnalyticsPage) so
// useMyNeedsAttention below can fan this SAME fetcher out across every batch
// the caller is assigned to via useQueries, rather than duplicating the
// request-building logic a second time.
export function getBatchPerformance(
  batchId: string,
  params: GetBatchPerformanceParams,
): Promise<BatchPerformanceSummary> {
  return api.get<BatchPerformanceSummary>(`/analytics/batches/${batchId}/performance`, { params })
}

// assessmentId is optional on the backend (confirmed by reading
// analytics.schema.ts's getBatchPerformanceQuerySchema directly, not
// assumed). Omitting it does NOT pool/average across every assessment the
// batch has ever attempted — analytics.service.ts's own module comment is
// explicit that mixing raw totalScore values across assessments with
// different total-possible-marks scales would be misleading, so the
// backend instead defaults to the batch's single MOST RECENTLY ACTIVE
// assessment. If the batch has never had an attempt on any assessment at
// all, this throws a 404 (code NOT_FOUND, "This batch has no attempts on
// any assessment yet") rather than an empty 200 — BatchPerformancePage
// treats that as a distinct empty state from "an assessment was resolved,
// but zero graded attempts exist yet" (a 200 with averageScore/passRate/
// scoreDistribution all null).
export function useBatchPerformance(
  batchId: string | undefined,
  params: GetBatchPerformanceParams,
) {
  return useQuery({
    queryKey: ['analytics', 'batch-performance', batchId, params],
    queryFn: () => getBatchPerformance(batchId as string, params),
    enabled: Boolean(batchId),
    placeholderData: keepPreviousData,
  })
}

// --- Batch assessment participation (item 10 part 1) ---

function getBatchAssessmentParticipation(batchId: string): Promise<BatchAssessmentParticipationResult> {
  return api.get<BatchAssessmentParticipationResult>(`/analytics/batches/${batchId}/assessments`)
}

// No params beyond batchId — matches the backend route exactly (analytics.
// routes.ts's GET /analytics/batches/:batchId/assessments takes no query
// schema at all, confirmed by reading the real route, not assumed). Every
// participation-eligible assessment assigned to the batch comes back in
// one unpaginated list.
export function useBatchAssessmentParticipation(batchId: string | undefined) {
  return useQuery({
    queryKey: ['analytics', 'batch-assessment-participation', batchId],
    queryFn: () => getBatchAssessmentParticipation(batchId as string),
    enabled: Boolean(batchId),
  })
}

// --- CSV exports (BatchPerformancePage reports follow-up) ---
// Same "fetch the raw CSV directly, bypass the shared api/ client's
// {success,data}-envelope unwrapping" approach as features/students/api.ts's
// downloadStudentsExport, for the identical reason: these two backend
// routes send a raw CSV body, not the JSON envelope api/index.ts's response
// interceptor unconditionally expects.
async function downloadCsv(path: string, filenameFallback: string): Promise<void> {
  const accessToken = useAuthStore.getState().accessToken
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: 'include',
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'Failed to export report.')
  }

  const csvText = await response.text()
  // The backend's Content-Disposition header already names the file, but
  // fetch() doesn't expose that filename directly to the caller — the
  // fallback here is only ever used if that header is somehow missing.
  const disposition = response.headers.get('Content-Disposition')
  const match = disposition?.match(/filename="([^"]+)"/)
  triggerBlobDownload(
    new Blob([csvText], { type: 'text/csv;charset=utf-8' }),
    match?.[1] ?? filenameFallback,
  )
}

export function downloadBatchPerformanceExport(
  batchId: string,
  assessmentId: string | undefined,
): Promise<void> {
  const query = assessmentId ? `?assessmentId=${assessmentId}` : ''
  return downloadCsv(
    `/analytics/batches/${batchId}/performance/export${query}`,
    'batch-results.csv',
  )
}

export function downloadBatchSummaryExport(batchId: string): Promise<void> {
  return downloadCsv(`/analytics/batches/${batchId}/summary-export`, 'batch-summary.csv')
}

// --- Super Admin platform analytics ---
// Super-Admin-only on the backend (requireSuperAdmin, layered on top of
// this module's existing analytics.view gate — see analytics.service.ts's
// own comment) — these three are only ever called from SuperAdminAnalyticsPage,
// itself only reachable under /admin (RequireRole roles={['super_admin']}
// in routes/index.tsx), so no separate `enabled` gate is needed here the
// way BatchPerformancePage's Super-Admin-only college picker needs one.

function getPlatformOverview(collegeId: string | undefined): Promise<PlatformOverview> {
  return api.get<PlatformOverview>('/analytics/overview', { params: { collegeId } })
}

export function useAnalyticsOverview(collegeId: string | undefined) {
  return useQuery({
    queryKey: ['analytics', 'overview', collegeId],
    queryFn: () => getPlatformOverview(collegeId),
    placeholderData: keepPreviousData,
  })
}

function getCollegePerformance(): Promise<CollegePerformanceRow[]> {
  return api.get<CollegePerformanceRow[]>('/analytics/college-performance')
}

export function useCollegePerformance() {
  return useQuery({
    queryKey: ['analytics', 'college-performance'],
    queryFn: getCollegePerformance,
  })
}

function getCategoryImprovement(collegeId: string | undefined): Promise<CategoryImprovementRow[]> {
  return api.get<CategoryImprovementRow[]>('/analytics/category-improvement', {
    params: { collegeId },
  })
}

export function useCategoryImprovement(collegeId: string | undefined) {
  return useQuery({
    queryKey: ['analytics', 'category-improvement', collegeId],
    queryFn: () => getCategoryImprovement(collegeId),
    placeholderData: keepPreviousData,
  })
}

// --- Faculty's own analytics (Phase 3) ---
// Self-scoped on the backend via batch_trainers (no requireSuperAdmin-
// equivalent gate there — see analytics.service.ts's own comment) — these
// three are only ever called from FacultyAnalyticsPage, itself only
// reachable under /trainer (RequireRole roles={['faculty']} in
// routes/index.tsx).

function getMyOverview(batchId: string | undefined): Promise<MyOverview> {
  return api.get<MyOverview>('/analytics/my-overview', { params: { batchId } })
}

export function useMyAnalyticsOverview(batchId: string | undefined) {
  return useQuery({
    queryKey: ['analytics', 'my-overview', batchId],
    queryFn: () => getMyOverview(batchId),
    placeholderData: keepPreviousData,
  })
}

function getMyBatchPerformance(): Promise<MyBatchPerformanceRow[]> {
  return api.get<MyBatchPerformanceRow[]>('/analytics/my-batch-performance')
}

export function useMyBatchPerformance() {
  return useQuery({
    queryKey: ['analytics', 'my-batch-performance'],
    queryFn: getMyBatchPerformance,
  })
}

function getMyCategoryImprovement(batchId: string | undefined): Promise<CategoryImprovementRow[]> {
  return api.get<CategoryImprovementRow[]>('/analytics/my-category-improvement', {
    params: { batchId },
  })
}

export function useMyCategoryImprovement(batchId: string | undefined) {
  return useQuery({
    queryKey: ['analytics', 'my-category-improvement', batchId],
    queryFn: () => getMyCategoryImprovement(batchId),
    placeholderData: keepPreviousData,
  })
}

// --- Faculty "needs attention" (Phase 2 dashboard) ---
// "if derivable from existing data" per the Phase 2 brief — this is exactly
// that: fans getBatchPerformance (already used by BatchPerformancePage) out
// across every batch the caller is assigned to via useQueries, one request
// per batch (bounded by how many batches one trainer realistically has,
// same "class-sized cohort, cheap enough" scale reasoning the backend
// applies to a single batch), rather than a new backend aggregation. A
// batch with zero attempts on any assessment yet 404s
// (analytics.service.ts's getBatchPerformance) — surfaced here as
// `result.data` simply staying undefined for that batch, not a page-level
// error, since "no data yet" for one batch shouldn't blank the whole widget.
export interface NeedsAttentionRow extends PerStudentPerformanceRow {
  batchId: string
  batchName: string
}

export function useMyNeedsAttention(batches: { id: string; name: string }[]) {
  return useQueries({
    queries: batches.map((batch) => ({
      queryKey: ['analytics', 'batch-performance', batch.id, { page: 1, pageSize: 100 }],
      queryFn: () => getBatchPerformance(batch.id, { page: 1, pageSize: 100 }),
      retry: false,
    })),
    combine: (results) => {
      const rows: NeedsAttentionRow[] = []
      results.forEach((result, index) => {
        const batch = batches[index]
        if (!result.data) return
        for (const student of result.data.students) {
          if (student.status === 'failed') {
            rows.push({ ...student, batchId: batch.id, batchName: batch.name })
          }
        }
      })
      rows.sort((a, b) => Number(a.totalScore ?? 0) - Number(b.totalScore ?? 0))
      return {
        isPending: batches.length > 0 && results.some((result) => result.isPending),
        rows,
      }
    },
  })
}

// --- Proctoring activity (Phase 2 dashboard correction) ---
// Replaces the originally-proposed "pending/reviewed" admin stat — see
// types.ts's ProctoringActivityResult comment for the audit finding this is
// built from. Super-Admin-only on the backend (requireSuperAdmin layered on
// analytics.view, same as overview/college-performance/category-improvement
// above), only ever called from SuperAdminAnalyticsPage.

function getProctoringActivity(
  collegeId: string | undefined,
  days: number,
): Promise<ProctoringActivityResult> {
  return api.get<ProctoringActivityResult>('/analytics/proctoring-activity', {
    params: { collegeId, days },
  })
}

export function useProctoringActivity(collegeId: string | undefined, days: number) {
  return useQuery({
    queryKey: ['analytics', 'proctoring-activity', collegeId, days],
    queryFn: () => getProctoringActivity(collegeId, days),
    placeholderData: keepPreviousData,
  })
}
