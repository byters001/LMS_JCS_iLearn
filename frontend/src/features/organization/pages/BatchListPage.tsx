import { MoreVertical } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Combobox } from '@/components/Combobox'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { AddStudentsDialog } from '@/features/students/components/AddStudentsDialog'
import { DownloadCsvDialog } from '@/features/students/components/DownloadCsvDialog'
import { useAuthStore } from '@/store/authStore'
import { useBatches, useColleges, useDepartments, useToggleBatchActive } from '../api'
import type { Batch } from '../types'

const PAGE_SIZE = 20
// Generous upper bound for the college picker below — colleges are a
// platform-wide, slow-growing entity (not paginated in the UI at all here),
// same "small enough to just fetch in one page" call as BatchesEditor.tsx's
// own BATCH_PICKER_PAGE_SIZE.
const COLLEGE_PICKER_PAGE_SIZE = 100

function StatusBadge({ status }: { status: Batch['status'] }) {
  if (status === 'active') {
    return (
      <span className="shrink-0 rounded-full bg-brand-accent/10 px-2 py-0.5 text-xs font-medium text-brand-accent">
        active
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {status}
    </span>
  )
}

export default function BatchListPage() {
  const user = useAuthStore((state) => state.user)
  const isSuperAdmin = user?.roles.includes('super_admin') ?? false

  const [collegeId, setCollegeId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [addStudentsBatch, setAddStudentsBatch] = useState<Batch | null>(null)
  const [downloadCsvBatch, setDownloadCsvBatch] = useState<Batch | null>(null)

  const colleges = useColleges({ page: 1, pageSize: COLLEGE_PICKER_PAGE_SIZE })
  const collegeOptions = (colleges.data?.items ?? []).map((college) => ({
    value: college.id,
    label: college.name,
  }))

  const batches = useBatches(
    { collegeId: collegeId ?? '', page, pageSize: PAGE_SIZE },
    { enabled: collegeId !== null },
  )
  const toggleActive = useToggleBatchActive()

  // Every batch on this page already belongs to the one selected college,
  // so one departments fetch (for the Download CSV dialog's department
  // filter) covers all of them — no per-card fetch needed.
  const departments = useDepartments(
    { collegeId: collegeId ?? '', page: 1, pageSize: 100 },
    { enabled: collegeId !== null },
  )
  const departmentOptions = (departments.data?.items ?? []).map((department) => ({
    id: department.id,
    name: department.name,
  }))

  const totalPages = batches.data
    ? Math.max(1, Math.ceil(batches.data.total / batches.data.pageSize))
    : 1

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-brand-primary">Batches</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Training cohorts within a college, grouped by training program.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/batches/new">Create Batch</Link>
        </Button>
      </div>

      {/* Temporary stand-in for a real top-bar college switcher — explicitly
          deferred from Phase 1 (it depends on this exact scoping work, which
          didn't exist until now). Once a shared switcher exists, this
          in-page picker goes away and collegeId comes from that shared
          context instead — not a permanent design. */}
      <div className="max-w-sm">
        <p className="mb-1 text-xs font-medium text-muted-foreground">College</p>
        <Combobox
          id="batchListCollegePicker"
          options={collegeOptions}
          value={collegeId}
          onSelect={(value) => {
            setCollegeId(value)
            setPage(1)
          }}
          placeholder="Select a college to view its batches…"
          isLoading={colleges.isPending}
          isError={colleges.isError}
          errorMessage="Failed to load colleges."
        />
      </div>

      {collegeId === null && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Select a college above to view its batches.
        </p>
      )}

      {collegeId !== null && batches.isPending && (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-label="Loading batches"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {collegeId !== null && batches.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {batches.error instanceof ApiError
            ? batches.error.message
            : 'Failed to load batches. Please try again.'}
        </div>
      )}

      {collegeId !== null && batches.data && batches.data.items.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No batches found for this college yet.
        </p>
      )}

      {collegeId !== null && batches.data && batches.data.items.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {batches.data.items.map((batch) => (
              <div
                key={batch.id}
                className="rounded-xl border border-border bg-background p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-brand-primary">{batch.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {batch.collegeName} · {batch.departmentName}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusBadge status={batch.status} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Actions for ${batch.name}`}
                          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-brand-primary"
                        >
                          <MoreVertical className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setAddStudentsBatch(batch)}>
                          Add Students
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setDownloadCsvBatch(batch)}>
                          Download CSV
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {batch.studentCount} student{batch.studentCount === 1 ? '' : 's'}
                    {batch.maxStudents ? ` / ${batch.maxStudents} max` : ''}
                  </p>
                  {/* Super Admin only — matches the backend's
                      batches.toggle_active permission, granted only to
                      super_admin (see organization.routes.ts). Hidden
                      entirely for 'completed' batches: that's a permanent
                      lifecycle end-state, not something this toggle should
                      offer to reopen (the backend rejects it too — this is
                      just not offering a control that would 409). */}
                  {isSuperAdmin && batch.status !== 'completed' && (
                    <Switch
                      checked={batch.status === 'active'}
                      disabled={toggleActive.isPending}
                      onCheckedChange={() => toggleActive.mutate(batch.id)}
                      aria-label={batch.status === 'active' ? 'Set batch inactive' : 'Set batch active'}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {toggleActive.isError && (
            <p className="text-sm text-destructive">
              {toggleActive.error instanceof ApiError
                ? toggleActive.error.message
                : 'Failed to update batch status.'}
            </p>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {batches.data.page} of {totalPages} &middot; {batches.data.total} batch
              {batches.data.total === 1 ? '' : 'es'}
              {batches.isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page <= 1 || batches.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page >= totalPages || batches.isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {addStudentsBatch && (
        <AddStudentsDialog
          batchId={addStudentsBatch.id}
          batchName={addStudentsBatch.name}
          open={addStudentsBatch !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setAddStudentsBatch(null)
          }}
        />
      )}

      {downloadCsvBatch && (
        <DownloadCsvDialog
          batchId={downloadCsvBatch.id}
          batchName={downloadCsvBatch.name}
          departmentOptions={departmentOptions}
          open={downloadCsvBatch !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setDownloadCsvBatch(null)
          }}
        />
      )}
    </div>
  )
}
