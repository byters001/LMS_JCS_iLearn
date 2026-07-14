import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { useApproveQuestion, useRejectQuestion, useSubmitQuestion } from '../api'
import type { QuestionStatus } from '../types'

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

const notesFormSchema = z.object({ notes: z.string().optional() })
type NotesFormValues = z.infer<typeof notesFormSchema>

interface QuestionWorkflowActionsProps {
  questionId: string
  status: QuestionStatus
}

// Mirrors features/assessments/components/WorkflowActions.tsx's pattern
// (only render the button(s) valid for the CURRENT status, not all of them
// disabled) but is its own component rather than a shared/reused one —
// the two state machines are genuinely different shapes, not just
// different labels on the same shape: assessments has five actions
// including a Schedule step with required startAt/endAt date fields;
// questions has three (submit/approve/reject), all sharing one
// notes-only ApprovalActionInput. Generalizing WorkflowActions into a
// config-driven state machine to cover both would be speculative
// abstraction for two call sites that don't actually share a shape.
export function QuestionWorkflowActions({ questionId, status }: QuestionWorkflowActionsProps) {
  const submitQuestion = useSubmitQuestion(questionId)
  const approveQuestion = useApproveQuestion(questionId)
  const rejectQuestion = useRejectQuestion(questionId)

  const notesForm = useForm<NotesFormValues>({
    resolver: zodResolver(notesFormSchema),
    defaultValues: { notes: '' },
  })

  const activeError = submitQuestion.error ?? approveQuestion.error ?? rejectQuestion.error

  // SUBMITTABLE_STATUSES on the backend is exactly ['draft', 'rejected'] —
  // a rejected question is resubmittable, not a dead end.
  if (status === 'draft' || status === 'rejected') {
    return (
      <form
        onSubmit={notesForm.handleSubmit((values) =>
          submitQuestion.mutate({ notes: values.notes || undefined }),
        )}
        noValidate
        className="space-y-3"
      >
        <NotesField form={notesForm} />
        <Button type="submit" disabled={submitQuestion.isPending}>
          {submitQuestion.isPending
            ? 'Submitting…'
            : status === 'rejected'
              ? 'Resubmit for Review'
              : 'Submit for Review'}
        </Button>
        <ActionError error={activeError} />
      </form>
    )
  }

  if (status === 'pending_review') {
    return (
      <div className="space-y-3">
        <NotesField form={notesForm} />
        <div className="flex gap-2">
          <Button
            disabled={approveQuestion.isPending || rejectQuestion.isPending}
            onClick={notesForm.handleSubmit((values) =>
              approveQuestion.mutate({ notes: values.notes || undefined }),
            )}
          >
            {approveQuestion.isPending ? 'Approving…' : 'Approve'}
          </Button>
          <Button
            variant="outline"
            disabled={approveQuestion.isPending || rejectQuestion.isPending}
            onClick={notesForm.handleSubmit((values) =>
              rejectQuestion.mutate({ notes: values.notes || undefined }),
            )}
          >
            {rejectQuestion.isPending ? 'Rejecting…' : 'Reject'}
          </Button>
        </div>
        <ActionError error={activeError} />
      </div>
    )
  }

  return (
    <p className="text-sm text-muted-foreground">
      This question is &quot;{status}&quot; — no further workflow actions are available.
    </p>
  )
}

function NotesField({ form }: { form: ReturnType<typeof useForm<NotesFormValues>> }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-brand-primary">
        Notes <span className="text-muted-foreground">(optional)</span>
      </label>
      <textarea rows={2} className={inputClassName} {...form.register('notes')} />
    </div>
  )
}

function ActionError({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p className="text-sm text-destructive">
      {error instanceof ApiError ? error.message : 'Action failed. Please try again.'}
    </p>
  )
}
