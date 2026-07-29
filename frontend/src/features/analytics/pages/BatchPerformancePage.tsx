import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/Combobox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAssessments } from '@/features/assessments/api'
import { useBatches, useColleges, useMyBatches } from '@/features/organization/api'
import { CARD_GRADIENT, cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { downloadBatchPerformanceExport, downloadBatchSummaryExport, useBatchPerformance } from '../api'
import type { PerStudentStatus } from '../types'

const STUDENT_PAGE_SIZE = 20
const PICKER_PAGE_SIZE = 100
// Batches are class-sized cohorts (analytics.service.ts's own "Live query
// vs caching" comment) — one bounded fetch of every qualifying student's
// score is cheap enough to bucket into a histogram client-side, same
// MAX_PAGE_SIZE-for-a-full-snapshot precedent analytics.service.ts's own
// getFailedStudents already established server-side.
const HISTOGRAM_PAGE_SIZE = 100
const HISTOGRAM_BIN_COUNT = 5

// Validated colorblind-safe pair (dataviz skill's validate_palette.js,
// light mode, both checks pass — CVD separation and contrast vs surface).
const PASS_COLOR = '#16a34a'
const FAIL_COLOR = '#dc2626'
// Single series (a count-per-bucket histogram), not a categorical
// comparison — dataviz skill's color-formula: one hue for a magnitude
// encoding, no legend needed for a lone series. Reuses the app's own
// brand-accent value (tailwind.config.js) rather than inventing a new
// color, matching CLAUDE1.md's "never invent brand colors" rule.
const HISTOGRAM_COLOR = '#4A44C4'

interface ScoreHistogramBucket {
  bucket: string
  count: number
}

// Bar chart, not a dedicated "histogram" component — Recharts has none;
// bucketing raw scores into fixed-width ranges and rendering counts via
// BarChart/Bar is the standard way to render a histogram with this
// library, which this codebase already uses everywhere else for charts
// (CLAUDE1.md: "Recharts — charts, used in reports/analytics and score
// breakdowns"). Buckets raw totalScore, not a normalized percentage —
// same convention analytics.service.ts's own scoreDistribution (min/max/
// median) already uses, since a pool-based section's frozen selections
// can give different attempts different total possible marks (see that
// file's module comment), so there is no single fixed 0–100 scale to
// normalize against that would stay meaningful across every attempt.
function buildScoreHistogram(scores: number[]): ScoreHistogramBucket[] {
  if (scores.length === 0) return []

  const min = Math.min(...scores)
  const max = Math.max(...scores)
  if (min === max) {
    return [{ bucket: min.toFixed(1), count: scores.length }]
  }

  const binWidth = (max - min) / HISTOGRAM_BIN_COUNT
  const bins = Array.from({ length: HISTOGRAM_BIN_COUNT }, (_, i) => ({
    rangeStart: min + i * binWidth,
    rangeEnd: min + (i + 1) * binWidth,
    count: 0,
  }))

  for (const score of scores) {
    // The max score would otherwise fall one bin past the end (each bin is
    // a half-open [start, end) range) — clamped into the last bin instead.
    const index = score >= max ? HISTOGRAM_BIN_COUNT - 1 : Math.floor((score - min) / binWidth)
    bins[index].count += 1
  }

  return bins.map((bin) => ({
    bucket: `${bin.rangeStart.toFixed(1)}–${bin.rangeEnd.toFixed(1)}`,
    count: bin.count,
  }))
}

const STATUS_LABELS: Record<PerStudentStatus, string> = {
  not_attempted: 'Not Attempted',
  in_progress: 'In Progress',
  pending_evaluation: 'Pending Evaluation',
  invalidated: 'Invalidated',
  passed: 'Passed',
  failed: 'Failed',
}

const STATUS_STYLES: Record<PerStudentStatus, string> = {
  passed: 'bg-green-600/10 text-green-700 dark:text-green-400',
  failed: 'bg-destructive/10 text-destructive',
  pending_evaluation: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  invalidated: 'bg-muted text-muted-foreground/60',
  in_progress: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  not_attempted: 'bg-muted text-muted-foreground',
}

function StatusBadge({ status }: { status: PerStudentStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-background p-3.5', CARD_GRADIENT)}>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-brand-primary">{value}</p>
    </div>
  )
}

// Staff-facing aggregate view — the batch-level counterpart to features/
// reports' student-own attempt history, not a replacement for it (that
// page stays self-service, per-student; this one never shows a single
// student's own history, only the batch as a whole). Reuses the
// Combobox + useBatches pattern BatchesEditor.tsx already established,
// rather than rebuilding a picker.
export default function BatchPerformancePage() {
  // Pre-fill from MyBatchesPage's "Assessment Participation" drill-down
  // (?batchId=&assessmentId=), which already knows both ids — same
  // query-param pre-fill shape as CreateQuestionPage's ?type=&difficulty=.
  // Falls back to manual Combobox selection (this page's original
  // behavior) when absent, e.g. this page opened directly from its own
  // nav link.
  const [searchParams] = useSearchParams()
  const [batchId, setBatchId] = useState<string | null>(() => searchParams.get('batchId'))
  const [assessmentId, setAssessmentId] = useState<string | null>(() => searchParams.get('assessmentId'))
  const [page, setPage] = useState(1)
  // Two independent downloads (BatchPerformancePage reports follow-up) —
  // separate loading flags so clicking one doesn't disable the other.
  const [isDownloadingResults, setIsDownloadingResults] = useState(false)
  const [isDownloadingSummary, setIsDownloadingSummary] = useState(false)

  // Root-cause fix (BatchPerformancePage reports follow-up) — this used to
  // gate the college picker on `user.activeCollegeId == null`, treating
  // that as a Super-Admin proxy. Confirmed against the real DB that it
  // isn't one: gomathi@gmail.com (a real faculty account) has exactly one
  // role assignment, but that assignment's OWN college_id is null (faculty
  // are trainers who travel between colleges — CLAUDE.md — so their
  // user_roles row was never tied to a single college to begin with), which
  // makes auth.service.ts's resolveActiveCollegeId return null for them
  // too, not only for a genuine Super Admin grant. analytics.service.ts's
  // own assertCanAccessBatch comment documents fixing this EXACT heuristic
  // bug once already, backend-side; this page had the same bug in its
  // frontend picker gate. With the old gate, Faculty fell into the
  // Super-Admin branch, fired useColleges below, and hit a real 403
  // (colleges.view is granted to super_admin only — organization.routes.ts)
  // — the reported "Failed to load colleges".
  //
  // Fixed to the same real-role check BatchesEditor.tsx already
  // established for the identical picker-split problem: `user.roles`
  // (from the JWT, `roles: string[]`) is checked directly for the
  // 'super_admin' slug, never inferred from activeCollegeId. Faculty now
  // gets a single dropdown over their own assigned batches (GET
  // /batches/mine, self-scoped, no colleges.view needed) instead of the
  // college-then-batch picker — Super Admin's flow is untouched.
  const user = useAuthStore((state) => state.user)
  const isSuperAdmin = user?.roles.includes('super_admin') ?? false

  const [pickedCollegeId, setPickedCollegeId] = useState<string | null>(null)
  const colleges = useColleges({ page: 1, pageSize: PICKER_PAGE_SIZE }, { enabled: isSuperAdmin })
  const collegeOptions = (colleges.data?.items ?? []).map((college) => ({
    value: college.id,
    label: college.name,
  }))

  const adminBatches = useBatches(
    { collegeId: pickedCollegeId ?? '', page: 1, pageSize: PICKER_PAGE_SIZE },
    { enabled: isSuperAdmin && pickedCollegeId !== null },
  )
  const myBatches = useMyBatches(
    { page: 1, pageSize: PICKER_PAGE_SIZE },
    { enabled: !isSuperAdmin },
  )
  // Whichever source is actually active for this caller's role — the rest
  // of this component reads from these instead of branching on
  // isSuperAdmin a second time, same shape as BatchesEditor.tsx's
  // availableBatches/isBatchListPending/isBatchListError.
  const availableBatches = isSuperAdmin ? (adminBatches.data?.items ?? []) : (myBatches.data?.items ?? [])
  const isBatchListPending = isSuperAdmin ? adminBatches.isPending : myBatches.isPending
  const isBatchListError = isSuperAdmin ? adminBatches.isError : myBatches.isError

  // Unfiltered, same "unscoped discovery" precedent as the trainingSessionId
  // dropdown and the question/pool/batch pickers — GET /assessments has no
  // batchId filter to narrow this by (confirmed against the real schema).
  const assessments = useAssessments({ page: 1, pageSize: PICKER_PAGE_SIZE })

  const performance = useBatchPerformance(batchId ?? undefined, {
    assessmentId: assessmentId ?? undefined,
    page,
    pageSize: STUDENT_PAGE_SIZE,
  })

  // Separate full-snapshot fetch for the histogram below — independent of
  // the paginated table's own `page` state (a stable page:1/pageSize:100
  // request, not re-fetched on every table page click), same "a second
  // full-batch call for a different purpose" precedent analytics.
  // service.ts's getFailedStudents/getTrainerPerformanceTrend already
  // established server-side for reusing getBatchPerformance.
  const histogramSource = useBatchPerformance(batchId ?? undefined, {
    assessmentId: assessmentId ?? undefined,
    page: 1,
    pageSize: HISTOGRAM_PAGE_SIZE,
  })
  const histogramData = buildScoreHistogram(
    (histogramSource.data?.students ?? [])
      .filter((student) => student.status === 'passed' || student.status === 'failed')
      .map((student) => Number(student.totalScore)),
  )

  const batchOptions = availableBatches.map((batch) => ({
    value: batch.id,
    label: batch.name,
  }))
  const assessmentOptions = [
    { value: '', label: 'Most recent assessment (default)' },
    ...(assessments.data?.items ?? []).map((assessment) => ({
      value: assessment.id,
      label: assessment.title,
    })),
  ]

  const totalPages = performance.data
    ? Math.max(1, Math.ceil(performance.data.totalStudents / performance.data.pageSize))
    : 1

  const chartData =
    performance.data?.passRate !== null && performance.data?.passRate !== undefined
      ? [
          { name: 'Passed', value: performance.data.passRate },
          { name: 'Failed', value: 1 - performance.data.passRate },
        ]
      : null

  const isNoAttemptsYet =
    performance.isError &&
    performance.error instanceof ApiError &&
    performance.error.code === 'NOT_FOUND'

  // Two separate downloads, not one combined file (BatchPerformancePage
  // reports follow-up) — (a) the selected assessment's full per-student
  // results and (b) an aggregate row per assessment across the whole
  // batch are genuinely different shapes, same "don't merge two different
  // tables into one export" call as the backend side (see
  // analytics.service.ts's own comment on these two functions).
  async function handleDownloadResults() {
    if (!batchId) return
    setIsDownloadingResults(true)
    try {
      await downloadBatchPerformanceExport(batchId, assessmentId ?? undefined)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export results.')
    } finally {
      setIsDownloadingResults(false)
    }
  }

  async function handleDownloadSummary() {
    if (!batchId) return
    setIsDownloadingSummary(true)
    try {
      await downloadBatchSummaryExport(batchId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export batch summary.')
    } finally {
      setIsDownloadingSummary(false)
    }
  }

  return (
    <div className="p-5">
      <div className="mb-4">
        <h1 className="font-heading text-xl font-semibold text-brand-primary">Batch Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aggregate results for a batch on one assessment — average score, pass rate, and
          per-student outcomes.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Only Super Admin ever sees this — Faculty gets a single
              dropdown over their own assigned batches below instead (see
              this component's own root-cause-fix comment above). */}
          {isSuperAdmin && (
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-brand-primary" htmlFor="collegePicker">
                College
              </label>
              <Combobox
                id="collegePicker"
                options={collegeOptions}
                value={pickedCollegeId}
                onSelect={(value) => {
                  setPickedCollegeId(value)
                  setBatchId(null)
                }}
                placeholder="Select a college to browse its batches…"
                isLoading={colleges.isPending}
                isError={colleges.isError}
                errorMessage="Failed to load colleges."
              />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-brand-primary" htmlFor="batchPicker">
              Batch
            </label>
            <Combobox
              id="batchPicker"
              options={batchOptions}
              value={batchId}
              onSelect={(value) => {
                setBatchId(value)
                setPage(1)
              }}
              placeholder={
                isSuperAdmin
                  ? pickedCollegeId
                    ? 'Search batches by name…'
                    : 'Select a college first'
                  : 'Search your assigned batches…'
              }
              disabled={isSuperAdmin && pickedCollegeId === null}
              isLoading={isBatchListPending}
              isError={isBatchListError}
              errorMessage={
                isSuperAdmin ? 'Failed to load batches.' : 'Failed to load your assigned batches.'
              }
              emptyMessage={
                isSuperAdmin && pickedCollegeId === null
                  ? 'Select a college first.'
                  : isBatchListPending
                    ? 'Loading…'
                    : isSuperAdmin
                      ? 'No batches found.'
                      : 'You have no assigned batches yet — contact an admin to get assigned to one.'
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-brand-primary" htmlFor="assessmentPicker">
              Assessment <span className="text-muted-foreground">(optional)</span>
            </label>
            <Combobox
              id="assessmentPicker"
              options={assessmentOptions}
              value={assessmentId ?? ''}
              onSelect={(value) => {
                setAssessmentId(value || null)
                setPage(1)
              }}
              placeholder="Most recent assessment (default)"
              isLoading={assessments.isPending}
              isError={assessments.isError}
              errorMessage="Failed to load assessments."
              emptyMessage={assessments.isPending ? 'Loading…' : 'No assessments found.'}
            />
          </div>
        </div>
      </div>

      {!batchId && (
        <p className="mt-4 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Select a batch above to view its performance.
        </p>
      )}

      {batchId && performance.isPending && (
        <div className="mt-4 space-y-2" role="status" aria-label="Loading batch performance">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {batchId && performance.isError && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {isNoAttemptsYet
            ? 'This batch has no attempts on any assessment yet.'
            : performance.error instanceof ApiError
              ? performance.error.message
              : 'Failed to load batch performance. Please try again.'}
        </div>
      )}

      {batchId && performance.data && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {performance.data.assessmentTitle}
              </h2>
              {/* Two separate reports — see handleDownloadResults/
                  handleDownloadSummary above for why these aren't combined
                  into one file. */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                  disabled={isDownloadingResults}
                  onClick={() => void handleDownloadResults()}
                >
                  {isDownloadingResults ? 'Downloading…' : 'Download Results (CSV)'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                  disabled={isDownloadingSummary}
                  onClick={() => void handleDownloadSummary()}
                >
                  {isDownloadingSummary ? 'Downloading…' : 'Download Batch Summary (CSV)'}
                </Button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                label="Average Score"
                value={performance.data.averageScore ?? '—'}
              />
              <StatTile
                label="Pass Rate"
                value={
                  performance.data.passRate !== null
                    ? `${Math.round(performance.data.passRate * 100)}%`
                    : '—'
                }
              />
              <StatTile
                label="Attempted / Total"
                value={`${performance.data.studentsAttempted} / ${performance.data.totalStudents}`}
              />
              <StatTile
                label="Score Range (min · median · max)"
                value={
                  performance.data.scoreDistribution.min !== null
                    ? `${performance.data.scoreDistribution.min} · ${performance.data.scoreDistribution.median} · ${performance.data.scoreDistribution.max}`
                    : '—'
                }
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
            <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Pass / Fail
            </h3>
            {chartData ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    label={({ value }: { value: number }) => `${Math.round(value * 100)}%`}
                  >
                    <Cell fill={PASS_COLOR} />
                    <Cell fill={FAIL_COLOR} />
                  </Pie>
                  <Legend />
                  <Tooltip formatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="mt-3 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No graded attempts yet for this assessment — the chart will appear once at least
                one student's attempt has been fully evaluated.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
            <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Score Distribution
            </h3>
            {histogramData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={histogramData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--muted)' }}
                    formatter={(value) => [`${value} student${value === 1 ? '' : 's'}`, 'Count']}
                  />
                  <Bar dataKey="count" fill={HISTOGRAM_COLOR} radius={[4, 4, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="mt-3 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No graded attempts yet for this assessment — the chart will appear once at least
                one student's attempt has been fully evaluated.
              </p>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performance.data.students.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      No students in this batch.
                    </TableCell>
                  </TableRow>
                ) : (
                  performance.data.students.map((student) => (
                    <TableRow key={student.studentId} className="hover:bg-muted/30">
                      <TableCell className="pl-4 font-medium text-brand-primary">
                        {student.fullName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.totalScore ?? '—'}
                      </TableCell>
                      <TableCell className="pr-4">
                        <StatusBadge status={student.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border bg-muted/10 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Page {performance.data.page} of {totalPages} &middot;{' '}
                {performance.data.totalStudents} student
                {performance.data.totalStudents === 1 ? '' : 's'}
                {performance.isFetching ? ' · refreshing…' : ''}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                  disabled={page <= 1 || performance.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                  disabled={page >= totalPages || performance.isFetching}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
