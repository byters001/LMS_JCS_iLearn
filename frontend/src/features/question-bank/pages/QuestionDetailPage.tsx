import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useQuestionDetail } from '../api'
import { DeleteQuestionDialog } from '../components/DeleteQuestionDialog'
import { EditQuestionDialog } from '../components/EditQuestionDialog'
import { QuestionStatusBadge } from '../components/QuestionStatusBadge'
import { QuestionWorkflowActions } from '../components/QuestionWorkflowActions'
import type { QuestionDifficulty, QuestionType } from '../types'

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

const DIFFICULTY_VARIANTS: Record<QuestionDifficulty, 'success' | 'warning' | 'danger'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// Minimal by design — this exists specifically to host the workflow-status
// actions QuestionListPage had nowhere to link to, since that list is
// explicitly read-only with no click-through of its own. Content editing
// (question-content-editing phase) links out to EditQuestionContentPage
// rather than living inline here — that form is as large/complex as
// CreateQuestionPage's, the same reasoning EditQuestionDialog.tsx already
// gives for staying metadata-only inline while deferring content edits
// elsewhere.
export default function QuestionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: question, isLoading, isError, error } = useQuestionDetail(id)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Loading question…</p>
      </div>
    )
  }

  if (isError || !question) {
    return (
      <div className="p-4">
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : "Couldn't load this question."}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4">
      <Link to=".." className="text-sm text-primary hover:underline">
        &larr; Back to questions
      </Link>

      <Card className="p-3.5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-base text-foreground">{question.currentVersion?.questionText ?? '—'}</p>
          <div className="flex shrink-0 items-center gap-2">
            <QuestionStatusBadge status={question.status} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
            Edit
          </Button>
          {/* Distinct from "Edit" above (metadata only — category/
              difficulty/college). This creates a NEW question_versions row
              pre-filled from the current one and immediately activates it —
              content is never edited in place (EditQuestionContentPage.tsx's
              own module comment has the full reasoning + evidence). */}
          <Button variant="outline" size="sm" asChild>
            <Link to="edit-content">Edit Content</Link>
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setIsDeleteOpen(true)}>
            Delete
          </Button>
        </div>

        <dl className="mt-3.5 grid grid-cols-2 gap-3 border-t border-border pt-3.5 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Type</dt>
            <dd className="mt-0.5 font-medium text-foreground">{TYPE_LABELS[question.type]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Difficulty</dt>
            <dd className="mt-0.5">
              <Badge variant={DIFFICULTY_VARIANTS[question.difficulty]}>
                {DIFFICULTY_LABELS[question.difficulty]}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Marks</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {question.currentVersion?.marks ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Created</dt>
            <dd className="mt-0.5 font-medium text-foreground">{formatDate(question.createdAt)}</dd>
          </div>
        </dl>
      </Card>

      {/* Item 2 — this section didn't exist before: QuestionDetailPage was
          minimal by design (see this file's module comment), which meant an
          uploaded question/option image had nowhere on the frontend to ever
          render for a staff preview. Read-only; content editing still goes
          through the separate, not-yet-built version-creation flow (see
          EditQuestionDialog.tsx's own comment on why it stays metadata-only). */}
      {question.currentVersion &&
        (question.currentVersion.images.length > 0 ||
          question.currentVersion.options.length > 0) && (
          <Card className="p-3.5">
            <CardHeader className="px-0 pt-0 pb-0">
              <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Content
              </h2>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {question.currentVersion.images.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {question.currentVersion.images.map((image) => (
                    <figure key={image.id} className="w-32">
                      <img
                        src={image.imageUrl}
                        alt={image.caption ?? ''}
                        className="h-24 w-32 rounded-md object-cover"
                      />
                      {image.caption && (
                        <figcaption className="mt-1 text-xs text-muted-foreground">
                          {image.caption}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              )}

              {question.currentVersion.options.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {question.currentVersion.options.map((option) => (
                    <li
                      key={option.id}
                      className={cn(
                        'flex items-center gap-3 rounded-md border p-2.5 text-sm',
                        option.isCorrect
                          ? 'border-status-success-fg/30 bg-status-success-bg'
                          : 'border-border',
                      )}
                    >
                      <span className="flex-1 text-foreground">{option.optionText}</span>
                      {option.imageUrl && (
                        <img
                          src={option.imageUrl}
                          alt=""
                          className="size-12 shrink-0 rounded object-cover"
                        />
                      )}
                      {option.isCorrect && (
                        <span className="shrink-0 text-xs font-medium text-status-success-fg">
                          Correct
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

      <Card className="p-3.5">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Workflow
        </h2>
        <div className="mt-3">
          <QuestionWorkflowActions questionId={question.id} status={question.status} />
        </div>
      </Card>

      <EditQuestionDialog question={question} open={isEditOpen} onOpenChange={setIsEditOpen} />

      <DeleteQuestionDialog
        question={question}
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onDeleted={() => navigate('..')}
      />
    </div>
  )
}
