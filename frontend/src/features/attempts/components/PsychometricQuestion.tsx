import { useImperativeHandle, useState, type Ref } from 'react'
import { ApiError } from '@/api'
import { cn } from '@/lib/utils'
import { useSubmitResponse } from '../api'
import type { AnswerSaveHandle, PsychometricAttemptQuestion } from '../types'
import { useStableIdempotencyKey } from '../useStableIdempotencyKey'

interface PsychometricQuestionProps {
  attemptId: string
  question: PsychometricAttemptQuestion
  ref?: Ref<AnswerSaveHandle>
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
//
// Autosave phase — same pattern as McqQuestion.tsx: the explicit "Save
// Answer" button is gone, replaced by an imperative saveBeforeNavigate()
// exposed via `ref` (types.ts's AnswerSaveHandle), which AttemptPage calls
// right before Next/Previous/a question-navigator click/a section jump/
// Submit Attempt would otherwise move the student away. See that file's own
// comment for the full reasoning — identical here, just likertValue instead
// of selectedOptionId.
export function PsychometricQuestion({ attemptId, question, ref }: PsychometricQuestionProps) {
  const [likertValue, setLikertValue] = useState<number | null>(
    question.savedResponse?.likertValue ?? null,
  )
  const submitResponse = useSubmitResponse(attemptId)
  const idempotencyKey = useStableIdempotencyKey(String(likertValue ?? ''))

  const sortedOptions = [...question.psychometricOptions].sort((a, b) => a.sortOrder - b.sortOrder)
  const scale = sortedOptions.length > 0 ? sortedOptions : null

  useImperativeHandle(ref, () => ({
    saveBeforeNavigate: async () => {
      if (likertValue === null) return true
      if (likertValue === question.savedResponse?.likertValue) return true
      try {
        await submitResponse.mutateAsync({
          questionVersionId: question.questionVersionId,
          likertValue,
          idempotencyKey,
        })
        return true
      } catch {
        return false
      }
    },
  }))

  return (
    <div>
      <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <p className="text-base leading-relaxed text-brand-primary">{question.questionText}</p>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {question.marks} marks
        </span>
      </div>

      {question.images && question.images.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {question.images.map((image) => (
            <img
              key={image.id}
              src={image.imageUrl}
              alt={image.caption ?? ''}
              className="h-32 w-auto max-w-full rounded-md border border-border object-contain"
            />
          ))}
        </div>
      )}

      {/* A connected track behind the points, not five isolated buttons —
          reads as one scale being picked from (classic Likert presentation)
          rather than a row of unrelated choices. */}
      <div className="relative mt-8 rounded-xl border border-border bg-muted/20 px-6 pt-7 pb-5">
        <div className="pointer-events-none absolute top-[2.45rem] right-12 left-12 h-0.5 bg-border" />
        <div className="relative grid grid-cols-5 gap-2">
          {(scale ?? GENERIC_LIKERT_LABELS).map((entry, index) => {
            const value = index + 1
            const label = typeof entry === 'string' ? entry : entry.optionText
            const isSelected = likertValue === value
            return (
              <button
                key={typeof entry === 'string' ? value : entry.id}
                type="button"
                onClick={() => setLikertValue(value)}
                className="group flex flex-col items-center gap-2 text-center text-xs"
              >
                <span
                  className={cn(
                    'flex size-9 items-center justify-center rounded-full border-2 bg-background text-sm font-semibold transition-all group-hover:scale-110',
                    isSelected
                      ? 'border-brand-accent bg-brand-accent text-white shadow-md'
                      : 'border-border text-brand-primary group-hover:border-brand-accent/50',
                  )}
                >
                  {value}
                </span>
                <span className={cn('transition-colors', isSelected ? 'font-medium text-brand-primary' : 'text-muted-foreground')}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {submitResponse.isError && (
        <p className="mt-4 text-sm text-destructive">
          {submitResponse.error instanceof ApiError
            ? submitResponse.error.message
            : 'Failed to save your answer — try moving to the next question again.'}
        </p>
      )}
    </div>
  )
}
