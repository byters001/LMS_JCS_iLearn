import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
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
import type { TestCategory } from '../types'

const PAGE_SIZE = 20

const TEST_CATEGORY_LABELS: Record<TestCategory, string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
  mixed: 'Mixed',
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// Staff-facing assessment list at /trainer/assessments and
// /admin/assessments — mirrors StudentListPage.tsx's exact pattern (api.ts
// hook -> paginated table -> brand styling). No filter controls
// (status/testCategory/trainingSessionId are supported by the backend and
// already typed in ListAssessmentsParams, just not exposed as UI yet) —
// same minimalism the students list already established. Each title links
// to AssessmentEditPage — the only way to reach an existing assessment's
// edit view once it's no longer the one you just created.
export default function AssessmentListPage() {
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error, isFetching } = useAssessments({
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-brand-primary">Assessments</h1>
          <p className="text-sm text-muted-foreground">
            Every assessment across the platform, at every stage of the approval workflow.
          </p>
        </div>
        <Button asChild className="bg-brand-accent text-white hover:bg-brand-accent/90">
          <Link to="new">Create Assessment</Link>
        </Button>
      </div>

      {isPending && (
        <div className="space-y-2" role="status" aria-label="Loading assessments">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof ApiError
            ? error.message
            : 'Failed to load assessments. Please try again.'}
        </div>
      )}

      {data && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timer</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No assessments found.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((assessment) => (
                  <TableRow key={assessment.id}>
                    <TableCell className="font-medium">
                      <Link
                        to={`${assessment.id}/edit`}
                        className="text-brand-primary hover:underline"
                      >
                        {assessment.title}
                      </Link>
                    </TableCell>
                    <TableCell>{TEST_CATEGORY_LABELS[assessment.testCategory]}</TableCell>
                    <TableCell>
                      <AssessmentStatusBadge status={assessment.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {assessment.timerMinutes ? `${assessment.timerMinutes} min` : 'No time limit'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(assessment.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {data.page} of {totalPages} &middot; {data.total} assessment
              {data.total === 1 ? '' : 's'}
              {isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
