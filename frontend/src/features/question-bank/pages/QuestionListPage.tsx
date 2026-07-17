import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useQuestionsWithText } from '../api'
import { QuestionStatusBadge } from '../components/QuestionStatusBadge'
import type { QuestionDifficulty, QuestionType } from '../types'

const PAGE_SIZE = 20
const QUESTION_TEXT_TRUNCATE_LENGTH = 100

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
}

const DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

function truncate(text: string): string {
  return text.length > QUESTION_TEXT_TRUNCATE_LENGTH
    ? `${text.slice(0, QUESTION_TEXT_TRUNCATE_LENGTH)}…`
    : text
}

// Basic browsing list — GET /questions/list has no join to question_versions
// (see api.ts's useQuestionsForPicker comment), so question text comes from
// a per-row enrichment fetch via useQuestionsWithText, same pattern the
// AttachQuestionForm picker already established. Each row links to
// QuestionDetailPage — that page is minimal by design (workflow actions
// only), question editing/versioning UI remains a separate later phase.
export default function QuestionListPage() {
  const [page, setPage] = useState(1)
  const questions = useQuestionsWithText({ page, pageSize: PAGE_SIZE })

  const totalPages = Math.max(1, Math.ceil(questions.total / questions.pageSize))

  return (
    <div className="p-6">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold text-brand-primary">Questions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every question in the bank, across every type and approval status.
          </p>
        </div>
        <Button asChild className="bg-brand-accent text-white hover:bg-brand-accent/90">
          <Link to="new">Create Question</Link>
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
                <TableHead>Type</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No questions found.
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
                    <TableCell className="text-muted-foreground">
                      {TYPE_LABELS[question.type]}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {DIFFICULTY_LABELS[question.difficulty]}
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
  )
}
