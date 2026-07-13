import { useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSubmitResponse } from '../api'
import type { PsychometricAttemptQuestion } from '../types'
import { useStableIdempotencyKey } from '../useStableIdempotencyKey'

interface PsychometricQuestionProps {
  attemptId: string
  question: PsychometricAttemptQuestion
}

// Generic 5-point labels, used whenever the question has no seeded
// psychometricOptions to label each point with instead (every psychometric
// question we've seen against this backend so far falls into this case).
const GENERIC_LIKERT_LABELS = [
  'Strongly Disagree',
  'Disagree',
  'Neutral',
  'Agree',
  'Strongly Agree',
]

// Part 3 design correction from Part 2: attempt_responses.likert_value is a
// standalone numeric rating (backend/db/schema/attempts.schema.ts's own
// comment: "likert_value is the psychometric answer") — it is NOT a
// reference to a specific psychometricOptions row, and nothing in
// submitResponseSchema requires psychometricOptions to be non-empty for
// likertValue to be valid. Part 2's component rendered psychometricOptions
// as the selectable choices themselves, which meant a question with zero
// seeded options (the norm in this backend's real data) could never
// actually be answered. This renders a fixed 1-5 scale that always works:
// psychometricOptions, when present, only relabel each point (option at
// sortOrder N labels point N+1); when absent, generic labels are used.
export function PsychometricQuestion({ attemptId, question }: PsychometricQuestionProps) {
  const [likertValue, setLikertValue] = useState<number | null>(
    question.savedResponse?.likertValue ?? null,
  )
  const submitResponse = useSubmitResponse(attemptId)
  const idempotencyKey = useStableIdempotencyKey(String(likertValue ?? ''))

  const sortedOptions = [...question.psychometricOptions].sort((a, b) => a.sortOrder - b.sortOrder)
  const scale = sortedOptions.length > 0 ? sortedOptions : null

  const isSavedForCurrentSelection =
    submitResponse.isSuccess && submitResponse.variables?.likertValue === likertValue

  function handleSave() {
    if (likertValue === null) return
    submitResponse.mutate({
      questionVersionId: question.questionVersionId,
      likertValue,
      idempotencyKey,
    })
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <p className="text-base text-brand-primary">{question.questionText}</p>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {question.marks} marks
        </span>
      </div>

      <div className="mt-5 grid grid-cols-5 gap-2">
        {(scale ?? GENERIC_LIKERT_LABELS).map((entry, index) => {
          const value = index + 1
          const label = typeof entry === 'string' ? entry : entry.optionText
          return (
            <button
              key={typeof entry === 'string' ? value : entry.id}
              type="button"
              onClick={() => setLikertValue(value)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center text-xs transition-colors',
                likertValue === value
                  ? 'border-brand-accent bg-brand-accent/5'
                  : 'border-border hover:bg-muted/50',
              )}
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border text-sm font-semibold',
                  likertValue === value
                    ? 'border-brand-accent bg-brand-accent text-white'
                    : 'border-border text-brand-primary',
                )}
              >
                {value}
              </span>
              <span className="text-muted-foreground">{label}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button disabled={likertValue === null || submitResponse.isPending} onClick={handleSave}>
          {submitResponse.isPending ? 'Saving…' : 'Save Answer'}
        </Button>
        {isSavedForCurrentSelection && (
          <span className="text-sm font-medium text-green-600 dark:text-green-500">Saved</span>
        )}
        {submitResponse.isError && !submitResponse.isPending && (
          <span className="text-sm text-destructive">
            {submitResponse.error instanceof ApiError
              ? submitResponse.error.message
              : 'Failed to save — try again.'}
          </span>
        )}
      </div>
    </div>
  )
}
