import { useState } from 'react'
import { ApiError } from '@/api'
import { Combobox } from '@/components/Combobox'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useColleges, useDepartments } from '../api'
import { DeleteDepartmentDialog } from '../components/DeleteDepartmentDialog'
import { DepartmentFormDialog } from '../components/DepartmentFormDialog'
import type { Department } from '../types'

const PAGE_SIZE = 20
// Colleges are a platform-wide, slow-growing entity, not paginated in the
// UI anywhere else either — same "small enough to just fetch in one page"
// call as BatchListPage.tsx's own COLLEGE_PICKER_PAGE_SIZE.
const COLLEGE_PICKER_PAGE_SIZE = 100

// Item 10 tier 1 — departments had zero frontend surface before this
// (confirmed by the item 10 audit: GET-only, picker-consumed, no
// dedicated page). Self-contained (owns its own college picker/state)
// rather than requiring a collegeId prop from a parent — mirrors
// BatchListPage.tsx's exact "pick a college via Combobox, then browse/
// manage its scoped list" shape, reused as-is rather than inventing a new
// layout for what's structurally the same page.
export default function DepartmentListPage() {
  const [collegeId, setCollegeId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [formDepartment, setFormDepartment] = useState<Department | null | undefined>(undefined)
  const [deleteDepartment, setDeleteDepartment] = useState<Department | null>(null)

  const colleges = useColleges({ page: 1, pageSize: COLLEGE_PICKER_PAGE_SIZE })
  const collegeOptions = (colleges.data?.items ?? []).map((college) => ({
    value: college.id,
    label: college.name,
  }))
  const selectedCollege = colleges.data?.items.find((college) => college.id === collegeId)

  const departments = useDepartments(
    { collegeId: collegeId ?? '', page, pageSize: PAGE_SIZE },
    { enabled: collegeId !== null },
  )

  const totalPages = departments.data
    ? Math.max(1, Math.ceil(departments.data.total / departments.data.pageSize))
    : 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="max-w-sm flex-1">
          <p className="mb-1 text-xs font-medium text-muted-foreground">College</p>
          <Combobox
            id="departmentListCollegePicker"
            options={collegeOptions}
            value={collegeId}
            onSelect={(value) => {
              setCollegeId(value)
              setPage(1)
            }}
            placeholder="Select a college to view its departments…"
            isLoading={colleges.isPending}
            isError={colleges.isError}
            errorMessage="Failed to load colleges."
          />
        </div>
        <Button
          disabled={collegeId === null}
          onClick={() => setFormDepartment(null)}
        >
          Add Department
        </Button>
      </div>

      {collegeId === null && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Select a college above to view its departments.
        </p>
      )}

      {collegeId !== null && departments.isPending && (
        <div className="space-y-2" role="status" aria-label="Loading departments">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {collegeId !== null && departments.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {departments.error instanceof ApiError
            ? departments.error.message
            : 'Failed to load departments. Please try again.'}
        </div>
      )}

      {collegeId !== null && departments.data && (
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No departments found for this college yet.
                  </TableCell>
                </TableRow>
              ) : (
                departments.data.items.map((department) => (
                  <TableRow key={department.id} className="hover:bg-muted/30">
                    <TableCell className="pl-4 font-medium text-brand-primary">
                      {department.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {department.code ?? '—'}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setFormDepartment(department)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-destructive text-destructive hover:bg-destructive/5"
                          onClick={() => setDeleteDepartment(department)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-border bg-muted/10 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Page {departments.data.page} of {totalPages} &middot; {departments.data.total}{' '}
              department
              {departments.data.total === 1 ? '' : 's'}
              {departments.isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page <= 1 || departments.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page >= totalPages || departments.isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* formDepartment: undefined = closed, null = create mode, a
          Department = edit mode — same three-state shape MyBatchesPage's
          addStudentsBatch/downloadCsvBatch use (`Batch | null` there, one
          extra state here since create mode also needs to render this same
          dialog, not skip it). */}
      {formDepartment !== undefined && collegeId !== null && (
        <DepartmentFormDialog
          department={formDepartment}
          collegeId={collegeId}
          collegeName={selectedCollege?.name ?? ''}
          open={formDepartment !== undefined}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setFormDepartment(undefined)
          }}
        />
      )}

      {deleteDepartment && (
        <DeleteDepartmentDialog
          department={deleteDepartment}
          open={deleteDepartment !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setDeleteDepartment(null)
          }}
        />
      )}
    </div>
  )
}
