import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { useColleges } from '@/features/organization/api'
import { useCreateFacultyUser } from '../api'

const PICKER_PAGE_SIZE = 100

const addFacultyFormSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().email('Must be a valid email address'),
  password: z.string().min(8, 'Must be at least 8 characters'),
  // Optional — see backend users.schema.ts's createFacultyUserSchema
  // comment: college affiliation is assigned later via batch/training-
  // program trainer assignment, not required at account creation.
  collegeId: z.string().optional(),
})

type AddFacultyFormValues = z.infer<typeof addFacultyFormSchema>

interface AddFacultyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Deliberately email/fullName/password/collegeId only — matches
// backend/src/modules/users/users.schema.ts's createFacultyUserSchema
// exactly, which is narrow by design (always creates a Faculty account,
// not a generic any-role user creator).
export function AddFacultyDialog({ open, onOpenChange }: AddFacultyDialogProps) {
  const createFacultyUser = useCreateFacultyUser()
  const [collegeId, setCollegeId] = useState<string | null>(null)

  const colleges = useColleges({ page: 1, pageSize: PICKER_PAGE_SIZE })
  const collegeOptions: ComboboxOption[] = (colleges.data?.items ?? []).map((college) => ({
    value: college.id,
    label: college.name,
  }))

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AddFacultyFormValues>({
    resolver: zodResolver(addFacultyFormSchema),
    defaultValues: { fullName: '', email: '', password: '', collegeId: '' },
  })

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      reset()
      setCollegeId(null)
      createFacultyUser.reset()
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    createFacultyUser.mutate(
      { ...values, collegeId: values.collegeId || undefined },
      { onSuccess: () => handleClose(false) },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Faculty</DialogTitle>
          <DialogDescription>
            Creates a new Faculty account. College affiliation is optional here — it can be
            assigned later via batch or training-program trainer assignment.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="facultyFullName" className="text-sm font-medium text-brand-primary">
              Full Name
            </label>
            <Input id="facultyFullName" {...register('fullName')} />
            {errors.fullName && (
              <p className="text-xs text-destructive">{errors.fullName.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="facultyEmail" className="text-sm font-medium text-brand-primary">
              Email
            </label>
            <Input id="facultyEmail" type="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="facultyPassword" className="text-sm font-medium text-brand-primary">
              Password
            </label>
            {/* Plain text, not masked — same reasoning as CreateBatchPage's
                commonPassword field: the admin needs to hand this password
                to the new faculty member, not type a personal secret blind. */}
            <Input id="facultyPassword" type="text" {...register('password')} />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-brand-primary">
              College <span className="text-muted-foreground">(optional)</span>
            </p>
            <Combobox
              id="facultyCollegePicker"
              options={collegeOptions}
              value={collegeId}
              onSelect={(value) => {
                setCollegeId(value)
                setValue('collegeId', value, { shouldValidate: true })
              }}
              placeholder="Select a college — can be assigned later…"
              isLoading={colleges.isPending}
              isError={colleges.isError}
              errorMessage="Failed to load colleges."
            />
            {errors.collegeId && (
              <p className="text-xs text-destructive">{errors.collegeId.message}</p>
            )}
          </div>

          {createFacultyUser.isError && (
            <p className="text-sm text-destructive">
              {createFacultyUser.error instanceof ApiError
                ? createFacultyUser.error.message
                : 'Failed to create faculty account. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createFacultyUser.isPending}>
              {createFacultyUser.isPending ? 'Creating…' : 'Add Faculty'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
