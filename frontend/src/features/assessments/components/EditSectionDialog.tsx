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
import { useUpdateSection } from '../api'
import type { AssessmentSection } from '../types'

// Same string-not-z.coerce pattern as CreateAssessmentPage.tsx / AddSectionForm.tsx.
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

const editSectionFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  instructions: z.string().optional(),
  sectionOrder: optionalIntString,
  timerMinutes: optionalIntString,
  passingMarks: optionalNonNegativeNumberString,
  negativeMarking: z.boolean(),
  negativeMarkingValue: optionalNonNegativeNumberString,
  shuffleQuestions: z.boolean(),
})

type EditSectionFormValues = z.infer<typeof editSectionFormSchema>

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

interface EditSectionDialogProps {
  assessmentId: string
  section: AssessmentSection
  open: boolean
  onOpenChange: (open: boolean) => void
}

function toFormValues(section: AssessmentSection): EditSectionFormValues {
  return {
    title: section.title,
    instructions: section.instructions ?? '',
    sectionOrder: String(section.sectionOrder),
    timerMinutes: section.timerMinutes ? String(section.timerMinutes) : '',
    passingMarks: section.passingMarks ?? '',
    negativeMarking: section.negativeMarking,
    negativeMarkingValue: section.negativeMarkingValue ?? '',
    shuffleQuestions: section.shuffleQuestions,
  }
}

// selectionMode is deliberately not on this form — see
// UpdateAssessmentSectionInput's own comment in types.ts for why it stays
// fixed after creation. Only ever rendered while the parent assessment is
// still 'draft' (AssessmentEditPage's isContentEditable), same hide-not-
// disable convention as every other content-editing control on that page.
export function EditSectionDialog({
  assessmentId,
  section,
  open,
  onOpenChange,
}: EditSectionDialogProps) {
  const updateSection = useUpdateSection(assessmentId)

  const {
    handleSubmit,
    register,
    reset,
    watch,
    formState: { errors },
  } = useForm<EditSectionFormValues>({
    resolver: zodResolver(editSectionFormSchema),
    defaultValues: toFormValues(section),
  })

  useEffect(() => {
    if (open) {
      reset(toFormValues(section))
    }
  }, [open, section, reset])

  const negativeMarkingEnabled = watch('negativeMarking')

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      updateSection.reset()
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    updateSection.mutate(
      {
        sectionId: section.id,
        input: {
          title: values.title,
          instructions: values.instructions || null,
          sectionOrder: toOptionalInt(values.sectionOrder),
          timerMinutes: toOptionalInt(values.timerMinutes) ?? null,
          passingMarks: toOptionalNumber(values.passingMarks) ?? null,
          negativeMarking: values.negativeMarking,
          negativeMarkingValue: values.negativeMarking
            ? (toOptionalNumber(values.negativeMarkingValue) ?? null)
            : null,
          shuffleQuestions: values.shuffleQuestions,
        },
      },
      { onSuccess: () => handleClose(false) },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Section</DialogTitle>
          <DialogDescription>
            Selection mode ({section.selectionMode === 'manual' ? 'Manual' : 'Pool'}) can&apos;t be
            changed here — delete and recreate the section if it needs to switch.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="editSectionTitle" className="text-sm font-medium text-brand-primary">
              Title
            </label>
            <input id="editSectionTitle" className={inputClassName} {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="editSectionInstructions"
              className="text-sm font-medium text-brand-primary"
            >
              Instructions <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="editSectionInstructions"
              rows={2}
              className={inputClassName}
              {...register('instructions')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="editSectionOrder"
                className="text-sm font-medium text-brand-primary"
              >
                Sort Order
              </label>
              <input
                id="editSectionOrder"
                type="number"
                min={0}
                className={inputClassName}
                {...register('sectionOrder')}
              />
              {errors.sectionOrder && (
                <p className="text-xs text-destructive">{errors.sectionOrder.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="editSectionTimerMinutes"
                className="text-sm font-medium text-brand-primary"
              >
                Timer (minutes) <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                id="editSectionTimerMinutes"
                type="number"
                min={1}
                className={inputClassName}
                {...register('timerMinutes')}
              />
              {errors.timerMinutes && (
                <p className="text-xs text-destructive">{errors.timerMinutes.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="editSectionPassingMarks"
              className="text-sm font-medium text-brand-primary"
            >
              Passing Marks <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="editSectionPassingMarks"
              type="number"
              min={0}
              step="0.01"
              className={inputClassName}
              {...register('passingMarks')}
            />
            {errors.passingMarks && (
              <p className="text-xs text-destructive">{errors.passingMarks.message}</p>
            )}
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm text-brand-primary">
              <input type="checkbox" {...register('shuffleQuestions')} />
              Shuffle questions
            </label>
            <label className="flex items-center gap-2 text-sm text-brand-primary">
              <input type="checkbox" {...register('negativeMarking')} />
              Negative marking
            </label>
            {negativeMarkingEnabled && (
              <div className="space-y-1.5 pl-6">
                <label
                  htmlFor="editSectionNegativeMarkingValue"
                  className="text-sm font-medium text-brand-primary"
                >
                  Marks deducted per wrong answer
                </label>
                <input
                  id="editSectionNegativeMarkingValue"
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

          {updateSection.isError && (
            <p className="text-sm text-destructive">
              {updateSection.error instanceof ApiError
                ? updateSection.error.message
                : 'Failed to update section. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateSection.isPending}>
              {updateSection.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
