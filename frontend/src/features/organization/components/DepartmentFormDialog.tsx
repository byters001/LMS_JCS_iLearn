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
import { Input } from '@/components/ui/input'
import { useCreateDepartment, useUpdateDepartment } from '../api'
import type { Department } from '../types'

const departmentFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().optional(),
})

type DepartmentFormValues = z.infer<typeof departmentFormSchema>

const EMPTY_VALUES: DepartmentFormValues = { name: '', code: '' }

interface DepartmentFormDialogProps {
  // null = create mode, a Department = edit mode. Same single-component
  // shape as CollegeFormDialog, for the same reason (identical form,
  // different mutation/payload only).
  department: Department | null
  // Fixed for the lifetime of this dialog — the college the department
  // belongs to (create) or already belongs to (edit; updateDepartmentSchema
  // has no collegeId field at all, confirmed by reading the real backend
  // schema — re-parenting isn't supported here, so this is display-only
  // context in edit mode, never sent as part of the PATCH body).
  collegeId: string
  collegeName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DepartmentFormDialog({
  department,
  collegeId,
  collegeName,
  open,
  onOpenChange,
}: DepartmentFormDialogProps) {
  const isEditMode = department !== null
  const createDepartment = useCreateDepartment()
  const updateDepartment = useUpdateDepartment()
  const mutation = isEditMode ? updateDepartment : createDepartment

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentFormSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (open) {
      reset(department ? { name: department.name, code: department.code ?? '' } : EMPTY_VALUES)
    }
  }, [open, department, reset])

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      mutation.reset()
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    const shared = { name: values.name, code: values.code || undefined }

    if (isEditMode) {
      updateDepartment.mutate(
        { id: department.id, input: shared },
        { onSuccess: () => handleClose(false) },
      )
    } else {
      createDepartment.mutate({ collegeId, ...shared }, { onSuccess: () => handleClose(false) })
    }
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Department' : 'Add Department'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? `Update ${department.name}.` : `Adds a new department under ${collegeName}.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="departmentName" className="text-sm font-medium text-brand-primary">
              Name
            </label>
            <Input id="departmentName" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="departmentCode" className="text-sm font-medium text-brand-primary">
              Code <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input id="departmentCode" {...register('code')} />
          </div>

          {mutation.isError && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof ApiError
                ? mutation.error.message
                : `Failed to ${isEditMode ? 'update' : 'create'} department. Please try again.`}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? isEditMode
                  ? 'Saving…'
                  : 'Creating…'
                : isEditMode
                  ? 'Save Changes'
                  : 'Add Department'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
