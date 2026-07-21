import { useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AddFacultyDialog } from '../components/AddFacultyDialog'
import { EditFacultyDialog } from '../components/EditFacultyDialog'
import { useUpdateUser, useUsers } from '../api'
import type { SafeUser } from '../types'

const PAGE_SIZE = 20

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={
        isActive
          ? 'rounded-full bg-brand-accent/10 px-2 py-0.5 text-xs font-medium text-brand-accent'
          : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
      }
    >
      {isActive ? 'active' : 'inactive'}
    </span>
  )
}

// Super Admin only — the route this page lives on is already gated by
// RequireRole (routes/index.tsx), same as every other /admin page.
// Deactivate/Reactivate reuses the EXISTING PATCH /users/:id { isActive }
// endpoint (useUpdateUser) rather than a new delete route — see
// backend/src/modules/users/users.routes.ts's own comment: users has FK
// fan-out (createdBy/updatedBy/assignedBy) across nearly every table in
// this schema, so hard-deleting a user would null out audit trails
// platform-wide. is_active is the same lever the batch-deactivation
// cascade already uses.
export default function FacultyListPage() {
  const [page, setPage] = useState(1)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editUser, setEditUser] = useState<SafeUser | null>(null)

  const faculty = useUsers({ roleSlug: 'faculty', page, pageSize: PAGE_SIZE })
  const updateUser = useUpdateUser()

  const totalPages = faculty.data
    ? Math.max(1, Math.ceil(faculty.data.total / faculty.data.pageSize))
    : 1

  function handleToggleActive(user: SafeUser) {
    updateUser.mutate({ id: user.id, input: { isActive: !user.isActive } })
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-semibold text-brand-primary">Faculty</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Faculty accounts across the platform.
          </p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>Add Faculty</Button>
      </div>

      {faculty.isPending && (
        <div className="space-y-2" role="status" aria-label="Loading faculty">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {faculty.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {faculty.error instanceof ApiError
            ? faculty.error.message
            : 'Failed to load faculty. Please try again.'}
        </div>
      )}

      {faculty.data && (
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {faculty.data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No faculty accounts yet.
                  </TableCell>
                </TableRow>
              ) : (
                faculty.data.items.map((user) => (
                  <TableRow key={user.id} className="hover:bg-muted/30">
                    <TableCell className="pl-4 font-medium text-brand-primary">
                      {user.fullName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <StatusBadge isActive={user.isActive} />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditUser(user)}>
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={updateUser.isPending}
                          onClick={() => handleToggleActive(user)}
                          className={
                            user.isActive
                              ? 'border-destructive text-destructive hover:bg-destructive/5'
                              : 'border-brand-primary text-brand-primary hover:bg-brand-primary/5'
                          }
                        >
                          {user.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {updateUser.isError && (
            <p className="px-4 py-2 text-sm text-destructive">
              {updateUser.error instanceof ApiError
                ? updateUser.error.message
                : 'Failed to update faculty status.'}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-border bg-muted/10 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Page {faculty.data.page} of {totalPages} &middot; {faculty.data.total} faculty
              {faculty.isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page <= 1 || faculty.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page >= totalPages || faculty.isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <AddFacultyDialog open={isAddOpen} onOpenChange={setIsAddOpen} />

      {editUser && (
        <EditFacultyDialog
          user={editUser}
          open={editUser !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditUser(null)
          }}
        />
      )}
    </div>
  )
}
