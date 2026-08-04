import { Printer, Target, Trophy } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/StatCard'
import { useLeaderboard, useMyAttemptDetail } from '../api'
import PerformanceAnalyticsSection from '../components/PerformanceAnalyticsSection'
import { TierBadge } from '../components/LeaderboardSection'

// Phase 4 (final) — the polished single-attempt performance report reached
// from StudentAssessmentsPage.tsx's "View Report" action (a completed
// assessment card now links HERE instead of straight to AttemptResultPage's
// per-question breakdown — see that page's own module comment for why this
// isn't a redundant second button). Every number on this page is reused
// from an endpoint that already exists and already serves this exact
// student's own data:
//   - attempt/score:      GET /reports/my-attempts/:attemptId (same
//                          sanitized shape AttemptResultPage.tsx already
//                          renders — no second, looser endpoint built here)
//   - batch rank/tier:    GET /reports/leaderboard (same self-scoped,
//                          batch-wide ranking LeaderboardSection.tsx uses —
//                          this IS the student's overall batch standing,
//                          not a per-assessment rank; no such narrower
//                          ranking exists anywhere in this codebase, so
//                          this page doesn't invent one)
//   - trend + delta:      PerformanceAnalyticsSection.tsx, reused via its
//                          new highlightAttemptId prop (Phase 4 addition)
//                          rather than a second chart implementation for
//                          the same GET /reports/my-attempts data shape
//
// "Download PDF" (this phase) is the browser's native print-to-PDF, not a
// generated file — confirmed no PDF-generation capability exists anywhere
// in this codebase (backend or frontend; no pdfkit/puppeteer/jspdf/
// react-pdf-style dependency, no existing pipeline) before choosing this
// approach: zero new dependencies, works in every major browser's print
// dialog via its own "Save as PDF" destination. The button's title
// attribute says so explicitly (see below) — it opens a dialog, not an
// instant download. Print styling is Tailwind's built-in `print:` variant
// throughout (no separate stylesheet, no new tooling): nav chrome
// (Sidebar.tsx, StudentLayout.tsx's header) and every interactive-only
// element on this page (both back-links, this button itself) hide via
// `print:hidden`; each card-like block gets `print:break-inside-avoid` so
// the browser's print engine doesn't split a card across a page boundary.
export default function AttemptReportPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const { data, isLoading, isError, error } = useMyAttemptDetail(attemptId)
  const leaderboard = useLeaderboard()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">Loading your report…</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : "Couldn't load your report. Please try again."}
        </p>
      </div>
    )
  }

  const { attempt } = data
  const selfEntry = leaderboard.data?.entries.find((entry) => entry.isSelf)

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6 print:max-w-none print:p-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/student/assessments" className="text-sm text-brand-accent hover:underline print:hidden">
            &larr; Back to Your Assessments
          </Link>
          <h1 className="mt-2 font-heading text-2xl font-semibold text-brand-primary">
            {attempt.assessmentTitle}
          </h1>
          <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Performance Report &middot; Attempt #{attempt.attemptNumber}
            {attempt.isRetake ? ' · Retake' : ''}
          </p>
        </div>

        {/* Native browser print, not a generated file — the title makes
            that explicit rather than reading like an instant download. */}
        {attempt.status === 'submitted' && (
          <Button
            variant="outline"
            className="print:hidden shrink-0 gap-1.5 border-brand-primary text-brand-primary hover:bg-brand-primary/5"
            onClick={() => window.print()}
            title={
              'Opens your browser’s print dialog — choose "Save as PDF" (or your OS printer of the same name) as the destination to download a PDF.'
            }
          >
            <Printer className="size-4" />
            Download PDF
          </Button>
        )}
      </div>

      {/* Same two non-final states AttemptResultPage.tsx already handles
          explicitly — a completed-tier card (attemptButtonState.ts's
          COMPLETED_TIER_STATUSES) can still be 'pending_evaluation' or
          'invalidated', neither of which has a real score to report on. */}
      {attempt.status === 'pending_evaluation' && (
        <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
          One or more coding questions haven&apos;t finished grading yet — your report will be
          available once evaluation completes.{' '}
          <Link
            to={`/student/attempts/${attemptId}/submitted`}
            className="text-brand-accent hover:underline print:hidden"
          >
            View what&apos;s graded so far &rarr;
          </Link>
        </div>
      )}

      {attempt.status === 'invalidated' && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          This attempt was invalidated (proctoring flag) and has no scored result to report.
        </div>
      )}

      {attempt.status === 'submitted' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:break-inside-avoid">
            <StatCard
              label="Score (%)"
              value={attempt.scorePercent !== null ? Math.round(attempt.scorePercent) : null}
              icon={Target}
              iconClassName="bg-brand-accent/10 text-brand-accent"
              className="print:shadow-none"
            />
            <StatCard
              label="Batch Rank"
              value={leaderboard.isPending ? undefined : (selfEntry?.rank ?? null)}
              icon={Trophy}
              iconClassName="bg-brand-primary/10 text-brand-primary"
              className="print:shadow-none"
            />
          </div>

          {/* Real, reused numbers that don't fit StatCard's single-number
              shape — the raw points score (scorePercent above is the
              comparable-across-assessments figure; this is the literal
              grade) and the same TierBadge LeaderboardSection.tsx renders
              for this student's row there. */}
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground print:break-inside-avoid">
            {attempt.totalScore !== null && <span>{attempt.totalScore} points scored</span>}
            {selfEntry && (
              <>
                <span>&middot;</span>
                <TierBadge tier={selfEntry.tier} />
                <span>batch tier</span>
              </>
            )}
          </p>

          {/* print:break-inside-avoid on the wrapper, not inside
              PerformanceAnalyticsSection itself — that component is shared
              with PerformancePage.tsx's dashboard usage, which has no print
              concerns of its own; the wrapper keeps this print-only styling
              scoped to where it's actually needed. */}
          <div className="print:break-inside-avoid">
            <PerformanceAnalyticsSection highlightAttemptId={attemptId} heading="Your Score Trend" />
          </div>
        </>
      )}

      <Link
        to={`/student/attempts/${attemptId}/submitted`}
        className="inline-block text-sm text-brand-accent hover:underline print:hidden"
      >
        View detailed question breakdown &rarr;
      </Link>
    </div>
  )
}
