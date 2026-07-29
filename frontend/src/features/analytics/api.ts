// TanStack Query hooks for the "analytics" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { env } from '@/lib/env'
import { triggerBlobDownload } from '@/lib/spreadsheet'
import { useAuthStore } from '@/store/authStore'
import type {
  BatchAssessmentParticipationResult,
  BatchPerformanceSummary,
  GetBatchPerformanceParams,
} from './types'

function getBatchPerformance(
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
