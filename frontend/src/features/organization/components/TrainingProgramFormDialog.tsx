import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Combobox } from '@/components/Combobox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useCreateTrainingProgram, useDepartments } from '../api'
import type { TrainingProgram } from '../types'

const DEPARTMENT_PICKER_PAGE_SIZE = 100

const trainingProgramFormSchema = z.object({
  departmentId: z.string().min(1, 'Select a department'),
  name: z.string().min(1, 'Name is required'),
})

type TrainingProgramFormValues = z.infer<typeof trainingProgramFormSchema>

const EMPTY_VALUES: TrainingProgramFormValues = { departmentId: '', name: '' }

interface TrainingProgramFormDialogProps {
  // Fixed for the lifetime of this dialog — the college the new program is
  // scoped to. Create-only (item 1's ask is "let me create one without
  // leaving the flow", not a full training-program editor), matching
  // createTrainingProgramSchema exactly: collegeId + departmentId + name
  // required, academicYearId/description/dates optional and omitted here
  // since there's no academic-years frontend surface yet to pick one from.
  collegeId: string
  collegeName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  // Lets callers (CreateBatchPage's "+ New Program") select the freshly
  // created program immediately instead of making the admin re-open the
  // picker and find it themselves.
  onCreated?: (program: TrainingProgram) => void
}

export function TrainingProgramFormDialog({
  collegeId,
  collegeName,
  open,
  onOpenChange,
  onCreated,
}: TrainingProgramFormDialogProps) {
  const createTrainingProgram = useCreateTrainingProgram()

  const departments = useDepartments(
    { collegeId, page: 1, pageSize: DEPARTMENT_PICKER_PAGE_SIZE },
    { enabled: open },
  )
  const departmentOptions = (departments.data?.items ?? []).map((department) => ({
    value: department.id,
    label: department.name,
  }))

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TrainingProgramFormValues>({
    resolver: zodResolver(trainingProgramFormSchema),
    defaultValues: EMPTY_VALUES,
  })

  const departmentId = watch('departmentId')

  useEffect(() => {
    if (open) {
      reset(EMPTY_VALUES)
    }
  }, [open, reset])

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      createTrainingProgram.reset()
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    createTrainingProgram.mutate(
      { collegeId, departmentId: values.departmentId, name: values.name },
      {
        onSuccess: (program) => {
          onCreated?.(program)
          handleClose(false)
        },
      },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Training Program</DialogTitle>
          <DialogDescription>Adds a new training program under {collegeName}.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="trainingProgramDepartment"
              className="text-sm font-medium text-brand-primary"
            >
              Department
            </label>
            <Combobox
              id="trainingProgramDepartment"
              options={departmentOptions}
              value={departmentId || null}
              onSelect={(value) => setValue('departmentId', value, { shouldValidate: true })}
              placeholder="Select a department…"
              isLoading={departments.isPending}
              isError={departments.isError}
              errorMessage="Failed to load departments."
              emptyMessage={
                departments.isPending ? 'Loading…' : 'No departments found for this college yet.'
              }
            />
            {errors.departmentId && (
              <p className="text-xs text-destructive">{errors.departmentId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="trainingProgramName"
              className="text-sm font-medium text-brand-primary"
            >
              Name
            </label>
            <Input id="trainingProgramName" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {createTrainingProgram.isError && (
            <p className="text-sm text-destructive">
              {createTrainingProgram.error instanceof ApiError
                ? createTrainingProgram.error.message
                : 'Failed to create training program. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTrainingProgram.isPending}>
              {createTrainingProgram.isPending ? 'Creating…' : 'Create Program'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
