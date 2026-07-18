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
import { useUpdateUser } from '../api'
import type { SafeUser } from '../types'

const editFacultyFormSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
})

type EditFacultyFormValues = z.infer<typeof editFacultyFormSchema>

interface EditFacultyDialogProps {
  user: SafeUser
  open: boolean
  onOpenChange: (open: boolean) => void
}

// fullName only — matches updateUserSchema's real surface exactly
// (users.schema.ts: only fullName/isActive are accepted at all, confirmed
// by reading the real schema, not assumed). Email is NOT editable here,
// and deliberately not just a UI choice: there is no email field anywhere
// in updateUserSchema, so the backend has no path to change it regardless
// of what this dialog might offer. That's the right call independent of
// the schema gap too — email is the login identifier (POST /auth/login
// looks a user up by it) and this codebase has no re-verification/
// email-change-confirmation flow at all; silently letting an admin
// repoint someone's login email with no confirmation step would be a
// account-lockout/takeover footgun, not a convenience. isActive stays
// FacultyListPage's own separate Deactivate/Reactivate button, same
// "one field, one dedicated control" split EditBatchDialog.tsx makes for
// batch status.
export function EditFacultyDialog({ user, open, onOpenChange }: EditFacultyDialogProps) {
  const updateUser = useUpdateUser()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditFacultyFormValues>({
    resolver: zodResolver(editFacultyFormSchema),
    defaultValues: { fullName: user.fullName },
  })

  useEffect(() => {
    if (open) {
      reset({ fullName: user.fullName })
    }
  }, [open, user, reset])

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      updateUser.reset()
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    updateUser.mutate(
      { id: user.id, input: { fullName: values.fullName } },
      { onSuccess: () => handleClose(false) },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Faculty</DialogTitle>
          <DialogDescription>
            Update {user.fullName}&apos;s name. Email can&apos;t be changed here — it's this
            account's login identifier.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-brand-primary">Email</p>
            <p className="rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
              {user.email}
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="facultyEditFullName" className="text-sm font-medium text-brand-primary">
              Full Name
            </label>
            <Input id="facultyEditFullName" {...register('fullName')} />
            {errors.fullName && (
              <p className="text-xs text-destructive">{errors.fullName.message}</p>
            )}
          </div>

          {updateUser.isError && (
            <p className="text-sm text-destructive">
              {updateUser.error instanceof ApiError
                ? updateUser.error.message
                : 'Failed to update faculty account. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateUser.isPending}>
              {updateUser.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
