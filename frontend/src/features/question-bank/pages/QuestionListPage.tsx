import { Braces, Brain, ListChecks, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useQuestions, useQuestionsWithText } from '../api'
import { QuestionStatusBadge } from '../components/QuestionStatusBadge'
import type { QuestionDifficulty, QuestionType } from '../types'

const PAGE_SIZE = 20
const QUESTION_TEXT_TRUNCATE_LENGTH = 100

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
}

// question_type_enum in schema.sql has exactly these 3 values — confirmed
// by reading the enum definition directly (`CREATE TYPE question_type_enum
// AS ENUM ('mcq', 'coding', 'psychometric')`) and listQuestionsQuerySchema's
// z.enum(...), not assumed. A fixed array (not derived from an object) so
// the type-card grid below has an explicit, stable render order.
const TYPE_ORDER: QuestionType[] = ['mcq', 'coding', 'psychometric']

const TYPE_ICONS: Record<QuestionType, typeof ListChecks> = {
  mcq: ListChecks,
  coding: Braces,
  psychometric: Brain,
}

const DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

const DIFFICULTY_ORDER: QuestionDifficulty[] = ['easy', 'medium', 'hard']

const DIFFICULTY_STYLES: Record<QuestionDifficulty, string> = {
  easy: 'bg-green-600/10 text-green-700 dark:text-green-400',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  hard: 'bg-destructive/10 text-destructive',
}

function truncate(text: string): string {
  return text.length > QUESTION_TEXT_TRUNCATE_LENGTH
    ? `${text.slice(0, QUESTION_TEXT_TRUNCATE_LENGTH)}…`
    : text
}

// Level 1 card — one per question type, showing that type's total count.
// Styled as a native <button> (not the Card component) for the same reason
// StudentListPage's college cards are: Card renders a plain div, and this
// needs real click/aria-expanded semantics, not a div with an onClick
// bolted on.
function TypeCard({
  type,
  count,
  isSelected,
  onSelect,
}: {
  type: QuestionType
  count: number | undefined
  isSelected: boolean
  onSelect: () => void
}) {
  const Icon = TYPE_ICONS[type]
  return (
    <button
      type="button"
      aria-expanded={isSelected}
      onClick={onSelect}
      className={cn(
        'rounded-xl border bg-card p-3.5 text-left shadow-sm transition-shadow hover:shadow-md',
        isSelected ? 'border-brand-accent ring-2 ring-brand-accent/20' : 'border-border',
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full',
            isSelected ? 'bg-brand-accent/10 text-brand-accent' : 'bg-brand-primary/10 text-brand-primary',
          )}
        >
          <Icon className="size-5" />
        </div>
        <div>
          <p className="font-heading text-2xl font-semibold text-foreground">
            {count === undefined ? (
              <span className="inline-block h-7 w-10 animate-pulse rounded bg-muted align-middle" />
            ) : (
              count
            )}
          </p>
          <p className="text-sm text-muted-foreground">{TYPE_LABELS[type]}</p>
        </div>
      </div>
    </button>
  )
}

