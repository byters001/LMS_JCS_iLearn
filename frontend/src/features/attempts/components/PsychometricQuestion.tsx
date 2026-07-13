import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PsychometricAttemptQuestion } from '../types'

interface PsychometricQuestionProps {
  question: PsychometricAttemptQuestion
}

// Same local-only selection state as McqQuestion — see its comment for why
// (Part 3 owns persistence, this component remounts per question.id).
export function PsychometricQuestion({ question }: PsychometricQuestionProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const hasOptions = question.psychometricOptions.length > 0

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <p className="text-base text-brand-primary">{question.questionText}</p>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {question.marks} marks
        </span>
      </div>

      {hasOptions ? (
        <div className="mt-5 space-y-2">
          {question.psychometricOptions.map((option) => (
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
                name={`psychometric-${question.id}`}
                checked={selectedOptionId === option.id}
                onChange={() => setSelectedOptionId(option.id)}
                className="accent-brand-accent"
              />
              <span className="text-brand-primary">{option.optionText}</span>
            </label>
          ))}
        </div>
      ) : (
        // Confirmed against live backend data: a psychometric question can
        // have zero seeded options. That's a content gap for the trainer to
        // fix, not a broken response — shown as an informational state, not
        // an error screen.
        <p className="mt-5 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No response options have been configured for this question yet. Contact your trainer if
          this persists.
        </p>
      )}

      {/* Stub — Part 3 wires this to PUT /attempts/:attemptId/responses/:questionVersionId */}
      <Button className="mt-6" disabled={!hasOptions || selectedOptionId === null}>
        Save Answer
      </Button>
    </div>
  )
}
