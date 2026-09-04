import { BookOpen, Building2, ChevronDown, MoreVertical, Users } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useStudentCountsByCollege } from '@/features/students/api'
import { useBatchCountsByCollege, useColleges } from '../api'
import { CollegeFormDialog } from '../components/CollegeFormDialog'
import { DeleteCollegeDialog } from '../components/DeleteCollegeDialog'
import { TrainingProgramFormDialog } from '../components/TrainingProgramFormDialog'
import DepartmentListPage from './DepartmentListPage'
import type { College, CollegeStatus } from '../types'

const PAGE_SIZE = 20

// Same semantic-color-per-status convention as features/assessments/
// components/AssessmentStatusBadge.tsx and question-bank's
// QuestionStatusBadge — mapped onto Badge's own token-driven semantic
// variants (live/warning/neutral) instead of a hand-rolled hex palette, so
// 'expired' reads as a real warning rather than just "muted," and every
// color repaints correctly in dark mode for free.
const STATUS_VARIANT: Record<CollegeStatus, 'live' | 'warning' | 'neutral'> = {
  active: 'live',
  expired: 'warning',
  archived: 'neutral',
}

function StatusBadge({ status }: { status: CollegeStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className="shrink-0">
      {status}
    </Badge>
  )
}

// Card-based replacement for the old table row — same data, same three
// mutations (Edit/New Program/Delete), just laid out like BatchCard.tsx's
// grid card (stat pair, ChevronDown expand + kebab menu) rather than a
// table row, since that's the one "card with actions" shape already proven
// out in this codebase rather than inventing a second one. New Program/
// Delete move into the kebab menu (BatchCard's own menuItems precedent) so
// the two buttons that stay on the card face — View/Edit — are the two a
// reader reaches for most.
//
// UI cleanup phase — the circular initials avatar (e.g. "KT") was removed
// entirely: name + status badge only, per explicit request. BatchCard.tsx
// (the sibling grid card this one is modeled on) never had an avatar in
// the first place, so this brings CollegeCard in line with it rather than
// leaving it as the one card with a leftover identity badge.
function CollegeCard({
  college,
  studentCount,
  batchCount,
  isExpanded,
  onToggleExpand,
  onEdit,
  onNewProgram,
  onDelete,
}: {
  college: College
  studentCount: number | undefined
  batchCount: number | undefined
  isExpanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onNewProgram: () => void
  onDelete: () => void
}) {
  return (
    // interactive: unlike BatchCard, this tile has no single card-body
    // onClick (View/Edit/kebab are each their own button) — but it's the
    // same "manageable entity tile in a grid" role as BatchCard, just
    // action-first instead of drill-down-first, so it gets the same
    // hover-lift affordance for parity between the two.
    <Card interactive className="gap-2.5 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-heading font-medium text-foreground">{college.name}</p>
          <p className="truncate text-xs text-muted-foreground">{college.code}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={college.status} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`More actions for ${college.name}`}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-primary"
              >
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onNewProgram}>New Program</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2.5">
        <div className="flex items-center gap-2">
          <Users className="size-4 shrink-0 text-accent-indigo-fg" />
          <div className="min-w-0">
            <p className="font-heading text-sm leading-tight font-semibold text-foreground">
              {studentCount === undefined ? (
                <span className="inline-block h-4 w-6 animate-pulse rounded bg-muted align-middle" />
              ) : (
                studentCount
              )}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">students</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 shrink-0 text-accent-teal-fg" />
          <div className="min-w-0">
            <p className="font-heading text-sm leading-tight font-semibold text-foreground">
              {batchCount === undefined ? (
                <span className="inline-block h-4 w-6 animate-pulse rounded bg-muted align-middle" />
              ) : (
                batchCount
              )}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">batches</p>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <p className="truncate">
            Contact: {college.contactEmail ?? '—'}
            {college.contactPhone ? ` · ${college.contactPhone}` : ''}
          </p>
          <p className="truncate">Address: {college.address ?? '—'}</p>
          <p>
            Contract: {college.contractStartDate ?? '—'} &rarr; {college.contractEndDate ?? '—'}
          </p>
        </div>
      )}

      <div className="mt-auto flex gap-2 border-t border-border pt-3">
        <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={onToggleExpand}>
          <ChevronDown className={cn('size-4 transition-transform', isExpanded && 'rotate-180')} />
          View
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </Card>
  )
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
  const [expandedCollegeId, setExpandedCollegeId] = useState<string | null>(null)

  const colleges = useColleges({ page, pageSize: PAGE_SIZE })
  const collegeItems = colleges.data?.items ?? []
  const { countsByCollegeId } = useStudentCountsByCollege(collegeItems.map((college) => college.id))
  const { batchCountsByCollegeId } = useBatchCountsByCollege(collegeItems.map((college) => college.id))

  const totalPages = colleges.data
    ? Math.max(1, Math.ceil(colleges.data.total / colleges.data.pageSize))
    : 1

  return (
    <div className="space-y-3 p-4">
      {/* Stat row is a single card, not the 3-column grid StudentListPage
          uses — "total departments across every college" would need a new,
          unfiltered useDepartments query (departments are only ever fetched
          scoped to one picked college here and in DepartmentListPage), and
          per-status counts would have to come from colleges.data.items,
          which is just the current PAGE_SIZE=20 page, not the true total —
          silently wrong once colleges.data.total exceeds one page. The one
          number that's both real and already fetched is the total college
          count the backend returns in colleges.data.total regardless of
          page size, so that's the only card here. */}
      <PageHeader
        title="Colleges"
        description="Partner colleges and their departments — platform structure, not scoped to any one batch or program."
      >
        <StatCard
          label="Total colleges"
          value={colleges.data?.total}
          icon={Building2}
          iconClassName="bg-accent-indigo-bg text-accent-indigo-fg"
          accent="indigo"
          className="max-w-64"
        />
      </PageHeader>

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
            <div
              className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              role="status"
              aria-label="Loading colleges"
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          )}

          {colleges.isError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
              {colleges.error instanceof ApiError
                ? colleges.error.message
                : 'Failed to load colleges. Please try again.'}
            </div>
          )}

          {colleges.data && collegeItems.length === 0 && (
            <EmptyState icon={Building2} message="No colleges found yet." />
          )}

          {colleges.data && collegeItems.length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {collegeItems.map((college) => (
                  <CollegeCard
                    key={college.id}
                    college={college}
                    studentCount={countsByCollegeId.get(college.id)}
                    batchCount={batchCountsByCollegeId.get(college.id)}
                    isExpanded={expandedCollegeId === college.id}
                    onToggleExpand={() =>
                      setExpandedCollegeId((current) => (current === college.id ? null : college.id))
                    }
                    onEdit={() => setFormCollege(college)}
                    onNewProgram={() => setProgramCollege(college)}
                    onDelete={() => setDeleteCollege(college)}
                  />
                ))}
              </div>

              <Card className="flex-row items-center justify-between px-3.5 py-2.5">
                <p className="text-sm text-muted-foreground">
                  Page {colleges.data.page} of {totalPages} &middot; {colleges.data.total} college
                  {colleges.data.total === 1 ? '' : 's'}
                  {colleges.isFetching ? ' · refreshing…' : ''}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || colleges.isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || colleges.isFetching}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </Card>
            </>
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
