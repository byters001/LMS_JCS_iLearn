import { HelpCircle, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { getInitials } from '@/components/UserAvatarMenu'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { AssessmentStatusBadge } from '../components/AssessmentStatusBadge'
import { useAssessments } from '../api'
import type { AssessmentListItem, TestCategory } from '../types'

const PAGE_SIZE = 20

const TEST_CATEGORY_LABELS: Record<TestCategory, string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
  mixed: 'Mixed',
}

// Card-grid phase — same visual/structural template as
// CollegeListPage.tsx's CollegeCard (avatar-initial badge, status badge,
// 2-column stat grid, bottom button row), applied here for the Trainer/
// Admin assessment list. Average score deliberately NOT shown per this
// phase's own scope (removed, not just omitted by oversight).
//
// Edit button visibility — the REAL backend rule (assertAssessmentEditable,
// assessments.service.ts): assessment CONTENT (sections/questions) can only
// be modified while status === 'draft'; every later status 409s on any
// content-mutating call. Batch assignment has its own, wider rule
// (assertBatchesEditable — editable through 'scheduled', locked only at
// live/completed/archived), but this card's "Edit" button opens the SAME
// AssessmentEditPage route as "View" (that page already self-adapts via its
// own isContentEditable check), so it's gated on the narrower content rule
// to avoid ever presenting an "Edit" affordance that opens a page with
// nothing actually editable on it.
function AssessmentCard({ assessment }: { assessment: AssessmentListItem }) {
  const isContentEditable = assessment.status === 'draft'

  return (
    <Card className="gap-2.5 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-semibold text-white">
            {getInitials(assessment.title)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-heading font-medium text-brand-primary">{assessment.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {TEST_CATEGORY_LABELS[assessment.testCategory]}
            </p>
          </div>
        </div>
        <AssessmentStatusBadge status={assessment.status} />
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2.5">
        <div className="flex items-center gap-2">
          <Users className="size-4 shrink-0 text-brand-primary" />
          <div className="min-w-0">
            <p className="font-heading text-sm leading-tight font-semibold text-foreground">
              {assessment.studentCount}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">students</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <HelpCircle className="size-4 shrink-0 text-brand-accent" />
          <div className="min-w-0">
            <p className="font-heading text-sm leading-tight font-semibold text-foreground">
              {assessment.questionCount}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">questions</p>
          </div>
        </div>
      </div>

      <div className="mt-auto flex gap-2 border-t border-border pt-3">
        <Button asChild variant="outline" size="sm" className="flex-1">
          <Link to={`${assessment.id}/edit`}>View</Link>
        </Button>
        {isContentEditable && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="flex-1 border-brand-primary text-brand-primary hover:bg-brand-primary/5"
          >
            <Link to={`${assessment.id}/edit`}>Edit</Link>
          </Button>
        )}
      </div>
    </Card>
  )
}

// Staff-facing assessment list at /trainer/assessments and
// /admin/assessments — card-grid phase, replacing the previous table (same
// data source, same useAssessments hook, same pagination). No filter
// controls (status/testCategory/trainingSessionId are supported by the
// backend and already typed in ListAssessmentsParams, just not exposed as
// UI yet) — same minimalism the previous table version already established.
export default function AssessmentListPage() {
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error, isFetching } = useAssessments({
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="p-4">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold text-brand-primary">Assessments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every assessment across the platform, at every stage of the approval workflow.
          </p>
        </div>
        <Button asChild className="bg-brand-accent text-white hover:bg-brand-accent/90">
          <Link to="new">Create Assessment</Link>
        </Button>
      </div>

      {isPending && (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          role="status"
          aria-label="Loading assessments"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
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

      {data && data.items.length === 0 && <EmptyState message="No assessments found." />}

      {data && data.items.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.items.map((assessment) => (
              <AssessmentCard key={assessment.id} assessment={assessment} />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-background px-3.5 py-2.5 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Page {data.page} of {totalPages} &middot; {data.total} assessment
              {data.total === 1 ? '' : 's'}
              {isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
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
