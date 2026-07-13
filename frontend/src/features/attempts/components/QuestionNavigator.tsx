// Question-navigator sidebar — Mercer Mettl's pattern (numbered grid,
// current position highlighted, click to jump) per CLAUDE1.md's design
// references. Deliberately does NOT show "answered" state yet: that would
// require the response-submission tracking Part 3 builds, and faking it
// here would be misleading rather than helpful.
import { cn } from '@/lib/utils'
import type { AttemptQuestion } from '../types'

interface QuestionNavigatorProps {
  questions: AttemptQuestion[]
  currentIndex: number
  onNavigate: (index: number) => void
}

const TYPE_LABELS: Record<AttemptQuestion['type'], string> = {
  mcq: 'MCQ',
  psychometric: 'Psychometric',
  coding: 'Coding',
}

export function QuestionNavigator({ questions, currentIndex, onNavigate }: QuestionNavigatorProps) {
  return (
    <nav className="w-56 shrink-0 rounded-lg border border-border bg-muted/30 p-4">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Questions
      </h2>
      <div className="grid grid-cols-5 gap-2">
        {questions.map((question, index) => (
          <button
            key={question.id}
            type="button"
            onClick={() => onNavigate(index)}
            aria-current={index === currentIndex}
            title={`${TYPE_LABELS[question.type]} — Question ${index + 1}`}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md border text-sm font-medium transition-colors',
              index === currentIndex
                ? 'border-brand-accent bg-brand-accent text-white'
                : 'border-border bg-background text-brand-primary hover:bg-muted',
            )}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </nav>
  )
}
