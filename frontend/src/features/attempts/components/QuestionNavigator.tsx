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
  // Item 3 (section switcher) — when provided, only these GLOBAL indexes
  // into `questions` are rendered (AttemptPage passes the active section's
  // indexes). Numbering/onNavigate still use the question's real position
  // in the full `questions` array, not its position within this subset —
  // so the grid stays consistent with the header's "Question X of N" count,
  // which is unaffected by which section tab is active. Omitted (the
  // default) renders every question, byte-identical to this component's
  // behavior before section tabs existed.
  visibleIndexes?: number[]
}

const TYPE_LABELS: Record<AttemptQuestion['type'], string> = {
  mcq: 'MCQ',
  psychometric: 'Psychometric',
  coding: 'Coding',
}

export function QuestionNavigator({
  questions,
  currentIndex,
  onNavigate,
  visibleIndexes,
}: QuestionNavigatorProps) {
  const indexesToRender = visibleIndexes ?? questions.map((_, index) => index)

  return (
    <nav className="w-56 shrink-0 rounded-xl border border-border bg-muted/30 p-3.5">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Questions
      </h2>
      <div className="grid grid-cols-5 gap-2">
        {indexesToRender.map((index, position) => {
          const question = questions[index]
          const isCurrent = index === currentIndex
          const isAnswered = question.savedResponse !== undefined
          // Numbered by POSITION within this rendered subset (1, 2, 3…), not
          // the question's global index — when visibleIndexes filters down
          // to one section, that section's own sortOrder/section_order can
          // legitimately place its questions at non-adjacent global
          // positions (e.g. global #1 and #4 of 14), which used to surface
          // here as "1" and "4" with nothing rendered in between — looking
          // like questions 2-3 had gone missing, when they simply belong to
          // a different section. Local, gapless numbering avoids ever
          // showing a number with no corresponding button. Matches
          // AttemptPage's header, which now shows this same local count for
          // a multi-section attempt.
          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onNavigate(index)}
              aria-current={isCurrent}
              title={`${TYPE_LABELS[question.type]} — Question ${position + 1}${isAnswered ? ' (answered)' : ''}`}
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
              {position + 1}
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
