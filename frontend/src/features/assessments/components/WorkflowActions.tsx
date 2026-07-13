import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import {
  useApproveAssessment,
  usePublishAssessment,
  useRejectAssessment,
  useScheduleAssessment,
  useSubmitAssessment,
} from '../api'
import type { AssessmentStatus } from '../types'

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

const notesFormSchema = z.object({ notes: z.string().optional() })
type NotesFormValues = z.infer<typeof notesFormSchema>

const scheduleFormSchema = z
  .object({
    startAt: z.string().min(1, 'Start date/time is required'),
    endAt: z.string().min(1, 'End date/time is required'),
    notes: z.string().optional(),
  })
  .refine((data) => new Date(data.startAt).getTime() < new Date(data.endAt).getTime(), {
    message: 'Start must be before end',
    path: ['endAt'],
  })
type ScheduleFormValues = z.infer<typeof scheduleFormSchema>

interface WorkflowActionsProps {
  assessmentId: string
  status: AssessmentStatus
}

// draft --submit--> review --approve--> approved --schedule--> scheduled --publish--> live
//                          \--reject--> draft
//
// Five dedicated buttons (Submit/Approve/Reject/Schedule/Publish), matching
// the backend's exact five-action shape — NOT collapsed into one generic
// "Advance" button. A generic button would hide which specific endpoint
// (and which specific business rule — e.g. schedule uniquely requiring
// startAt/endAt) is actually being invoked, and the five actions genuinely
// aren't interchangeable (reject is a branch, not a step in the main
// line). Only the action(s) valid for the CURRENT status render at all,
// rather than showing all five with four disabled — the backend enforces
// a strict linear state machine (assessments.service.ts's status checks),
// so a button for an action that isn't currently legal has no honest
// enabled state to be in.
export function WorkflowActions({ assessmentId, status }: WorkflowActionsProps) {
  const submitAssessment = useSubmitAssessment(assessmentId)
  const approveAssessment = useApproveAssessment(assessmentId)
  const rejectAssessment = useRejectAssessment(assessmentId)
  const scheduleAssessment = useScheduleAssessment(assessmentId)
  const publishAssessment = usePublishAssessment(assessmentId)

  const notesForm = useForm<NotesFormValues>({
    resolver: zodResolver(notesFormSchema),
    defaultValues: { notes: '' },
  })

  const scheduleForm = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: { startAt: '', endAt: '', notes: '' },
  })

  const activeError =
    submitAssessment.error ?? approveAssessment.error ?? rejectAssessment.error ?? publishAssessment.error

  if (status === 'draft') {
    return (
      <form
        onSubmit={notesForm.handleSubmit((values) =>
          submitAssessment.mutate({ notes: values.notes || undefined }),
        )}
        noValidate
        className="space-y-2"
      >
        <NotesField form={notesForm} />
        <Button type="submit" disabled={submitAssessment.isPending}>
          {submitAssessment.isPending ? 'Submitting…' : 'Submit for Review'}
        </Button>
        <ActionError error={activeError} />
      </form>
    )
  }

  if (status === 'review') {
    return (
      <div className="space-y-2">
        <NotesField form={notesForm} />
        <div className="flex gap-2">
          <Button
            disabled={approveAssessment.isPending || rejectAssessment.isPending}
            onClick={notesForm.handleSubmit((values) =>
              approveAssessment.mutate({ notes: values.notes || undefined }),
            )}
          >
            {approveAssessment.isPending ? 'Approving…' : 'Approve'}
          </Button>
          <Button
            variant="outline"
            disabled={approveAssessment.isPending || rejectAssessment.isPending}
            onClick={notesForm.handleSubmit((values) =>
              rejectAssessment.mutate({ notes: values.notes || undefined }),
            )}
          >
            {rejectAssessment.isPending ? 'Rejecting…' : 'Reject'}
          </Button>
        </div>
        <ActionError error={activeError} />
      </div>
    )
  }

  if (status === 'approved') {
    return (
      <form
        onSubmit={scheduleForm.handleSubmit((values) =>
          scheduleAssessment.mutate({
            startAt: new Date(values.startAt).toISOString(),
            endAt: new Date(values.endAt).toISOString(),
            notes: values.notes || undefined,
          }),
        )}
        noValidate
        className="space-y-2"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-brand-primary">Start</label>
            <input type="datetime-local" className={inputClassName} {...scheduleForm.register('startAt')} />
            {scheduleForm.formState.errors.startAt && (
              <p className="text-xs text-destructive">
                {scheduleForm.formState.errors.startAt.message}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-brand-primary">End</label>
            <input type="datetime-local" className={inputClassName} {...scheduleForm.register('endAt')} />
            {scheduleForm.formState.errors.endAt && (
              <p className="text-xs text-destructive">{scheduleForm.formState.errors.endAt.message}</p>
            )}
          </div>
        </div>
        <Button type="submit" disabled={scheduleAssessment.isPending}>
          {scheduleAssessment.isPending ? 'Scheduling…' : 'Schedule'}
        </Button>
        <ActionError error={scheduleAssessment.error} />
      </form>
    )
  }

  if (status === 'scheduled') {
    return (
      <form
        onSubmit={notesForm.handleSubmit((values) =>
          publishAssessment.mutate({ notes: values.notes || undefined }),
        )}
        noValidate
        className="space-y-2"
      >
        <NotesField form={notesForm} />
        <Button
          type="submit"
          disabled={publishAssessment.isPending}
          className="bg-brand-accent text-white hover:bg-brand-accent/90"
        >
          {publishAssessment.isPending ? 'Publishing…' : 'Publish'}
        </Button>
        <ActionError error={activeError} />
      </form>
    )
  }

  return (
    <p className="text-sm text-muted-foreground">
      This assessment is &quot;{status}&quot; — no further workflow actions are available.
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
