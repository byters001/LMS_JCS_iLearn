import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUpdateAssessment } from '../api'
import type { Assessment } from '../types'

// Same string-not-z.coerce pattern as CreateAssessmentPage.tsx's own
// comment explains — z.coerce.number()/z.preprocess broke useForm<T>'s
// generic inference against zodResolver there; kept identical here rather
// than risk the same break.
const optionalIntString = z
  .string()
  .optional()
  .refine((value) => !value || /^\d+$/.test(value), 'Must be a positive whole number')
const optionalNonNegativeNumberString = z
  .string()
  .optional()
  .refine((value) => !value || /^\d+(\.\d+)?$/.test(value), 'Must be a non-negative number')

function toOptionalInt(value: string | undefined): number | undefined {
  return value ? Number.parseInt(value, 10) : undefined
}
function toOptionalNumber(value: string | undefined): number | undefined {
  return value ? Number.parseFloat(value) : undefined
}

const editAssessmentFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  timerMinutes: optionalIntString,
  maxAttempts: optionalIntString,
  shuffleQuestions: z.boolean(),
  negativeMarking: z.boolean(),
  negativeMarkingValue: optionalNonNegativeNumberString,
  proctoringCameraRequired: z.boolean(),
  proctoringFullscreenRequired: z.boolean(),
  isPractice: z.boolean(),
})

type EditAssessmentFormValues = z.infer<typeof editAssessmentFormSchema>

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

interface EditAssessmentDialogProps {
  assessment: Assessment
  open: boolean
  onOpenChange: (open: boolean) => void
}

function toFormValues(assessment: Assessment): EditAssessmentFormValues {
  return {
    title: assessment.title,
    description: assessment.description ?? '',
    timerMinutes: assessment.timerMinutes ? String(assessment.timerMinutes) : '',
    maxAttempts: String(assessment.maxAttempts),
    shuffleQuestions: assessment.shuffleQuestions,
    negativeMarking: assessment.negativeMarking,
    negativeMarkingValue: assessment.negativeMarkingValue ?? '',
    proctoringCameraRequired: assessment.proctoringCameraRequired,
    proctoringFullscreenRequired: assessment.proctoringFullscreenRequired,
    isPractice: assessment.isPractice,
  }
}

// title/settings only — testCategory and trainingSessionId are excluded,
// matching the backend's updateAssessmentSchema exactly (see
// assessments.schema.ts's own comment: changing testCategory after
// sections/questions/pools already assume a fixed category would silently
// invalidate that content; trainingSessionId has no update path at all
// yet). startAt/endAt and batchIds are excluded too — startAt/endAt are
// owned by the Schedule workflow action (the only reachable place that can
// ever set them — see assessments.service.ts's scheduleAssessment
// comment), and batchIds has its own editor (BatchesEditor.tsx) with a
// wider editable window (assertBatchesEditable) than this dialog's fields
// (assertAssessmentEditable) — mixing the two into one form would imply
// they share a gate when they genuinely don't.
//
// Only ever rendered while status === 'draft' — AssessmentEditPage hides
// the trigger button entirely once content is locked (isContentEditable),
// same "hide, don't disable-and-409" pattern already used for
// AddSectionForm/AttachQuestionForm/AttachPoolForm on this same page.
export function EditAssessmentDialog({ assessment, open, onOpenChange }: EditAssessmentDialogProps) {
  const updateAssessment = useUpdateAssessment(assessment.id)

  const {
    handleSubmit,
    register,
    reset,
    watch,
    formState: { errors },
  } = useForm<EditAssessmentFormValues>({
    resolver: zodResolver(editAssessmentFormSchema),
    defaultValues: toFormValues(assessment),
  })

  useEffect(() => {
    if (open) {
      reset(toFormValues(assessment))
    }
  }, [open, assessment, reset])

  const negativeMarkingEnabled = watch('negativeMarking')

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      updateAssessment.reset()
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    updateAssessment.mutate(
      {
        title: values.title,
        description: values.description || null,
        timerMinutes: toOptionalInt(values.timerMinutes) ?? null,
        maxAttempts: toOptionalInt(values.maxAttempts),
        shuffleQuestions: values.shuffleQuestions,
        negativeMarking: values.negativeMarking,
        negativeMarkingValue: values.negativeMarking
          ? (toOptionalNumber(values.negativeMarkingValue) ?? null)
          : null,
        proctoringCameraRequired: values.proctoringCameraRequired,
        proctoringFullscreenRequired: values.proctoringFullscreenRequired,
        isPractice: values.isPractice,
      },
      { onSuccess: () => handleClose(false) },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Assessment</DialogTitle>
          <DialogDescription>
            Title and settings only — test category and training session can&apos;t be changed
            once sections may already assume them. Batches have their own editor below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="editAssessmentTitle" className="text-sm font-medium text-brand-primary">
              Title
            </label>
            <input id="editAssessmentTitle" className={inputClassName} {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="editAssessmentDescription"
              className="text-sm font-medium text-brand-primary"
            >
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="editAssessmentDescription"
              rows={3}
              className={inputClassName}
              {...register('description')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="editAssessmentTimerMinutes"
                className="text-sm font-medium text-brand-primary"
              >
                Timer (minutes) <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                id="editAssessmentTimerMinutes"
                type="number"
                min={1}
                className={inputClassName}
                {...register('timerMinutes')}
              />
              {errors.timerMinutes && (
                <p className="text-xs text-destructive">{errors.timerMinutes.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="editAssessmentMaxAttempts"
                className="text-sm font-medium text-brand-primary"
              >
                Max Attempts
              </label>
              <input
                id="editAssessmentMaxAttempts"
                type="number"
                min={1}
                className={inputClassName}
                {...register('maxAttempts')}
              />
              {errors.maxAttempts && (
                <p className="text-xs text-destructive">{errors.maxAttempts.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm text-brand-primary">
              <input type="checkbox" {...register('shuffleQuestions')} />
              Shuffle questions
            </label>
            <label className="flex items-center gap-2 text-sm text-brand-primary">
              <input type="checkbox" {...register('isPractice')} />
              Practice assessment (doesn&apos;t count toward real results)
            </label>
            <label className="flex items-center gap-2 text-sm text-brand-primary">
              <input type="checkbox" {...register('proctoringCameraRequired')} />
              Require camera proctoring
            </label>
            <label className="flex items-center gap-2 text-sm text-brand-primary">
              <input type="checkbox" {...register('proctoringFullscreenRequired')} />
              Require fullscreen proctoring
            </label>
            <label className="flex items-center gap-2 text-sm text-brand-primary">
              <input type="checkbox" {...register('negativeMarking')} />
              Negative marking
            </label>
            {negativeMarkingEnabled && (
              <div className="space-y-1.5 pl-6">
                <label
                  htmlFor="editAssessmentNegativeMarkingValue"
                  className="text-sm font-medium text-brand-primary"
                >
                  Marks deducted per wrong answer
                </label>
                <input
                  id="editAssessmentNegativeMarkingValue"
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputClassName}
                  {...register('negativeMarkingValue')}
                />
                {errors.negativeMarkingValue && (
                  <p className="text-xs text-destructive">{errors.negativeMarkingValue.message}</p>
                )}
              </div>
            )}
          </div>

          {updateAssessment.isError && (
            <p className="text-sm text-destructive">
              {updateAssessment.error instanceof ApiError
                ? updateAssessment.error.message
                : 'Failed to update assessment. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateAssessment.isPending}>
              {updateAssessment.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
