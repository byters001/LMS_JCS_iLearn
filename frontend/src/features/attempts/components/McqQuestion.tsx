import { useImperativeHandle, useState, type Ref } from 'react'
import { ApiError } from '@/api'
import { cn } from '@/lib/utils'
import { useSubmitResponse } from '../api'
import type { AnswerSaveHandle, McqAttemptQuestion } from '../types'
import { useStableIdempotencyKey } from '../useStableIdempotencyKey'

interface McqQuestionProps {
  attemptId: string
  question: McqAttemptQuestion
  ref?: Ref<AnswerSaveHandle>
}

// Autosave phase — the previous explicit "Save Answer" button is gone.
// Selecting an option still fires no network request by itself (same
// "exploratory click vs. a real decision" reasoning the button-based
// version already documented) — the request now fires when AttemptPage
// calls this component's exposed saveBeforeNavigate() (via `ref`, see
// types.ts's AnswerSaveHandle), right before Next/Previous/a
// question-navigator click/a section jump/Submit Attempt would otherwise
// move the student away from this question. This is still exactly one save
// per genuine decision, just triggered by "the student is done with this
// question" instead of a dedicated click.
//
// Initial selection comes from question.savedResponse (Part 3's backend
// addition to GET /attempts/:id/questions) so a reload shows what was
// already answered — this component still remounts (and resets local
// state) on question change via AttemptPage's key={question.id}, exactly
// as it did before.
export function McqQuestion({ attemptId, question, ref }: McqQuestionProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    question.savedResponse?.selectedOptionId ?? null,
  )
  const submitResponse = useSubmitResponse(attemptId)
  const idempotencyKey = useStableIdempotencyKey(selectedOptionId ?? '')

  useImperativeHandle(ref, () => ({
    saveBeforeNavigate: async () => {
      // Nothing selected — there's nothing to save, and an unanswered
      // question must never block navigation (the student can come back
      // later; QuestionNavigator already shows it as unanswered).
      if (selectedOptionId === null) return true
      // Already matches what's persisted (question.savedResponse, which
      // survives this component's own remounts unlike submitResponse's own
      // isSuccess/variables) — nothing changed since the last save, so
      // re-saving would just be a redundant request.
      if (selectedOptionId === question.savedResponse?.selectedOptionId) return true
      try {
        await submitResponse.mutateAsync({
          questionVersionId: question.questionVersionId,
          selectedOptionId,
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

      <div className="mt-5 space-y-2.5">
        {question.options.map((option) => (
          <label
            key={option.id}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg border p-3.5 text-sm transition-all',
              selectedOptionId === option.id
                ? 'border-brand-accent bg-brand-accent/5 shadow-sm ring-1 ring-brand-accent/20'
                : 'border-border hover:border-brand-accent/30 hover:bg-muted/50',
            )}
          >
            <input
              type="radio"
              name={`mcq-${question.id}`}
              checked={selectedOptionId === option.id}
              onChange={() => setSelectedOptionId(option.id)}
              className="size-4 accent-brand-accent"
            />
            <span className="text-brand-primary">{option.optionText}</span>
            {option.imageUrl && (
              <img
                src={option.imageUrl}
                alt=""
                className="ml-auto h-16 w-16 rounded object-cover"
              />
            )}
          </label>
        ))}
      </div>

      {/* Persists until the next successful save (or the selection changes
          back to something already-saved) — a durable reminder of WHY the
          student got kept on this question, alongside AttemptPage's
          one-shot toast for the same failure. */}
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
