import { ChevronDown, Clock, Lock, ShieldX } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/ui/PageHeader'
import { CARD_GRADIENT, CARD_HOVER_LIFT, cn } from '@/lib/utils'
import { useAvailableAssessments } from '../api'
import { ATTEMPT_BUTTON_COLOR_CLASSES, ATTEMPT_BUTTON_LABELS, getAttemptButtonState } from '../attemptButtonState'
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
      <div className="flex flex-col gap-2.5 rounded-3xl bg-card p-3.5 opacity-60 shadow-sm grayscale-[0.4]">
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

  // Item 4 fix (the endAt gap) — the window closed and the student never
  // reached a completed-tier attempt, so there's nothing to start, resume,
  // or view a report for. Same "not a Link" treatment as the scheduled
  // branch above (there's nowhere real to navigate), just red instead of
  // the neutral grayscale lock — this genuinely is a bad outcome for the
  // student, not merely "not open yet".
  if (buttonState.kind === 'missed') {
    return (
      <div className="flex flex-col gap-2.5 rounded-3xl bg-card p-3.5 opacity-75 shadow-sm">
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

        <span
          className={cn(
            'mt-1 flex h-9 w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg',
            ATTEMPT_BUTTON_COLOR_CLASSES.missed,
          )}
        >
          <ShieldX className="size-3.5" />
          {ATTEMPT_BUTTON_LABELS.missed}
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
        'group flex flex-col gap-2.5 rounded-3xl bg-card p-3.5 shadow-sm focus-visible:-translate-y-1 focus-visible:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-accent focus-visible:ring-offset-2',
        CARD_GRADIENT,
        CARD_HOVER_LIFT,
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
          styling branches, not the behavior.
          Item 2 fix — every other kind now gets its own explicit color from
          ATTEMPT_BUTTON_COLOR_CLASSES (green start/continue, blue retake)
          instead of buttonVariants({ variant: 'default' })'s bg-primary,
          which resolved to the app's orange --primary regardless of what
          the action actually meant. */}
      <span
        className={cn(
          buttonVariants({ variant: buttonState.kind === 'completed' ? 'outline' : 'default' }),
          'mt-1 h-9 w-full',
          buttonState.kind === 'completed'
            ? 'border-muted-foreground/30 text-muted-foreground hover:bg-muted hover:text-foreground'
            : ATTEMPT_BUTTON_COLOR_CLASSES[buttonState.kind],
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
      className={cn(
        'group mb-2.5 flex items-center justify-between gap-4 rounded-3xl border-l-4 border-l-primary bg-card p-3.5 shadow-sm focus-visible:-translate-y-1 focus-visible:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-accent focus-visible:ring-offset-2',
        CARD_HOVER_LIFT,
      )}
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
      {/* buttonState.kind here is always continue/start/retake — the only
          kinds FEATURED_KIND_PRIORITY admits — so ATTEMPT_BUTTON_COLOR_CLASSES
          always has an entry; same green/blue recolor as AssessmentCard's own
          CTA above, from the same shared map so the two can't disagree. */}
      <span className={cn(buttonVariants({ variant: 'default' }), 'h-9 shrink-0 px-4', ATTEMPT_BUTTON_COLOR_CLASSES[buttonState.kind])}>
        {ATTEMPT_BUTTON_LABELS[buttonState.kind]}
      </span>
    </Link>
  )
}

// Item 4 — status filter. "Live" deliberately covers both 'start' (live,
// never attempted) and 'continue' (in progress) — the task's own wording
// for this filter, and the two states a student would call "something I can
// go do right now." 'retake' gets its own "Re-attempt" label rather than
// reusing "Live" — a retake is still live, but conflating it with a
// never-attempted assessment would make the filter useless for "show me
// just the ones I haven't touched yet" vs. "show me the ones I get to redo."
const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'missed', label: 'Missed' },
  { value: 'retake', label: 'Re-attempt' },
] as const

type StatusFilterValue = (typeof STATUS_FILTER_OPTIONS)[number]['value']

function matchesStatusFilter(assessment: AvailableAssessment, filter: StatusFilterValue): boolean {
  if (filter === 'all') return true
  const kind = getAttemptButtonState(assessment).kind
  if (filter === 'live') return kind === 'start' || kind === 'continue'
  return kind === filter
}

function StatusFilterDropdown({
  value,
  onChange,
}: {
  value: StatusFilterValue
  onChange: (value: StatusFilterValue) => void
}) {
  const selectedLabel = STATUS_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? 'All'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          {selectedLabel}
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as StatusFilterValue)}>
          {STATUS_FILTER_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function StudentAssessmentsPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all')
  const { data, isPending, isError, error, isFetching } = useAvailableAssessments({
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  // Client-side only, and only over data.items — the CURRENT server page
  // (PAGE_SIZE = 12), not the full backend result set. A student with, say,
  // a missed assessment sitting on page 2 won't see it here while browsing
  // page 1 with the "Missed" filter selected; the "Page X of Y" count below
  // still reflects the unfiltered server page too. A real full-dataset
  // filter would need a status/kind query param added to GET
  // /assessments/available (server-side, since "missed"/"retake" aren't raw
  // DB columns — they're this same derived getAttemptButtonState logic) —
  // out of scope here, flagged rather than silently presented as complete.
  const filteredItems = data ? data.items.filter((a) => matchesStatusFilter(a, statusFilter)) : []
  const featured = filteredItems.length > 0 && page === 1 ? pickFeatured(filteredItems) : undefined
  const gridItems = featured ? filteredItems.filter((a) => a.id !== featured.id) : filteredItems

  return (
    <div className="p-4">
      <div className="mb-3">
        <PageHeader
          title="Your Assessments"
          description="Live and upcoming assessments for your batch."
          actions={<StatusFilterDropdown value={statusFilter} onChange={setStatusFilter} />}
        />
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
          ) : filteredItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No assessments on this page match that filter.
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