// Level 2 sub-card — one per difficulty, scoped to the currently selected
// type. Smaller/flatter than TypeCard on purpose (a visibly "nested" step,
// not a sibling of the type cards above it).
function DifficultySubCard({
  difficulty,
  count,
  isSelected,
  onSelect,
}: {
  difficulty: QuestionDifficulty
  count: number | undefined
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-expanded={isSelected}
      onClick={onSelect}
      className={cn(
        'rounded-lg border bg-card px-4 py-3 text-left shadow-sm transition-shadow hover:shadow-md',
        isSelected ? 'border-brand-accent ring-2 ring-brand-accent/20' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', DIFFICULTY_STYLES[difficulty])}>
          {DIFFICULTY_LABELS[difficulty]}
        </span>
        <span className="font-heading text-lg font-semibold text-foreground">
          {count === undefined ? (
            <span className="inline-block h-5 w-6 animate-pulse rounded bg-muted align-middle" />
          ) : (
            count
          )}
        </span>
      </div>
    </button>
  )
}

// Two-level card drill-down: type (MCQ/Coding/Psychometric) -> difficulty
// (Easy/Medium/Hard) -> the existing filtered question list. Sub-cards, not
// tabs, for level 2 — this reuses the exact "click a card, reveal more
// below via Collapsible" interaction StudentListPage's college grid already
// established in this codebase, rather than introducing Tabs (used
// elsewhere for dialog-internal switches, e.g. AddStudentsDialog, not for
// list-page drill-down). Same component, same route, for both
// /admin/questions and /trainer/questions (routes/index.tsx) — this file
// carries no role-conditional logic, so both roles get an identical
// drill-down UI, backed by whatever rows GET /questions already
// permission-scopes server-side for that caller.
export default function QuestionListPage() {
  const [selectedType, setSelectedType] = useState<QuestionType | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<QuestionDifficulty | null>(null)
  const [page, setPage] = useState(1)

  // Level 1 counts — fixed 3-way enum (TYPE_ORDER), so 3 plain useQuestions
  // calls rather than a dynamic useQueries array; each is the same
  // pageSize:1-for-`total` count pattern StudentListPage's stat cards use
  // (useStudentProfiles({ page: 1, pageSize: 1 })), reused as-is rather than
  // adding a new aggregate/count endpoint.
  const mcqCount = useQuestions({ type: 'mcq', page: 1, pageSize: 1 })
  const codingCount = useQuestions({ type: 'coding', page: 1, pageSize: 1 })
  const psychometricCount = useQuestions({ type: 'psychometric', page: 1, pageSize: 1 })
  const countsByType: Record<QuestionType, number | undefined> = {
    mcq: mcqCount.data?.total,
    coding: codingCount.data?.total,
    psychometric: psychometricCount.data?.total,
  }
  const typeCountsLoading = mcqCount.isPending || codingCount.isPending || psychometricCount.isPending
  const typeCountsError = mcqCount.isError || codingCount.isError || psychometricCount.isError

  // Level 2 counts — only meaningful once a type is selected. Fixed 3-way
  // enum again (DIFFICULTY_ORDER), gated by `enabled` (api.ts's useQuestions
  // now takes the same optional {enabled} second arg useStudentProfiles
  // already has) so these 3 requests don't fire before a type is picked.
  // The `type` fallback below only matters while disabled — its value is
  // irrelevant to a query that never runs.
  const easyCount = useQuestions(
    { type: selectedType ?? 'mcq', difficulty: 'easy', page: 1, pageSize: 1 },
    { enabled: selectedType !== null },
  )
  const mediumCount = useQuestions(
    { type: selectedType ?? 'mcq', difficulty: 'medium', page: 1, pageSize: 1 },
    { enabled: selectedType !== null },
  )
  const hardCount = useQuestions(
    { type: selectedType ?? 'mcq', difficulty: 'hard', page: 1, pageSize: 1 },
    { enabled: selectedType !== null },
  )
  const countsByDifficulty: Record<QuestionDifficulty, number | undefined> = {
    easy: easyCount.data?.total,
    medium: mediumCount.data?.total,
    hard: hardCount.data?.total,
  }

  // Level 3 — the existing filtered list, reusing useQuestionsWithText with
  // the type+difficulty filters listQuestionsQuerySchema already supports
  // (confirmed by reading question-bank.schema.ts directly), gated so it
  // doesn't fetch until both a type and a difficulty are selected.
  const questions = useQuestionsWithText(
    {
      type: selectedType ?? undefined,
      difficulty: selectedDifficulty ?? undefined,
      page,
      pageSize: PAGE_SIZE,
    },
    { enabled: selectedType !== null && selectedDifficulty !== null },
  )
  const totalPages = Math.max(1, Math.ceil(questions.total / questions.pageSize))

  function handleSelectType(type: QuestionType) {
    setSelectedType((current) => (current === type ? null : type))
    setSelectedDifficulty(null)
    setPage(1)
  }

  function handleSelectDifficulty(difficulty: QuestionDifficulty) {
    setSelectedDifficulty((current) => (current === difficulty ? null : difficulty))
    setPage(1)
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold text-brand-primary">Questions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse the question bank by type, then difficulty.
          </p>
        </div>
        <Button asChild className="bg-brand-accent text-white hover:bg-brand-accent/90">
          <Link to="new">
            <Plus className="size-4" />
            Create Question
          </Link>
        </Button>
      </div>

      {typeCountsError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load question counts. Please try again.
        </div>
      )}

      {!typeCountsError && (
        <div>
          <h2 className="mb-2.5 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Question Types
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TYPE_ORDER.map((type) => (
              <TypeCard
                key={type}
                type={type}
                count={typeCountsLoading ? undefined : countsByType[type]}
                isSelected={selectedType === type}
                onSelect={() => handleSelectType(type)}
              />
            ))}
          </div>
        </div>
      )}

      <Collapsible open={selectedType !== null}>
        <CollapsibleContent className="space-y-4">
          {selectedType && (
            <div>
              <h2 className="mb-2.5 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {TYPE_LABELS[selectedType]} by Difficulty
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {DIFFICULTY_ORDER.map((difficulty) => (
                  <DifficultySubCard
                    key={difficulty}
                    difficulty={difficulty}
                    count={countsByDifficulty[difficulty]}
                    isSelected={selectedDifficulty === difficulty}
                    onSelect={() => handleSelectDifficulty(difficulty)}
                  />
                ))}
              </div>
            </div>
          )}

          {selectedType && selectedDifficulty && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {TYPE_LABELS[selectedType]} &middot; {DIFFICULTY_LABELS[selectedDifficulty]}
                </h2>
                {/* Pre-filled via CreateQuestionPage's own ?type=&difficulty=
                    query-param support (added alongside this page) — lands
                    the trainer/admin on the create form with both fields
                    already set to the combination they were just browsing,
                    instead of the form's plain 'mcq'/'medium' defaults. */}
                <Button
                  asChild
                  size="sm"
                  className="bg-brand-accent text-white hover:bg-brand-accent/90"
                >
                  <Link to={`new?type=${selectedType}&difficulty=${selectedDifficulty}`}>
                    <Plus className="size-4" />
                    Add Question
                  </Link>
                </Button>
              </div>

              {questions.isPending && (
                <div className="space-y-2" role="status" aria-label="Loading questions">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              )}

              {questions.isError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  Failed to load questions. Please try again.
                </div>
              )}

              {!questions.isPending && !questions.isError && (
                <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="pl-4">Question</TableHead>
                        <TableHead className="pr-4">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {questions.items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                            No {DIFFICULTY_LABELS[selectedDifficulty].toLowerCase()} {TYPE_LABELS[selectedType].toLowerCase()}{' '}
                            questions found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        questions.items.map((question) => (
                          <TableRow key={question.id} className="hover:bg-muted/30">
                            <TableCell className="pl-4 font-medium">
                              <Link to={question.id} className="text-brand-primary hover:underline">
                                {question.questionText ? truncate(question.questionText) : '—'}
                              </Link>
                            </TableCell>
                            <TableCell className="pr-4">
                              <QuestionStatusBadge status={question.status} />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  <div className="flex items-center justify-between border-t border-border bg-muted/10 px-4 py-3">
                    <p className="text-sm text-muted-foreground">
                      Page {questions.page} of {totalPages} &middot; {questions.total} question
                      {questions.total === 1 ? '' : 's'}
                      {questions.isFetching ? ' · refreshing…' : ''}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                        disabled={page <= 1 || questions.isFetching}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                        disabled={page >= totalPages || questions.isFetching}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
