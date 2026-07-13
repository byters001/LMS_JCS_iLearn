import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import type { ListAvailableAssessmentsResponse } from '@/features/assessments/types'
import { useAttempt, useAttemptQuestions } from '../api'
import { AttemptTimer } from '../components/AttemptTimer'
import { CodingQuestion } from '../components/CodingQuestion'
import { McqQuestion } from '../components/McqQuestion'
import { PsychometricQuestion } from '../components/PsychometricQuestion'
import { QuestionNavigator } from '../components/QuestionNavigator'

// Part 2: real question rendering + navigation + a visual-only timer.
// Answer submission (Save Answer / Run-Submit Code stubs in the per-type
// question components) and the timer's auto-submit-on-expiry behavior are
// both Part 3's scope.
export default function AttemptPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const queryClient = useQueryClient()
  const [currentIndex, setCurrentIndex] = useState(0)

  const attemptQuery = useAttempt(attemptId)
  const questionsQuery = useAttemptQuestions(attemptId)

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

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h1 className="text-lg font-semibold text-brand-primary">
          Question {currentIndex + 1} of {questions.length}
        </h1>
        {timerMinutes !== null && <AttemptTimer timerMinutes={timerMinutes} />}
      </div>

      <div className="flex gap-4">
        <QuestionNavigator
          questions={questions}
          currentIndex={currentIndex}
          onNavigate={setCurrentIndex}
        />

        <div className="min-w-0 flex-1 rounded-lg border border-border bg-background p-6 shadow-sm">
          {currentQuestion.type === 'mcq' && (
            <McqQuestion key={currentQuestion.id} question={currentQuestion} />
          )}
          {currentQuestion.type === 'psychometric' && (
            <PsychometricQuestion key={currentQuestion.id} question={currentQuestion} />
          )}
          {currentQuestion.type === 'coding' && (
            <CodingQuestion key={currentQuestion.id} question={currentQuestion} />
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
