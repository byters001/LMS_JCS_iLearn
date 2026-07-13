import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { McqAttemptQuestion } from '../types'

interface McqQuestionProps {
  question: McqAttemptQuestion
}

// Selection state is local-only and intentionally not persisted anywhere —
// answer submission (PUT /attempts/:attemptId/responses/:questionVersionId)
// is Part 3's scope. AttemptPage renders this component keyed by
// question.id, so it remounts (and this state resets) whenever the
// question changes, rather than a stale selection leaking across
// questions.
export function McqQuestion({ question }: McqQuestionProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <p className="text-base text-brand-primary">{question.questionText}</p>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {question.marks} marks
        </span>
      </div>

      <div className="mt-5 space-y-2">
        {question.options.map((option) => (
          <label
            key={option.id}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors',
              selectedOptionId === option.id
                ? 'border-brand-accent bg-brand-accent/5'
                : 'border-border hover:bg-muted/50',
            )}
          >
            <input
              type="radio"
              name={`mcq-${question.id}`}
              checked={selectedOptionId === option.id}
              onChange={() => setSelectedOptionId(option.id)}
              className="accent-brand-accent"
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

      {/* Stub — Part 3 wires this to PUT /attempts/:attemptId/responses/:questionVersionId */}
      <Button className="mt-6" disabled={selectedOptionId === null}>
        Save Answer
      </Button>
    </div>
  )
}
