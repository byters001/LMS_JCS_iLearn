import { Clock, Lock } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { CARD_GRADIENT, cn } from '@/lib/utils'
import { useAvailableAssessments } from '../api'
import { ATTEMPT_BUTTON_LABELS, getAttemptButtonState } from '../attemptButtonState'
import type { Assessment, AvailableAssessment } from '../types'

const PAGE_SIZE = 12

const TEST_CATEGORY_LABELS: Record<Assessment['testCategory'], string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
  mixed: 'Mixed',
}

// Parchment & Emerald rollout — was a hand-rolled bg-brand-accent/
// border-brand-primary pair that predates the shared Badge variant system;
// StudentDashboardPage already established 'live'/'scheduled' as the right
// variants for this exact meaning (status-success-bg/accent-indigo-bg,
// both scoped to Parchment & Emerald automatically), so this just adopts
// them instead of carrying its own separately-themed copy.
function StatusBadge({ status }: { status: Assessment['status'] }) {
  if (status === 'live') return <Badge variant="live">Live</Badge>
  if (status === 'scheduled') return <Badge variant="scheduled">Scheduled</Badge>
  return <Badge variant="secondary">{status}</Badge>
}

function formatStartDate(startAt: string | null): string | null {
  if (!startAt) return null
  return new Date(startAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// Button-state phase — label + the card's own link target both derive from
// the SAME getAttemptButtonState()/ATTEMPT_BUTTON_LABELS this feature's
// AssessmentDetailPage.tsx button also uses, so the two surfaces can never
// disagree about whether a given assessment is Start/Continue/Retake/
// Completed. A completed (locked, no retake left) assessment's card links
// straight to the polished report page (Phase 4, final — was the bare
// per-question results page before) instead of the detail page — there's
// nothing left to "view details" toward starting.
function AssessmentCard({ assessment }: { assessment: AvailableAssessment }) {
  const durationLabel = assessment.timerMinutes ? `${assessment.timerMinutes} min` : 'No time limit'
  const buttonState = getAttemptButtonState(assessment)

  // Item 2 fix — genuinely locked, not a dimmer version of the same
  // clickable card: rendered as a plain <div>, not a <Link>, since there's
  // nothing to navigate to yet (the old behavior linked through to
  // AssessmentDetailPage's own disabled "Start Test" button, which is what
  // made this read as "identical to a live one" — same blue button, same
  // label, only a subtle opacity difference). No hover/translate/shadow
  // treatment either, on top of the grayscale+opacity — a locked card
  // shouldn't invite the same "hover to see it lift" affordance a real
  // clickable card gets.
  if (buttonState.kind === 'scheduled') {
    const startDate = formatStartDate(buttonState.startAt)
    return (
      <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5 opacity-60 shadow-sm grayscale-[0.4]">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading font-semibold text-foreground">{assessment.title}</h3>
          <StatusBadge status={assessment.status} />
        </div>

        {assessment.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{assessment.description}</p>
        )}

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          <span>{durationLabel}</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{TEST_CATEGORY_LABELS[assessment.testCategory]}</Badge>
          <Badge variant="outline">
            {assessment.maxAttempts} attempt{assessment.maxAttempts === 1 ? '' : 's'}
          </Badge>
        </div>

        <span className="mt-1 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/40 text-sm font-medium text-muted-foreground">
          <Lock className="size-3.5" />
          {startDate ? `Opens ${startDate}` : 'Not open yet'}
        </span>
      </div>
    )
  }

  const linkTo =
    buttonState.kind === 'completed'
      ? `/student/attempts/${buttonState.resultsAttemptId}/report`
      : `/student/assessments/${assessment.id}`

  return (
    <Link
      to={linkTo}
      className={cn(
        'group flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-shell-accent/50 hover:shadow-md focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-accent focus-visible:ring-offset-2',
        CARD_GRADIENT,
        'from-primary/8',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-heading font-semibold text-foreground">{assessment.title}</h3>
        <StatusBadge status={assessment.status} />
      </div>

      {assessment.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{assessment.description}</p>
      )}

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" />
        <span>{durationLabel}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{TEST_CATEGORY_LABELS[assessment.testCategory]}</Badge>
        <Badge variant="outline">
          {assessment.maxAttempts} attempt{assessment.maxAttempts === 1 ? '' : 's'}
        </Badge>
      </div>

      {/* Item 1 fix — "completed" gets a distinct muted/outline treatment
          instead of the same solid CTA color every clickable action state
          uses, so it reads at a glance as "done", not "here's another thing
          to click." Still a real link to the results page — only the
          styling branches, not the behavior. Uses the plain default Button
          variant's own bg-primary/text-primary-foreground (token-driven,
          same pairing AssessmentDetailPage.tsx's Start/Continue/Retake
          button uses) rather than a dead per-role student-accent color. */}
      <span
        className={cn(
          buttonVariants({ variant: buttonState.kind === 'completed' ? 'outline' : 'default' }),
          'mt-1 h-9 w-full',
          buttonState.kind === 'completed' &&
            'border-muted-foreground/30 text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {ATTEMPT_BUTTON_LABELS[buttonState.kind]}
      </span>
    </Link>
  )
}

// Structural rollout — this page's job is browsing (a full-batch grid of
// assessments), not reporting a personal standing, so it does NOT get a
// dashboard-style hero/ring: there's no genuine "hero number" here (the
// only candidate stats — X live/Y scheduled/Z completed — would need a
// server-side count across every page, not just the current PAGE_SIZE=12
// page this endpoint returns; adding that aggregate is real backend work
// this phase's "structure only" scope excludes). The one deliberate
// grid-break IS applied, though: the single most-actionable assessment on
// page 1 (already in progress, or live and not yet started) gets pulled out
// into a wider "Up Next" card above the uniform grid — derived entirely
// from data already on the page, no new fetch. Only on page 1: a "most
// urgent" card on page 2+ would have no real meaning (nothing says page 2's
// items are less urgent than page 1's — the list isn't sorted by urgency),
// so this stays a page-1-only affordance rather than a misleading one on
// every page.
const FEATURED_KIND_PRIORITY: Partial<Record<ReturnType<typeof getAttemptButtonState>['kind'], number>> = {
  continue: 0,
  start: 1,
  retake: 2,
}

function pickFeatured(items: AvailableAssessment[]): AvailableAssessment | undefined {
  return [...items]
    .filter((a) => getAttemptButtonState(a).kind in FEATURED_KIND_PRIORITY)
    .sort(
      (a, b) =>
        FEATURED_KIND_PRIORITY[getAttemptButtonState(a).kind]! -
        FEATURED_KIND_PRIORITY[getAttemptButtonState(b).kind]!,
    )[0]
}

function FeaturedAssessmentCard({ assessment }: { assessment: AvailableAssessment }) {
  const durationLabel = assessment.timerMinutes ? `${assessment.timerMinutes} min` : 'No time limit'
  const buttonState = getAttemptButtonState(assessment)

  return (
    <Link
      to={`/student/assessments/${assessment.id}`}
      className="group mb-2.5 flex items-center justify-between gap-4 rounded-xl border border-border border-l-4 border-l-primary bg-card p-3.5 shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-accent focus-visible:ring-offset-2"
    >
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-semibold tracking-widest text-primary uppercase">
          Up next
        </p>
        <h3 className="mt-0.5 truncate font-heading text-lg font-semibold text-foreground">{assessment.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="secondary">{TEST_CATEGORY_LABELS[assessment.testCategory]}</Badge>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {durationLabel}
          </span>
        </div>
      </div>
      <span className={cn(buttonVariants({ variant: 'default' }), 'h-9 shrink-0 px-4')}>
        {ATTEMPT_BUTTON_LABELS[buttonState.kind]}
      </span>
    </Link>
  )
}

export default function StudentAssessmentsPage() {
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error, isFetching } = useAvailableAssessments({
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const featured = data && page === 1 ? pickFeatured(data.items) : undefined
  const gridItems = data ? (featured ? data.items.filter((a) => a.id !== featured.id) : data.items) : []

  return (
    <div className="p-4">
      <div className="mb-3">
        <h1 className="font-heading text-xl font-semibold text-primary">Your Assessments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live and upcoming assessments for your batch.
        </p>
      </div>

      {isPending && (
        <div
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-label="Loading assessments"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
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

      {data && (
        <>
          {data.items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No assessments available right now.
            </div>
          ) : (
            <>
              {featured && <FeaturedAssessmentCard assessment={featured} />}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {gridItems.map((assessment) => (
                  <AssessmentCard key={assessment.id} assessment={assessment} />
                ))}
              </div>
            </>
          )}

          {data.total > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {totalPages} &middot; {data.total} assessment
                {data.total === 1 ? '' : 's'}
                {isFetching ? ' · refreshing…' : ''}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-primary text-primary hover:bg-primary/5"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-primary text-primary hover:bg-primary/5"
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
