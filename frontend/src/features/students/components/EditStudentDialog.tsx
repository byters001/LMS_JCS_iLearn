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
import { useUpdateStudentProfile } from '../api'
import type { StudentProfile } from '../types'

// Same "validated-but-blankable optional string" convention
// CollegeFormDialog.tsx's optionalUrlString/optionalEmailString established
// — react-hook-form's registered inputs are always strings, so an unset
// optional field is '', not undefined.
const optionalUrlString = z
  .string()
  .optional()
  .refine((value) => !value || /^https?:\/\/.+/.test(value), 'Must be a valid URL (http/https)')
const optionalEmailString = z
  .string()
  .optional()
  .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Must be a valid email')

const editStudentFormSchema = z.object({
  rollNumber: z.string().optional(),
  photoUrl: optionalUrlString,
  contactEmailAlt: optionalEmailString,
  contactPhone: z.string().optional(),
})

type EditStudentFormValues = z.infer<typeof editStudentFormSchema>

interface EditStudentDialogProps {
  student: StudentProfile
  open: boolean
  onOpenChange: (open: boolean) => void
}

// userId/collegeId/departmentId/status are deliberately NOT editable here —
// matches updateStudentProfileSchema's real surface exactly (students.
// repository.ts's own comment: a department/college transfer is a
// deliberate action, not a casual profile edit, not exposed in this
// phase). status/archiving is StudentRosterTable's separate Archive/
// Reactivate button, not folded into this form, matching item 10 tier 2's
// own "Edit... and Deactivate/Archive..." as two distinct asks.
export function EditStudentDialog({ student, open, onOpenChange }: EditStudentDialogProps) {
  const updateStudentProfile = useUpdateStudentProfile()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditStudentFormValues>({
    resolver: zodResolver(editStudentFormSchema),
    defaultValues: {
      rollNumber: student.rollNumber ?? '',
      photoUrl: student.photoUrl ?? '',
      contactEmailAlt: student.contactEmailAlt ?? '',
      contactPhone: student.contactPhone ?? '',
    },
  })

  // Re-syncs whenever a different student is opened for editing — the
  // dialog instance persists across opens (StudentRosterTable renders it
  // once, toggling `open`), same reasoning as CollegeFormDialog.tsx's own
  // effect.
  useEffect(() => {
    if (open) {
      reset({
        rollNumber: student.rollNumber ?? '',
        photoUrl: student.photoUrl ?? '',
        contactEmailAlt: student.contactEmailAlt ?? '',
        contactPhone: student.contactPhone ?? '',
      })
    }
  }, [open, student, reset])

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      updateStudentProfile.reset()
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    updateStudentProfile.mutate(
      {
        id: student.id,
        input: {
          rollNumber: values.rollNumber || undefined,
          photoUrl: values.photoUrl || undefined,
          contactEmailAlt: values.contactEmailAlt || undefined,
          contactPhone: values.contactPhone || undefined,
        },
      },
      { onSuccess: () => handleClose(false) },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Student</DialogTitle>
          <DialogDescription>
            Updating {student.fullName ?? 'this student'}&apos;s profile details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="studentRollNumber" className="text-sm font-medium text-brand-primary">
              Roll Number <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input id="studentRollNumber" {...register('rollNumber')} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="studentContactEmailAlt"
                className="text-sm font-medium text-brand-primary"
              >
                Alternate Email <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input id="studentContactEmailAlt" type="email" {...register('contactEmailAlt')} />
              {errors.contactEmailAlt && (
                <p className="text-xs text-destructive">{errors.contactEmailAlt.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="studentContactPhone"
                className="text-sm font-medium text-brand-primary"
              >
                Contact Phone <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input id="studentContactPhone" {...register('contactPhone')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="studentPhotoUrl" className="text-sm font-medium text-brand-primary">
              Photo URL <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input id="studentPhotoUrl" type="url" {...register('photoUrl')} />
            {errors.photoUrl && (
              <p className="text-xs text-destructive">{errors.photoUrl.message}</p>
            )}
          </div>

          {updateStudentProfile.isError && (
            <p className="text-sm text-destructive">
              {updateStudentProfile.error instanceof ApiError
                ? updateStudentProfile.error.message
                : 'Failed to update student. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateStudentProfile.isPending}>
              {updateStudentProfile.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
