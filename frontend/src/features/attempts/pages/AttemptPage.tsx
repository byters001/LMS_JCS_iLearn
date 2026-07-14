import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import type { ListAvailableAssessmentsResponse } from '@/features/assessments/types'
import { useAttempt, useAttemptQuestions, useSubmitAttempt } from '../api'
import { AttemptTimer } from '../components/AttemptTimer'
import { CodingQuestion } from '../components/CodingQuestion'
import { McqQuestion } from '../components/McqQuestion'
import { PsychometricQuestion } from '../components/PsychometricQuestion'
import { QuestionNavigator } from '../components/QuestionNavigator'
import { SubmitAttemptButton } from '../components/SubmitAttemptButton'

// Part 3: real answer submission (per-question Save/Run-Submit, wired in
// McqQuestion/PsychometricQuestion/CodingQuestion) and final submit — both
// the manual "Submit Attempt" confirmation and the timer's automatic
// submit-on-expiry, which both land here on the same submitted-confirmation
// navigation.
export default function AttemptPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [currentIndex, setCurrentIndex] = useState(0)
  // Set the instant the timer hits zero, before the auto-submit request
  // even resolves — this is what makes the takeover message appear
  // immediately and block further interaction, not just once the mutation
  // finishes.
  const [isAutoSubmitting, setIsAutoSubmitting] = useState(false)

  const attemptQuery = useAttempt(attemptId)
  const questionsQuery = useAttemptQuestions(attemptId)
  const submitAttempt = useSubmitAttempt(attemptId ?? '')

  // There is no student-scoped GET /assessments/:id (assessments.routes.ts's
  // GET /assessments/:id is staff-only, ASSESSMENTS_MANAGE-gated) — same gap
  // AssessmentDetailPage.tsx already works around by reading whatever
  // available-assessments list page is already cached in TanStack Query,
  // rather than this phase inventing a new backend endpoint just for
  // timerMinutes. A direct URL visit/hard refresh with an empty cache means
  // no timer displays (see the null fallback below), not an error state.
  const cachedLists = queryClient.getQueriesData<ListAvailableAssessmentsResponse>({
    queryKey: ['assessments', 'available'],
  })
  const timerMinutes = useMemo(() => {
    const assessmentId = attemptQuery.data?.assessmentId
    if (!assessmentId) return null
    const match = cachedLists
      .map(([, data]) => data?.items.find((item) => item.id === assessmentId))
      .find((item) => item !== undefined)
    return match?.timerMinutes ?? null
  }, [cachedLists, attemptQuery.data?.assessmentId])

  function goToSubmittedPage() {
    navigate(`/student/attempts/${attemptId}/submitted`, { replace: true })
  }

  // No user action required, no way to cancel: called by AttemptTimer at
  // most once (see its own hasFiredRef guard) when remainingSeconds hits 0.
  // The isAutoSubmitting takeover below has no close/cancel affordance —
  // the only way off this screen is the mutation itself resolving.
  function handleTimerExpire() {
    if (!attemptId) return
    setIsAutoSubmitting(true)
    submitAttempt.mutate(
      { idempotencyKey: crypto.randomUUID() },
      { onSuccess: goToSubmittedPage },
    )
  }

  if (attemptQuery.isLoading || questionsQuery.isLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading your attempt…</p>
      </div>
    )
  }

  if (attemptQuery.isError || questionsQuery.isError || !questionsQuery.data) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">
          Couldn&apos;t load this attempt. Please refresh, or contact your trainer if this
          persists.
        </p>
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

  return (
    <div className="relative flex flex-col gap-4 p-6">
      {isAutoSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-8 text-center shadow-xl">
            <h2 className="text-lg font-semibold text-brand-primary">Time&apos;s up</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {submitAttempt.isError
                ? 'Submitting your attempt failed — retrying…'
                : 'Submitting your attempt automatically. Please wait…'}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-lg font-semibold text-brand-primary">
            Question {currentIndex + 1} of {questions.length}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {answeredCount} of {questions.length} answered
          </p>
        </div>
        {timerMinutes !== null && (
          <AttemptTimer timerMinutes={timerMinutes} onExpire={handleTimerExpire} />
        )}
      </div>

      <div className="flex gap-5">
        <div className="flex shrink-0 flex-col gap-4">
          <QuestionNavigator
            questions={questions}
            currentIndex={currentIndex}
            onNavigate={setCurrentIndex}
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

        <div className="min-w-0 flex-1 rounded-xl border border-border bg-background p-6 shadow-sm">
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

          <div className="mt-8 flex justify-between border-t border-border pt-4">
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
