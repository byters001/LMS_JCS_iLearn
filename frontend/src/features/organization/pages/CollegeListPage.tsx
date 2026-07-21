import { useState } from 'react'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useColleges } from '../api'
import { CollegeFormDialog } from '../components/CollegeFormDialog'
import { DeleteCollegeDialog } from '../components/DeleteCollegeDialog'
import { TrainingProgramFormDialog } from '../components/TrainingProgramFormDialog'
import DepartmentListPage from './DepartmentListPage'
import type { College, CollegeStatus } from '../types'

const PAGE_SIZE = 20

// Same semantic-color-per-status convention as features/assessments/
// components/AssessmentStatusBadge.tsx and question-bank's
// QuestionStatusBadge — a custom className per status, not the Badge
// component's generic default/secondary/outline variants, so 'expired'
// reads as a real warning rather than just "muted."
const STATUS_STYLES: Record<CollegeStatus, string> = {
  active: 'bg-green-600/10 text-green-700 dark:text-green-400',
  expired: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  archived: 'bg-muted text-muted-foreground',
}

function StatusBadge({ status }: { status: CollegeStatus }) {
  return <Badge className={STATUS_STYLES[status]}>{status}</Badge>
}

// Item 10 tier 1 — Colleges/Departments had ZERO frontend surface before
// this (confirmed by the item 10 audit: full real backend CRUD, GET-only
// on the frontend, no dedicated page, no nav entry). Reachable via ONE new
// "Colleges" nav entry (AdminLayout.tsx) — Departments lives as a second
// Tab on this same page (DepartmentListPage.tsx composed in, not
// duplicated) rather than a separate nav item, the same "two parallel
// views, one entity's management surface" call MyBatchesPage's Students /
// Assessment Participation tabs already made in item 10 part 1, for the
// identical reason (a college and its departments are two views of one
// "organization structure" concern, not a sequential drill-down).
export default function CollegeListPage() {
  const [page, setPage] = useState(1)
  const [formCollege, setFormCollege] = useState<College | null | undefined>(undefined)
  const [deleteCollege, setDeleteCollege] = useState<College | null>(null)
  const [programCollege, setProgramCollege] = useState<College | null>(null)

  const colleges = useColleges({ page, pageSize: PAGE_SIZE })

  const totalPages = colleges.data
    ? Math.max(1, Math.ceil(colleges.data.total / colleges.data.pageSize))
    : 1

  return (
    <div className="space-y-4 p-5">
      <div>
        <h1 className="font-heading text-xl font-semibold text-brand-primary">Colleges</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Partner colleges and their departments — platform structure, not scoped to any one
          batch or program.
        </p>
      </div>

      <Tabs defaultValue="colleges">
        <TabsList>
          <TabsTrigger value="colleges">Colleges</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
        </TabsList>

        <TabsContent value="colleges" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button onClick={() => setFormCollege(null)}>Add College</Button>
          </div>

          {colleges.isPending && (
            <div className="space-y-2" role="status" aria-label="Loading colleges">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          )}

          {colleges.isError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {colleges.error instanceof ApiError
                ? colleges.error.message
                : 'Failed to load colleges. Please try again.'}
            </div>
          )}

          {colleges.data && (
            <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4">Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {colleges.data.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No colleges found yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    colleges.data.items.map((college) => (
                      <TableRow key={college.id} className="hover:bg-muted/30">
                        <TableCell className="pl-4 font-medium text-brand-primary">
                          {college.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{college.code}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {college.contactEmail ?? '—'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={college.status} />
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                              onClick={() => setProgramCollege(college)}
                            >
                              New Program
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setFormCollege(college)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-destructive text-destructive hover:bg-destructive/5"
                              onClick={() => setDeleteCollege(college)}
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
                  Page {colleges.data.page} of {totalPages} &middot; {colleges.data.total} college
                  {colleges.data.total === 1 ? '' : 's'}
                  {colleges.isFetching ? ' · refreshing…' : ''}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                    disabled={page <= 1 || colleges.isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                    disabled={page >= totalPages || colleges.isFetching}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="departments" className="pt-4">
          <DepartmentListPage />
        </TabsContent>
      </Tabs>

      {/* formCollege: undefined = closed, null = create mode, a College =
          edit mode — same shape DepartmentListPage.tsx's formDepartment
          uses, for the same reason. */}
      {formCollege !== undefined && (
        <CollegeFormDialog
          college={formCollege}
          open={formCollege !== undefined}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setFormCollege(undefined)
          }}
        />
      )}

      {deleteCollege && (
        <DeleteCollegeDialog
          college={deleteCollege}
          open={deleteCollege !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setDeleteCollege(null)
          }}
        />
      )}

      {programCollege && (
        <TrainingProgramFormDialog
          collegeId={programCollege.id}
          collegeName={programCollege.name}
          open={programCollege !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setProgramCollege(null)
          }}
        />
      )}
    </div>
  )
}
