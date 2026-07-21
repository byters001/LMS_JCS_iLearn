import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import type { ListAvailableAssessmentsResponse } from '@/features/assessments/types'
import {
  exitFullscreen,
  FULLSCREEN_CHANGE_EVENTS,
  isFullscreenActive,
  requestFullscreen,
} from '@/lib/fullscreen'
import { useAttempt, useAttemptQuestions, useSubmitAttempt } from '../api'
import { AttemptTimer } from '../components/AttemptTimer'
import { CameraPreview } from '../components/CameraPreview'
import { CodingQuestion } from '../components/CodingQuestion'
import { McqQuestion } from '../components/McqQuestion'
import { PsychometricQuestion } from '../components/PsychometricQuestion'
import { QuestionNavigator } from '../components/QuestionNavigator'
import { SectionPickerMenu } from '../components/SectionPickerMenu'
import { SubmitAttemptButton } from '../components/SubmitAttemptButton'
import type { AttemptQuestion } from '../types'

// Item 4 — same pattern as features/assessments/pages/AssessmentDetailPage.tsx's
// describeStartAttemptError: read the real ApiError.code/.message instead of
// collapsing every failure (attempt not found, not yours, not a student, a
// genuine network/500) into one identical string. NOT_FOUND/FORBIDDEN get a
// student-facing rewording of the backend's own message (which is written
// for a developer reading a response body, not a student mid-assessment);
// every other code falls through to the backend's own message as-is, same
// "it's already specific and safe to show" call the sibling function makes.
function describeAttemptLoadError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Couldn't load this attempt. Please refresh, or contact your trainer if this persists."
  }
  if (error.code === 'NOT_FOUND') {
    return "This attempt couldn't be found — it may have been removed. Contact your trainer if this persists."
  }
  if (error.code === 'FORBIDDEN') {
    return "You don't have access to this attempt — contact your trainer if you believe this is a mistake."
  }
  return error.message
}

// Lockdown (this phase) — three distinct triggers land on the same shared
// autoSubmit() below, this is purely which reason-specific copy the takeover
// overlay shows.
type AutoSubmitReason = 'timer' | 'fullscreen-exit' | 'tab-switch'

// Layout item 3 (section switcher) — GET /attempts/:attemptId/questions
// (features/attempts/api.ts's useAttemptQuestions) already returns every
// question flagged with its own real assessmentSectionId (see types.ts's
// AttemptQuestionBase — confirmed directly against the backend's
// FrozenAttemptQuestion/AttemptQuestionContent shapes and
// attempts.repository.ts's listFrozenQuestions, not assumed). That backend
// query orders rows by `assessment_sections.section_order` first and the
// question's own sort_order second, so the FLAT array's own order already
// reflects correct section sequence — grouping by first-occurrence of each
// assessmentSectionId, in array order, needs no client-side re-sort. No new
// backend endpoint was needed or added.
//
// Header-title phase — the response now also carries each question's real
// sectionTitle (a straightforward backend join addition, not a schema
// change — see attempts.repository.ts's listFrozenQuestions), so `title`
// below is the real section name, replacing the previous ordinal
// "Section 1"/"Section 2" placeholder this function used to synthesize.
//
// A plain function, not useMemo: this can only be called after the
// loading/error early returns below (questions isn't safely available
// before then), which a hook can't be — same treatment `answeredCount`'s
// .filter() below already gets, and just as cheap to recompute per render
// for a list this size.
function groupQuestionsBySections(
  questions: AttemptQuestion[],
): { sectionId: string; title: string; questionIndexes: number[] }[] {
  const indexesBySectionId = new Map<string, number[]>()
  const titleBySectionId = new Map<string, string>()
  const sectionIdsInOrder: string[] = []

  questions.forEach((question, index) => {
    const existing = indexesBySectionId.get(question.assessmentSectionId)
    if (existing) {
      existing.push(index)
    } else {
      indexesBySectionId.set(question.assessmentSectionId, [index])
      titleBySectionId.set(question.assessmentSectionId, question.sectionTitle)
      sectionIdsInOrder.push(question.assessmentSectionId)
    }
  })

  return sectionIdsInOrder.map((sectionId) => ({
    sectionId,
    title: titleBySectionId.get(sectionId) ?? '',
    questionIndexes: indexesBySectionId.get(sectionId) ?? [],
  }))
}

