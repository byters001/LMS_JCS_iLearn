// Question-navigator sidebar — Mercer Mettl's pattern (numbered grid,
// current position highlighted, click to jump) per CLAUDE1.md's design
// references. Answered/unanswered is now real state, not faked: every
// question already carries savedResponse (populated once Part 3's
// save/submit calls touch it — see types.ts's AttemptQuestionBase), so this
// reads that directly rather than needing any new prop or fetch.
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
    <nav className="w-56 shrink-0 rounded-xl border border-border bg-muted/30 p-4">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Questions
      </h2>
      <div className="grid grid-cols-5 gap-2">
        {questions.map((question, index) => {
          const isCurrent = index === currentIndex
          const isAnswered = question.savedResponse !== undefined
          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onNavigate(index)}
              aria-current={isCurrent}
              title={`${TYPE_LABELS[question.type]} — Question ${index + 1}${isAnswered ? ' (answered)' : ''}`}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md border text-sm font-medium transition-all',
                isCurrent && 'border-brand-accent bg-brand-accent text-white shadow-sm ring-2 ring-brand-accent/30',
                !isCurrent &&
                  isAnswered &&
                  'border-green-600/40 bg-green-600/10 text-green-700 hover:bg-green-600/20 dark:border-green-500/40 dark:text-green-400',
                !isCurrent &&
                  !isAnswered &&
                  'border-border bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {index + 1}
            </button>
          )
        })}
      </div>

      <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm border border-brand-accent bg-brand-accent" />
          Current
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm border border-green-600/40 bg-green-600/10 dark:border-green-500/40" />
          Answered
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm border border-border bg-background" />
          Unanswered
        </div>
      </div>
    </nav>
  )
}
