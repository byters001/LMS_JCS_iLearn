import { motion } from 'framer-motion'
import { UserCheck, UserPlus, Users, UserX } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { STAT_CONTAINER_VARIANTS, STAT_ITEM_VARIANTS, STATIC_VARIANTS } from '@/lib/motion'
import { AddFacultyDialog } from '../components/AddFacultyDialog'
import { EditFacultyDialog } from '../components/EditFacultyDialog'
import { useUpdateUser, useUsers } from '../api'
import type { SafeUser } from '../types'

const PAGE_SIZE = 20

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
  const prefersReducedMotion = usePrefersReducedMotion()

  const faculty = useUsers({ roleSlug: 'faculty', page, pageSize: PAGE_SIZE })
  // Platform-wide active count, not scoped to the current page — same
  // "separate page:1/pageSize:1 probe against the real filtered total"
  // pattern StudentListPage.tsx's activeCountQuery uses, since
  // faculty.data.items is only the current PAGE_SIZE=20 page and would
  // silently undercount once faculty spans more than one page.
  const activeFacultyQuery = useUsers({ roleSlug: 'faculty', isActive: true, page: 1, pageSize: 1 })
  const updateUser = useUpdateUser()

  const totalCount = faculty.data?.total
  const activeCount = activeFacultyQuery.data?.total
  const inactiveCount =
    totalCount !== undefined && activeCount !== undefined ? totalCount - activeCount : undefined

  const totalPages = faculty.data
    ? Math.max(1, Math.ceil(faculty.data.total / faculty.data.pageSize))
    : 1

  function handleToggleActive(user: SafeUser) {
    updateUser.mutate({ id: user.id, input: { isActive: !user.isActive } })
  }

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Faculty"
        description="Faculty accounts across the platform."
        actions={
          <Button onClick={() => setIsAddOpen(true)} className="gap-1.5">
            <UserPlus className="size-4" />
            Add Faculty
          </Button>
        }
      >
        <motion.div
          initial="hidden"
          animate="show"
          variants={prefersReducedMotion ? STATIC_VARIANTS : STAT_CONTAINER_VARIANTS}
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <motion.div variants={prefersReducedMotion ? STATIC_VARIANTS : STAT_ITEM_VARIANTS}>
            <StatCard
              label="Total faculty"
              value={totalCount}
              icon={Users}
              iconClassName="bg-primary/10 text-primary"
              accent="indigo"
              progress={
                activeCount !== undefined && totalCount !== undefined
                  ? { value: activeCount, total: totalCount }
                  : undefined
              }
            />
          </motion.div>
          <motion.div variants={prefersReducedMotion ? STATIC_VARIANTS : STAT_ITEM_VARIANTS}>
            <StatCard
              label="Active"
              value={activeCount}
              icon={UserCheck}
              iconClassName="bg-status-success-bg text-status-success-fg"
              accent="teal"
            />
          </motion.div>
          <motion.div variants={prefersReducedMotion ? STATIC_VARIANTS : STAT_ITEM_VARIANTS}>
            <StatCard
              label="Inactive"
              value={inactiveCount}
              icon={UserX}
              iconClassName="bg-muted text-muted-foreground"
              accent="coral"
            />
          </motion.div>
        </motion.div>
      </PageHeader>

      {faculty.isPending && (
        <div className="space-y-2" role="status" aria-label="Loading faculty">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {faculty.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
          {faculty.error instanceof ApiError
            ? faculty.error.message
            : 'Failed to load faculty. Please try again.'}
        </div>
      )}

      {faculty.data && faculty.data.items.length === 0 && (
        <Card className="p-3.5">
          <EmptyState
            icon={Users}
            message="No faculty accounts yet."
            action={
              <Button size="sm" onClick={() => setIsAddOpen(true)}>
                Add Faculty
              </Button>
            }
          />
        </Card>
      )}

      {faculty.data && faculty.data.items.length > 0 && (
        <Card className="gap-0 overflow-hidden p-0">
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
              {faculty.data.items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="pl-4 font-medium text-foreground">{user.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? 'success' : 'neutral'}>
                      {user.isActive ? 'active' : 'inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditUser(user)}>
                        Edit
                      </Button>
                      <Button
                        variant={user.isActive ? 'destructive' : 'outline'}
                        size="sm"
                        disabled={updateUser.isPending}
                        onClick={() => handleToggleActive(user)}
                        className={
                          user.isActive ? undefined : 'border-primary text-primary hover:bg-primary/5'
                        }
                      >
                        {user.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {updateUser.isError && (
            <p className="px-4 py-2 text-sm text-destructive">
              {updateUser.error instanceof ApiError
                ? updateUser.error.message
                : 'Failed to update faculty status.'}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-border bg-muted/10 px-3.5 py-2.5">
            <p className="text-sm text-muted-foreground">
              Page {faculty.data.page} of {totalPages} &middot; {faculty.data.total} faculty
              {faculty.isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-primary text-primary hover:bg-primary/5"
                disabled={page <= 1 || faculty.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-primary text-primary hover:bg-primary/5"
                disabled={page >= totalPages || faculty.isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
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
