import { ClipboardList, HelpCircle, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AssessmentStatusBadge } from '../components/AssessmentStatusBadge'
import { useAssessments } from '../api'
import type { AssessmentStatus, TestCategory } from '../types'

const PAGE_SIZE = 20

const TEST_CATEGORY_LABELS: Record<TestCategory, string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
  mixed: 'Mixed',
}

const STATUS_FILTER_OPTIONS: Array<{ value: AssessmentStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'live', label: 'Live' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
]

const CATEGORY_FILTER_OPTIONS: Array<{ value: TestCategory | ''; label: string }> = [
  { value: '', label: 'All categories' },
  { value: 'mcq', label: 'MCQ' },
  { value: 'coding', label: 'Coding' },
  { value: 'psychometric', label: 'Psychometric' },
  { value: 'mixed', label: 'Mixed' },
]

const filterSelectClassName =
  'h-8 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

// Staff-facing assessment list at /trainer/assessments and
// /admin/assessments — a dense, server-filtered table (status/testCategory
// both real ListAssessmentsParams the backend already supports; search
// stays owned by GlobalSearch per api.ts's own comment, not duplicated
// here). Same useAssessments hook/pagination as before the redesign, only
// the row/column layout changed from a card grid to a table.
export default function AssessmentListPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<AssessmentStatus | ''>('')
  const [testCategory, setTestCategory] = useState<TestCategory | ''>('')

  const { data, isPending, isError, error, isFetching } = useAssessments({
    page,
    pageSize: PAGE_SIZE,
    status: status || undefined,
    testCategory: testCategory || undefined,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Assessments"
        description="Every assessment across the platform, at every stage of the approval workflow."
        actions={
          <Button asChild>
            <Link to="new">Create Assessment</Link>
          </Button>
        }
      >
        <StatCard
          label={status || testCategory ? 'Matching assessments' : 'Total assessments'}
          value={data?.total}
          icon={ClipboardList}
          accent="indigo"
          className="max-w-64"
        />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter by status"
          className={filterSelectClassName}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as AssessmentStatus | '')
            setPage(1)
          }}
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by category"
          className={filterSelectClassName}
          value={testCategory}
          onChange={(event) => {
            setTestCategory(event.target.value as TestCategory | '')
            setPage(1)
          }}
        >
          {CATEGORY_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {isFetching && !isPending && (
          <span className="text-xs text-muted-foreground">Refreshing…</span>
        )}
      </div>

      {isPending && (
        <div className="space-y-1.5" role="status" aria-label="Loading assessments">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
          {error instanceof ApiError
            ? error.message
            : 'Failed to load assessments. Please try again.'}
        </div>
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          message={
            status || testCategory
              ? 'No assessments match these filters.'
              : 'No assessments found.'
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Batches</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((assessment) => {
                  const isContentEditable = assessment.status === 'draft'
                  return (
                    <TableRow key={assessment.id}>
                      <TableCell className="max-w-64">
                        <p className="truncate font-medium text-foreground">{assessment.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {TEST_CATEGORY_LABELS[assessment.testCategory]}
                        </p>
                      </TableCell>
                      <TableCell>
                        <AssessmentStatusBadge status={assessment.status} />
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Users className="size-3.5" />
                          {assessment.studentCount}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <HelpCircle className="size-3.5" />
                          {assessment.questionCount}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-40">
                        {assessment.batches.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="truncate text-muted-foreground">
                            {assessment.batches.map((batch) => batch.name).join(', ')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(assessment.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button asChild variant="outline" size="sm">
                            <Link to={`${assessment.id}/edit`}>View</Link>
                          </Button>
                          {isContentEditable && (
                            <Button asChild size="sm">
                              <Link to={`${assessment.id}/edit`}>Edit</Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>

          <Card className="flex-row items-center justify-between px-3.5 py-2.5">
            <p className="text-sm text-muted-foreground">
              Page {data.page} of {totalPages} &middot; {data.total} assessment
              {data.total === 1 ? '' : 's'}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
