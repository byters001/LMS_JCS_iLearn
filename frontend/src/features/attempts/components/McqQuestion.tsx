import { useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSubmitResponse } from '../api'
import type { McqAttemptQuestion } from '../types'
import { useStableIdempotencyKey } from '../useStableIdempotencyKey'

interface McqQuestionProps {
  attemptId: string
  question: McqAttemptQuestion
}

// Explicit Save Answer button, not save-on-select: a click on an option is
// often exploratory (a student trying out choices before committing), and
// auto-saving on every one of those would fire a real network request —
// and burn a fresh Idempotency-Key — per exploratory click rather than per
// actual decision. This also matches the existing stub button from Part 2
// rather than replacing it with a different interaction model.
//
// Initial selection comes from question.savedResponse (Part 3's backend
// addition to GET /attempts/:id/questions) so a reload shows what was
// already answered — this component still remounts (and resets local
// state) on question change via AttemptPage's key={question.id}, exactly
// as it did in Part 2.
export function McqQuestion({ attemptId, question }: McqQuestionProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    question.savedResponse?.selectedOptionId ?? null,
  )
  const submitResponse = useSubmitResponse(attemptId)
  const idempotencyKey = useStableIdempotencyKey(selectedOptionId ?? '')

  // Once the selection moves away from whatever the last successful save
  // was for, that save no longer describes the CURRENT selection — the
  // "Saved" indicator must stop claiming it does.
  const isSavedForCurrentSelection =
    submitResponse.isSuccess && submitResponse.variables?.selectedOptionId === selectedOptionId

  function handleSave() {
    if (selectedOptionId === null) return
    submitResponse.mutate({
      questionVersionId: question.questionVersionId,
      selectedOptionId,
      idempotencyKey,
    })
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <p className="text-base leading-relaxed text-brand-primary">{question.questionText}</p>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {question.marks} marks
        </span>
      </div>

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

      <div className="mt-6 flex items-center gap-3">
        <Button
          disabled={selectedOptionId === null || submitResponse.isPending}
          onClick={handleSave}
        >
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
