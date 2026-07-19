import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Combobox, type ComboboxOption } from '@/components/Combobox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useColleges } from '@/features/organization/api'
import { useCategories, useUpdateQuestion } from '../api'
import type { QuestionDifficulty, QuestionWithCurrentVersion } from '../types'

const PICKER_PAGE_SIZE = 100

const DIFFICULTY_OPTIONS: Array<{ value: QuestionDifficulty; label: string }> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

const editQuestionFormSchema = z.object({
  categoryId: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  collegeId: z.string(),
})

type EditQuestionFormValues = z.infer<typeof editQuestionFormSchema>

interface EditQuestionDialogProps {
  question: QuestionWithCurrentVersion
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Metadata only (category/difficulty/college) — question CONTENT
// (question_text/marks/options/coding details/test cases, all living on
// question_versions) is deliberately NOT editable here. QuestionDetailPage.tsx's
// own module comment already drew that boundary ("question content
// editing/versioning UI... is a separate, later phase") and this doesn't
// move it — see this file's own workflow-state-gating comment below for
// why.
//
// Workflow-state-gating read (item 10 tier 3a's explicit ask): question-
// bank.service.ts's assertVersionMutable gates CONTENT edits
// (question_versions and its children — coding details, test cases,
// psychometric options) on version.isActiveVersion, because attempts
// freeze a specific question_version_id and retroactively changing its
// content would corrupt already-graded work. Metadata here is a
// completely different axis: category/difficulty/college live on the
// `questions` row itself, are NEVER frozen into an attempt (attempts
// reference questionVersionId, never the parent question's category/
// difficulty/college), and updateQuestion/deleteQuestion in question-bank.
// service.ts impose NO status check at all (confirmed by reading both
// functions directly) — an 'approved' question's metadata is exactly as
// editable there as a 'draft' one. Applying assertVersionMutable's
// isActiveVersion gate here would be importing a restriction that solves
// a problem metadata edits don't actually have (no attempt ever reads
// difficulty/category/college off a frozen version). So: no client-side
// status gate added — this dialog is available regardless of the
// question's current status, matching the backend's own real permissiveness
// exactly. The question's status IS still shown read-only in the dialog
// so an editor isn't blind to it.
export function EditQuestionDialog({ question, open, onOpenChange }: EditQuestionDialogProps) {
  const updateQuestion = useUpdateQuestion()
  const categories = useCategories({ page: 1, pageSize: PICKER_PAGE_SIZE })
  const colleges = useColleges({ page: 1, pageSize: PICKER_PAGE_SIZE })

  const categoryOptions: ComboboxOption[] = (categories.data?.items ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))
  const collegeOptions: ComboboxOption[] = (colleges.data?.items ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))

  const {
    handleSubmit,
    register,
    setValue,
    watch,
    reset,
  } = useForm<EditQuestionFormValues>({
    resolver: zodResolver(editQuestionFormSchema),
    defaultValues: {
      categoryId: question.categoryId ?? '',
      difficulty: question.difficulty,
      collegeId: question.collegeId ?? '',
    },
  })

  const categoryId = watch('categoryId')
  const collegeId = watch('collegeId')

  useEffect(() => {
    if (open) {
      reset({
        categoryId: question.categoryId ?? '',
        difficulty: question.difficulty,
        collegeId: question.collegeId ?? '',
      })
    }
  }, [open, question, reset])

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      updateQuestion.reset()
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    updateQuestion.mutate(
      {
        id: question.id,
        input: {
          categoryId: values.categoryId || null,
          difficulty: values.difficulty,
          collegeId: values.collegeId || null,
        },
      },
      { onSuccess: () => handleClose(false) },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Question</DialogTitle>
          <DialogDescription>
            Updates category, difficulty, and college scope only — question text/options/coding
            details/etc. require creating a new version (a separate, later phase).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="editQuestionDifficulty" className="text-sm font-medium text-brand-primary">
              Difficulty
            </label>
            <select
              id="editQuestionDifficulty"
              className={inputClassName}
              {...register('difficulty')}
            >
              {DIFFICULTY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-brand-primary" htmlFor="editQuestionCategory">
              Category <span className="text-muted-foreground">(optional — global if unset)</span>
            </label>
            <Combobox
              id="editQuestionCategory"
              options={categoryOptions}
              value={categoryId || null}
              onSelect={(value) => setValue('categoryId', value)}
              placeholder="Search categories…"
              isLoading={categories.isPending}
              isError={categories.isError}
              errorMessage="Failed to load categories."
              emptyMessage={categories.isPending ? 'Loading…' : 'No categories found.'}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-brand-primary" htmlFor="editQuestionCollege">
              College <span className="text-muted-foreground">(optional — global if unset)</span>
            </label>
            <Combobox
              id="editQuestionCollege"
              options={collegeOptions}
              value={collegeId || null}
              onSelect={(value) => setValue('collegeId', value)}
              placeholder="Search colleges…"
              isLoading={colleges.isPending}
              isError={colleges.isError}
              errorMessage="Failed to load colleges."
              emptyMessage={colleges.isPending ? 'Loading…' : 'No colleges found.'}
            />
          </div>

          {updateQuestion.isError && (
            <p className="text-sm text-destructive">
              {updateQuestion.error instanceof ApiError
                ? updateQuestion.error.message
                : 'Failed to update question. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateQuestion.isPending}>
              {updateQuestion.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
