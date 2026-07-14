import { useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
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
import { useBatches } from '@/features/organization/api'
import { cn } from '@/lib/utils'
import { useBatchPerformance } from '../api'
import type { PerStudentStatus } from '../types'

const STUDENT_PAGE_SIZE = 20
const PICKER_PAGE_SIZE = 100

// Validated colorblind-safe pair (dataviz skill's validate_palette.js,
// light mode, both checks pass — CVD separation and contrast vs surface).
const PASS_COLOR = '#16a34a'
const FAIL_COLOR = '#dc2626'

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
    <div className="rounded-lg border border-border bg-background p-4">
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
  const [batchId, setBatchId] = useState<string | null>(null)
  const [assessmentId, setAssessmentId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const batches = useBatches({ page: 1, pageSize: PICKER_PAGE_SIZE })
  // Unfiltered, same "unscoped discovery" precedent as the trainingSessionId
  // dropdown and the question/pool/batch pickers — GET /assessments has no
  // batchId filter to narrow this by (confirmed against the real schema).
  const assessments = useAssessments({ page: 1, pageSize: PICKER_PAGE_SIZE })

  const performance = useBatchPerformance(batchId ?? undefined, {
    assessmentId: assessmentId ?? undefined,
    page,
    pageSize: STUDENT_PAGE_SIZE,
  })

  const batchOptions = (batches.data?.items ?? []).map((batch) => ({
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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-primary">Batch Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aggregate results for a batch on one assessment — average score, pass rate, and
          per-student outcomes.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              placeholder="Search batches by name…"
              isLoading={batches.isPending}
              isError={batches.isError}
              errorMessage="Failed to load batches."
              emptyMessage={batches.isPending ? 'Loading…' : 'No batches found.'}
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
        <p className="mt-6 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Select a batch above to view its performance.
        </p>
      )}

      {batchId && performance.isPending && (
        <div className="mt-6 space-y-2" role="status" aria-label="Loading batch performance">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {batchId && performance.isError && (
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {isNoAttemptsYet
            ? 'This batch has no attempts on any assessment yet.'
            : performance.error instanceof ApiError
              ? performance.error.message
              : 'Failed to load batch performance. Please try again.'}
        </div>
      )}

      {batchId && performance.data && (
        <div className="mt-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {performance.data.assessmentTitle}
            </h2>
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
