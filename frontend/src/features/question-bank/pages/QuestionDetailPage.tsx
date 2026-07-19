import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
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

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// Minimal by design — question content editing/versioning UI (options/
// codingDetails/testCases/psychometricOptions display and edit) is a
// separate, later phase (see CreateQuestionPage.tsx's module comment on
// scope discipline). This exists specifically to host the workflow-status
// actions QuestionListPage had nowhere to link to, since that list is
// explicitly read-only with no click-through of its own.
export default function QuestionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: question, isLoading, isError, error } = useQuestionDetail(id)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading question…</p>
      </div>
    )
  }

  if (isError || !question) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : "Couldn't load this question."}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link to=".." className="text-sm text-brand-accent hover:underline">
        &larr; Back to questions
      </Link>

      <div className="mt-3 rounded-xl border border-border bg-background p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <p className="text-base text-brand-primary">
            {question.currentVersion?.questionText ?? '—'}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <QuestionStatusBadge status={question.status} />
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive text-destructive hover:bg-destructive/5"
            onClick={() => setIsDeleteOpen(true)}
          >
            Delete
          </Button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="font-medium text-brand-primary">{TYPE_LABELS[question.type]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Difficulty</dt>
            <dd className="font-medium text-brand-primary">
              {DIFFICULTY_LABELS[question.difficulty]}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Marks</dt>
            <dd className="font-medium text-brand-primary">
              {question.currentVersion?.marks ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="font-medium text-brand-primary">{formatDate(question.createdAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Workflow
        </h2>
        <div className="mt-4">
          <QuestionWorkflowActions questionId={question.id} status={question.status} />
        </div>
      </div>

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