const AUTO_SUBMIT_COPY: Record<AutoSubmitReason, { title: string; description: string }> = {
  timer: {
    title: "Time's up",
    description: 'Submitting your attempt automatically. Please wait…',
  },
  'fullscreen-exit': {
    title: 'Fullscreen exited',
    description:
      'This assessment requires fullscreen — exiting it submits your attempt automatically. Please wait…',
  },
  'tab-switch': {
    title: 'Left the assessment tab',
    description:
      "Switching tabs or windows isn't allowed during this assessment — submitting your attempt automatically. Please wait…",
  },
}

// Part 3: real answer submission (per-question Save/Run-Submit, wired in
// McqQuestion/PsychometricQuestion/CodingQuestion) and final submit — both
// the manual "Submit Attempt" confirmation and every automatic-submit
// trigger (timer expiry, and now fullscreen-exit/tab-switch — lockdown item
// 2/3), which all land here on the same submitted-confirmation navigation.
export default function AttemptPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [currentIndex, setCurrentIndex] = useState(0)
  // Set the instant a trigger fires, before the auto-submit request even
  // resolves — this is what makes the takeover message appear immediately
  // and block further interaction, not just once the mutation finishes.
  const [isAutoSubmitting, setIsAutoSubmitting] = useState(false)
  const [autoSubmitReason, setAutoSubmitReason] = useState<AutoSubmitReason>('timer')
  // Lockdown item 1's honesty requirement: whether fullscreen is ACTUALLY
  // active right now, independent of whether it was requested. Lazy
  // initializer reads real DOM state on this component's first render —
  // accurate immediately, with no race, because SPA navigation from
  // AssessmentInstructionsPage never reloads the document, so whatever
  // fullscreen state that page's click handler entered (or failed to enter)
  // is still exactly the state here. See requiresFullscreenLockdown below
  // for when this is actually surfaced to the student.
  const [isLockdownActive, setIsLockdownActive] = useState(() => isFullscreenActive())

  const attemptQuery = useAttempt(attemptId)
  const questionsQuery = useAttemptQuestions(attemptId)
  const submitAttempt = useSubmitAttempt(attemptId ?? '')

  // De-dupe mechanism: ONE boolean ref, matching AttemptTimer's own
  // hasFiredRef pattern exactly (checked-and-set atomically at the top of
  // the function that fires — a ref because React state updates aren't
  // synchronous enough to survive two triggers landing in the same tick).
  // This single ref closes two distinct duplicate-trigger risks:
  //   1. Two lockdown triggers firing close together (e.g. the timer hits
  //      zero the same instant the student alt-tabs away) — only the FIRST
  //      call to autoSubmit() below does anything; every later call,
  //      regardless of which trigger, is a no-op.
  //   2. This component's OWN exitFullscreen() call in goToSubmittedPage
  //      (item 4) asynchronously firing a real fullscreenchange event before
  //      the route swap unmounts this component and its listeners. Without
  //      this guard, exiting fullscreen after a SUCCESSFUL submit would look
  //      identical to the student exiting it themselves and could re-trigger
  //      auto-submit on an attempt that's already been submitted.
  //      goToSubmittedPage sets this ref before calling exitFullscreen, on
  //      BOTH the manual-submit and auto-submit paths, closing this race
  //      regardless of exact event timing.
  const hasFiredRef = useRef(false)

  // There is no student-scoped GET /assessments/:id (assessments.routes.ts's
  // GET /assessments/:id is staff-only, ASSESSMENTS_MANAGE-gated) — same gap
  // AssessmentDetailPage.tsx already works around by reading whatever
  // available-assessments list page is already cached in TanStack Query,
  // rather than this phase inventing a new backend endpoint just for
  // timerMinutes (and now proctoringFullscreenRequired too). A direct URL
  // visit/hard refresh with an empty cache means no timer displays and
  // lockdown is NOT armed (see requiresFullscreenLockdown below) — not an
  // error state, and deliberately the less-strict fallback in both cases.
  const cachedLists = queryClient.getQueriesData<ListAvailableAssessmentsResponse>({
    queryKey: ['assessments', 'available'],
  })
  const assessment = useMemo(() => {
    const assessmentId = attemptQuery.data?.assessmentId
    if (!assessmentId) return undefined
    return cachedLists
      .map(([, data]) => data?.items.find((item) => item.id === assessmentId))
      .find((item) => item !== undefined)
  }, [cachedLists, attemptQuery.data?.assessmentId])
  const timerMinutes = assessment?.timerMinutes ?? null
  // Gating decision (asked and confirmed): the fullscreenchange/tab-switch
  // lockdown below is only armed for assessments actually configured to
  // require it — matching the backend's own existing flag and its rejection
  // of fullscreen_exit proctoring events for assessments where this is
  // false (attempts.service.ts's assertProctoringEventAllowed). See
  // AssessmentInstructionsPage.tsx's identical gate on the request side.
  const requiresFullscreenLockdown = assessment?.proctoringFullscreenRequired ?? false
  // Layout item 1 — same gating pattern, same "don't invent stricter
  // behavior than we can confirm" fallback for the no-cached-assessment
  // case. Independent of requiresFullscreenLockdown above: camera preview
  // and fullscreen lockdown are two separate flags/features (do not touch
  // the fullscreen lockdown logic — this is additive, reusing only the
  // gating PATTERN, not the flag itself).
  const requiresCameraPreview = assessment?.proctoringCameraRequired ?? false

  function goToSubmittedPage() {
    // Idempotent — already true when called from autoSubmit's onSuccess
    // (autoSubmit sets it before mutating). This assignment is what actually
    // matters for the MANUAL-submit path: SubmitAttemptButton calls this
    // directly as its onSubmitted prop, never through autoSubmit, so this is
    // the only place that ref gets set on that path. Must happen BEFORE
    // exitFullscreen below — see hasFiredRef's own comment for why.
    hasFiredRef.current = true
    // Item 4 — exit fullscreen on ANY successful submit, manual or auto,
    // before/during navigation to the results page. Fire-and-forget:
    // whether this resolves, rejects (nothing to exit — lockdown was never
    // active), or the API doesn't exist at all, the student is leaving this
    // screen regardless.
    void exitFullscreen().catch(() => {})
    navigate(`/student/attempts/${attemptId}/submitted`, { replace: true })
  }

  // Extracted shared auto-submit (item 2) — the ONE place that calls
  // submitAttempt's mutate for every non-manual trigger. Each trigger below
  // passes its own `reason` purely for the takeover overlay's copy; the
  // submit call itself is identical regardless of why it fired.
  function autoSubmit(reason: AutoSubmitReason) {
    if (!attemptId) return
    if (hasFiredRef.current) return
    hasFiredRef.current = true
    setAutoSubmitReason(reason)
    setIsAutoSubmitting(true)
    submitAttempt.mutate({ idempotencyKey: crypto.randomUUID() }, { onSuccess: goToSubmittedPage })
  }

  // Always-fresh ref to the latest autoSubmit closure, so the mount-once
  // lockdown effect below can call it without listing it (or the things it
  // closes over — submitAttempt, attemptId) in that effect's own dependency
  // array. attemptId never actually changes for this screen's lifetime and
  // hasFiredRef is a stable ref object either way, but submitAttempt is a
  // fresh object from useMutation each render — going through this ref
  // means the effect never has to re-subscribe its DOM listeners just
  // because that object identity changed, and never risks calling a stale
  // closure either.
  const autoSubmitRef = useRef(autoSubmit)
  autoSubmitRef.current = autoSubmit

  function handleTimerExpire() {
    autoSubmitRef.current('timer')
  }

  // Lockdown listeners (item 3) — armed for the lifetime of this screen
  // only (added on mount, removed on unmount via this effect's cleanup),
  // and only at all when this assessment actually requires fullscreen.
  //
  // fullscreenchange only ever fires on a REAL transition of the fullscreen
  // element (entering or exiting) — it does NOT fire for "fullscreen was
  // never entered in the first place" (e.g. AssessmentInstructionsPage's
  // request was rejected or unsupported). That case simply never produces
  // this event at all, so no extra branching is needed here to distinguish
  // "never locked down" from "was locked down, now isn't" — it's handled
  // entirely by isLockdownActive's mount-time initializer + the warning
  // banner below, independent of this listener.
  //
  // visibilitychange fires immediately on any tab/window switch, minimize,
  // or OS-level app switch — deliberately zero-tolerance/no grace period,
  // matching "full-screen lockdown" being the explicit goal of this item.
  useEffect(() => {
    if (!requiresFullscreenLockdown) return

    function handleFullscreenChange() {
      const active = isFullscreenActive()
      setIsLockdownActive(active)
      if (!active) autoSubmitRef.current('fullscreen-exit')
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') autoSubmitRef.current('tab-switch')
    }

    for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
      document.addEventListener(eventName, handleFullscreenChange)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
        document.removeEventListener(eventName, handleFullscreenChange)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [requiresFullscreenLockdown])

  if (attemptQuery.isLoading || questionsQuery.isLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading your attempt…</p>
      </div>
    )
  }

  if (attemptQuery.isError || questionsQuery.isError || !questionsQuery.data) {
    // Whichever query actually failed — both are real ApiErrors by the time
    // they reach here (see api/index.ts's response interceptor). Neither
    // being set (just !questionsQuery.data with no error) is a distinct,
    // genuinely error-less edge case, not something describeAttemptLoadError
    // has a real error to describe — falls through to its own instanceof
    // guard's generic string instead.
    const loadError = attemptQuery.error ?? questionsQuery.error
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{describeAttemptLoadError(loadError)}</p>
      </div>
    )
  }

  const questions = questionsQuery.data

  if (questions.length === 0) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          This assessment has no questions to display.
        </p>
      </div>
    )
  }

  const currentQuestion = questions[currentIndex]
  const answeredCount = questions.filter((question) => question.savedResponse !== undefined).length
  const autoSubmitCopy = AUTO_SUBMIT_COPY[autoSubmitReason]
  // Section switcher (item 3, prior phase) — see groupQuestionsBySections'
  // own comment above for exactly how these boundaries come from the
  // existing GET /attempts/:id/questions response. The picker menu below is
  // only rendered when there are at least two sections — a single-section
  // attempt (the common case) shows the title block but no menu button,
  // same gate the old tab strip used.
  const sections = groupQuestionsBySections(questions)
  const activeSection = sections.find((section) =>
    section.questionIndexes.includes(currentIndex),
  )
  // Header-title phase — assessmentTitle is identical on every row (one
  // assessment per attempt), read from whichever question is convenient;
  // questions[0] always exists here (the questions.length === 0 guard above
  // already returned). This is now the primary source for the header's
  // assessment title — more reliable than AssessmentDetailPage/
  // AssessmentInstructionsPage's own cached-list lookup trick (see
  // `assessment` above, still used for timerMinutes/proctoring flags,
  // neither of which this new backend field carries), since it works even
  // on a direct URL visit/hard refresh where that cache is empty.
  const assessmentTitle = questions[0].assessmentTitle
  const currentSectionTitle = activeSection?.title ?? questions[currentIndex].sectionTitle
  // Bug fix (multi-section numbering coherence) — QuestionNavigator only
  // renders the active section's questions (visibleIndexes below) but
  // those are GLOBAL indexes into the full `questions` array, so a small
  // section can legitimately sit at non-adjacent global positions (e.g.
  // #1 and #4 of 14 when a 12-question section is interleaved between
  // them by section_order/sortOrder). Showing "Question 4 of 14" against a
  // navigator with only two buttons ("1" and "4") reads as questions 2-3
  // having vanished. For a multi-section attempt, the heading now reports
  // position WITHIN the active section instead — always gapless and always
  // matching the navigator's own (equally section-local) numbering — while
  // the answered-count line still reports the true whole-assessment total
  // separately, so overall progress isn't lost.
  const localIndexInSection = activeSection
    ? activeSection.questionIndexes.indexOf(currentIndex)
    : currentIndex
  const sectionQuestionCount = activeSection?.questionIndexes.length ?? questions.length

  return (
    // Density phase — top padding cut way down (p-4/p-5 on every side ->
    // pt-2/pt-3 specifically) so this title row sits close under
    // AttemptLayout's logo bar instead of leaving a visible dead band
    // between them (confirmed in the reported screenshot). Not a literal
    // merge of the two header bands into one component — AttemptLayout has
    // no access to this page's assessment-title/section data without a
    // real architectural change (outlet context or a shared store), which
    // is out of this "layout/components only" phase's scope. This is the
    // "different fix" that removes the dead space instead. gap-3 -> gap-2.5
    // between the stacked rows below (title row / lockdown banner /
    // monitoring bar / content row) for the same denser, NeoPAT-style
    // "no dead vertical space between rows" feel — the monitoring bar's OWN
    // internal padding is untouched, only the space around it shrank.
    <div className="relative flex flex-col gap-2.5 px-4 pt-2 pb-4 sm:px-5 sm:pt-3 sm:pb-5">
      {/* Header-title phase — a NEW row, entirely separate from the
          untouched monitoring bar below: assessment title (bold) + current
          section's real title (secondary weight) on the left, the
          section-picker menu button on the right. Deliberately its own
          full-width row rather than folded into the monitoring bar's
          "Question X of Y" row, so the menu button is never visually or
          structurally grouped with the camera/timer "you're being
          monitored" signals — it's exam-content navigation, not a
          proctoring control. Menu only renders when there's more than one
          section to jump between. */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-brand-primary">{assessmentTitle}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{currentSectionTitle}</p>
        </div>
        {sections.length > 1 && (
          <SectionPickerMenu
            sections={sections}
            activeSectionId={activeSection?.sectionId ?? sections[0].sectionId}
            onSelectSection={(sectionId) => {
              const section = sections.find((candidate) => candidate.sectionId === sectionId)
              if (section) setCurrentIndex(section.questionIndexes[0])
            }}
          />
        )}
      </div>

      {isAutoSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-8 text-center shadow-xl">
            <h2 className="text-lg font-semibold text-brand-primary">{autoSubmitCopy.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {submitAttempt.isError
                ? 'Submitting your attempt failed — retrying…'
                : autoSubmitCopy.description}
            </p>
          </div>
        </div>
      )}

      {/* Lockdown item 1's honesty requirement: if this assessment requires
          fullscreen but it isn't actually active right now (rejected at the
          instructions screen, exited via an OS gesture the fullscreenchange
          listener hasn't caught yet, or simply unsupported), say so plainly
          instead of letting the student believe lockdown is protecting them
          when it isn't. Suppressed while the auto-submit overlay is up —
          that takeover already covers the screen. Logic untouched this
          phase — only the surrounding spacing changed. */}
      {requiresFullscreenLockdown && !isLockdownActive && !isAutoSubmitting && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-400">
          <span>
            Fullscreen lockdown isn&apos;t active for this assessment. Switching tabs will still
            auto-submit your attempt.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              void requestFullscreen(document.documentElement).catch(() => {})
            }}
          >
            Enable fullscreen
          </Button>
        </div>
      )}

      {/* Monitoring bar (this phase, items 2 + 4) — "Question X of Y" on the
          left, timer + camera preview grouped together on the right: real
          proctoring UIs (NEOPAT/FacePrep/HackerRank) keep these two
          always-visible "you're being monitored" signals side by side, not
          the timer buried in the left sidebar (where the prior phase had
          left it) with the camera floating independently in a corner.
          AttemptTimer's own color-escalation behavior and CameraPreview's
          getUserMedia logic are both completely untouched — only WHERE each
          renders changed. */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-brand-primary">
            {sections.length > 1
              ? `Question ${localIndexInSection + 1} of ${sectionQuestionCount} in this section`
              : `Question ${currentIndex + 1} of ${questions.length}`}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {answeredCount} of {questions.length} answered
            {sections.length > 1 && ` · question ${currentIndex + 1} of ${questions.length} overall`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {timerMinutes !== null && (
            <AttemptTimer timerMinutes={timerMinutes} onExpire={handleTimerExpire} />
          )}
          {requiresCameraPreview && <CameraPreview />}
        </div>
      </div>

      <div className="flex items-start gap-3">
        {/* Left sidebar — the question navigator, persistent for the whole
            attempt. Section switching now lives in the header's
            SectionPickerMenu (replacing the prior phase's horizontal tab
            strip here — see that component's own comment for why). No
            longer carries the timer either (moved to the monitoring bar
            above, prior phase). Density phase: p-4 -> p-3.5 inside
            QuestionNavigator itself (see that component). */}
        <div className="flex w-56 shrink-0 flex-col gap-2.5">
          <QuestionNavigator
            questions={questions}
            currentIndex={currentIndex}
            onNavigate={setCurrentIndex}
            visibleIndexes={sections.length > 1 ? activeSection?.questionIndexes : undefined}
          />
          {attemptId && (
            <SubmitAttemptButton
              attemptId={attemptId}
              answeredCount={answeredCount}
              totalCount={questions.length}
              onSubmitted={goToSubmittedPage}
            />
          )}
        </div>

        {/* Center — the question itself, the primary focus. Density phase:
            p-5 -> p-4, tighter still than the prior phase's own p-6 -> p-5
            pass, matching HackerRank/CodeSignal's tighter split-pane chrome
            for the coding case specifically (CLAUDE1.md's design
            references) — less empty margin, content using the available
            width more fully. No max-width constraint exists anywhere in
            this container chain (confirmed by checking AttemptLayout/
            AttemptPage/CodingQuestion directly) — the "wasted space" here
            was padding/gap values, not a width cap, so that's what shrank. */}
        <div className="min-w-0 flex-1 rounded-xl border border-border bg-background p-4 shadow-sm">
          {attemptId && currentQuestion.type === 'mcq' && (
            <McqQuestion key={currentQuestion.id} attemptId={attemptId} question={currentQuestion} />
          )}
          {attemptId && currentQuestion.type === 'psychometric' && (
            <PsychometricQuestion
              key={currentQuestion.id}
              attemptId={attemptId}
              question={currentQuestion}
            />
          )}
          {attemptId && currentQuestion.type === 'coding' && (
            <CodingQuestion
              key={currentQuestion.id}
              attemptId={attemptId}
              question={currentQuestion}
            />
          )}

          <div className="mt-5 flex justify-between border-t border-border pt-4">
            <Button
              variant="outline"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            >
              Previous
            </Button>
            <Button
              className="bg-brand-accent text-white hover:bg-brand-accent/90"
              disabled={currentIndex === questions.length - 1}
              onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
