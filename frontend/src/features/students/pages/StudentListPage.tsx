import { motion } from 'framer-motion'
import { Building2, ChevronDown, Layers, Search, UserCheck, Users, UserX } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { useBatchCountsByCollege, useColleges } from '@/features/organization/api'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { STAT_CONTAINER_VARIANTS, STAT_ITEM_VARIANTS, STATIC_VARIANTS } from '@/lib/motion'
import { CARD_GRADIENT, CARD_HOVER_LIFT, cn } from '@/lib/utils'
import { useStudentCountsByCollege, useStudentProfiles } from '../api'
import { StudentRosterTable } from '../components/StudentRosterTable'

const PAGE_SIZE = 20
// Colleges are a platform-wide, slow-growing entity, not paginated in the UI
// anywhere else either — same "small enough to just fetch in one page" call
// as BatchListPage.tsx's own COLLEGE_PICKER_PAGE_SIZE.
const COLLEGE_PAGE_SIZE = 100

// "Students by college" mini bar chart tuning. BAR_THICKNESS is the pill's
// rendered height (also its rx/ry, since radius = height / 2 = a full pill
// cap on both ends). The two MIN_ constants below are the minimum-visible-
// bar floor described in detail on renderCollegeBar further down — both are
// ABSOLUTE floors, independent of chartMax, so they hold the same way
// whether the largest college in the dataset is 20 or 20,000.
const BAR_THICKNESS = 8
const MIN_BAR_PIXEL_WIDTH = BAR_THICKNESS
const MIN_BAR_OPACITY = 0.55
const BAR_GRADIENT_ID = 'students-by-college-bar-gradient'

interface CollegeChartRow {
  id: string
  name: string
  students: number | undefined
}

interface CollegeBarShapeProps {
  x?: number
  y?: number
  width?: number
  height?: number
  payload?: CollegeChartRow
}

interface CollegeTooltipProps {
  active?: boolean
  payload?: Array<{ payload: CollegeChartRow }>
}

// Themed replacement for Recharts' unstyled default tooltip box — same
// bg-popover/border-border/text-popover-foreground tokens as
// TrainersDashboardPage's BatchCountTooltip, the established pattern for
// every themed Recharts tooltip in this codebase.
function CollegeCountTooltip({ active, payload }: CollegeTooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const count = row.students ?? 0
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">{row.name}</p>
      <p className="text-muted-foreground">
        {count} student{count === 1 ? '' : 's'}
      </p>
    </div>
  )
}

export default function StudentListPage() {
  const [selectedCollegeId, setSelectedCollegeId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [includeArchived, setIncludeArchived] = useState(false)
  const [collegeSearch, setCollegeSearch] = useState('')
  const prefersReducedMotion = usePrefersReducedMotion()

  // Platform-wide, not scoped to the selected college: this row is meant to
  // orient the user BEFORE they pick a college (and stays stable while
  // browsing between colleges), rather than duplicate the number already
  // shown on the clicked card itself. A per-college version of this exact
  // row would just repeat what the card grid below already displays.
  const activeCountQuery = useStudentProfiles({ page: 1, pageSize: 1 })
  const allCountQuery = useStudentProfiles({ page: 1, pageSize: 1, includeArchived: true })
  const activeCount = activeCountQuery.data?.total
  const totalCount = allCountQuery.data?.total
  const archivedCount =
    totalCount !== undefined && activeCount !== undefined ? totalCount - activeCount : undefined

  const colleges = useColleges({ page: 1, pageSize: COLLEGE_PAGE_SIZE })
  const collegeItems = colleges.data?.items ?? []
  const { countsByCollegeId } = useStudentCountsByCollege(collegeItems.map((college) => college.id))
  const { batchCountsByCollegeId } = useBatchCountsByCollege(collegeItems.map((college) => college.id))
  const selectedCollege = collegeItems.find((college) => college.id === selectedCollegeId)

  const normalizedSearch = collegeSearch.trim().toLowerCase()
  const filteredCollegeItems = normalizedSearch
    ? collegeItems.filter((college) => college.name.toLowerCase().includes(normalizedSearch))
    : collegeItems

  // "Students by college" ranked list — only worth showing once there's
  // more than one college to compare, and only once every college's count
  // has actually loaded (rendering zeros while useStudentCountsByCollege's
  // per-college queries are still in flight would flash a misleading
  // all-zero list before the real numbers pop in). Every college returned
  // here is real (known dev-DB test colleges were deleted from the
  // database, not filtered client-side).
  const chartData = collegeItems
    .map((college) => ({ id: college.id, name: college.name, students: countsByCollegeId.get(college.id) }))
    .sort((a, b) => (b.students ?? 0) - (a.students ?? 0))
  const chartReady = chartData.every((row) => row.students !== undefined)
  // Each row's mini-bar is scaled against the actual largest value in THIS
  // (filtered) set, not a fixed/default axis range — so the largest college
  // always fills the full width and there's no artificial dead space, the
  // same "domain=dataMax, not a hardcoded max" principle a Recharts axis
  // would need, just expressed as a width percentage instead of an axis
  // domain since this isn't an axis chart anymore (see the widget's own
  // comment below for why).
  const chartMax = Math.max(1, ...chartData.map((row) => row.students ?? 0))

  // Custom Bar shape for each row's mini chart. Recharts passes `width` here
  // already scaled against the shared XAxis domain={[0, chartMax]} below —
  // that domain is chartMax itself (the real max, never a rounded/"nice"
  // auto domain Recharts might otherwise pick), so this width is exactly
  // the same (value / chartMax) proportion the old div-based bar used, just
  // computed by Recharts' scale instead of inline arithmetic.
  //
  // Minimum-visible-bar floor:
  //   - width: Math.max(width, MIN_BAR_PIXEL_WIDTH) only ever RAISES the
  //     width Recharts already computed — it never touches bars whose real
  //     proportional width already clears the floor, so relative ranking
  //     between colleges is untouched. It only rescues values that would
  //     otherwise round to a sub-pixel sliver. MIN_BAR_PIXEL_WIDTH equals
  //     BAR_THICKNESS, so a 0-student bar renders as a small rounded
  //     pill/dot the same height as the bar itself — clearly an
  //     intentional shape, not a rendering glitch — rather than a stray
  //     hairline. This floor is a fixed pixel count, not a percentage, so
  //     it holds regardless of how large chartMax grows.
  //   - fillOpacity: MIN_BAR_OPACITY + (1 - MIN_BAR_OPACITY) * (value /
  //     chartMax) ranges from MIN_BAR_OPACITY (value = 0) up to fully
  //     opaque (value = chartMax) — leaders read visually stronger without
  //     ever dropping a small college's fill below a solid, legible
  //     opacity. Since the ratio only ever pulls opacity UP from the
  //     floor, it can't be pushed lower by any future data shape either.
  //
  // Verified at the extremes: value=0 -> width=8px, opacity=0.55 (a small
  // solid pill, not a blank row). value=1, chartMax=188 -> raw width
  // ~1.6px clamps to 8px, opacity ~0.552 (visibly dimmer than the leader,
  // never invisible). value=188=chartMax -> width fills the track at full
  // 1.0 opacity (no floor applied — the floor is a no-op once a bar's own
  // proportional size already exceeds it).
  function renderCollegeBar(props: CollegeBarShapeProps) {
    const { x = 0, y = 0, width = 0, height = 0, payload } = props
    const value = payload?.students ?? 0
    const renderedWidth = Math.max(width, MIN_BAR_PIXEL_WIDTH)
    const opacity = MIN_BAR_OPACITY + (1 - MIN_BAR_OPACITY) * Math.min(1, value / chartMax)
    const radius = height / 2
    return (
      <rect
        x={x}
        y={y}
        width={renderedWidth}
        height={height}
        rx={radius}
        ry={radius}
        fill={`url(#${BAR_GRADIENT_ID})`}
        fillOpacity={opacity}
      />
    )
  }

  function handleSelectCollege(collegeId: string) {
    if (selectedCollegeId === collegeId) {
      setSelectedCollegeId(null)
    } else {
      setSelectedCollegeId(collegeId)
      setPage(1)
    }
  }

  const students = useStudentProfiles(
    { collegeId: selectedCollegeId ?? '', page, pageSize: PAGE_SIZE, includeArchived },
    { enabled: selectedCollegeId !== null },
  )

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Students"
        description="Every student profile across your platform, browsable college by college."
      >
        <motion.div
          initial="hidden"
          animate="show"
          variants={prefersReducedMotion ? STATIC_VARIANTS : STAT_CONTAINER_VARIANTS}
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <motion.div variants={prefersReducedMotion ? STATIC_VARIANTS : STAT_ITEM_VARIANTS}>
            <StatCard
              label="Total students"
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
              label="Archived"
              value={archivedCount}
              icon={UserX}
              iconClassName="bg-muted text-muted-foreground"
              accent="coral"
            />
          </motion.div>
        </motion.div>
      </PageHeader>

      {/* Ranked list with an inline Recharts bar per row (layout="vertical"),
          not a shared multi-bar axis chart — this is 3-6 categories with a
          huge value disparity (real colleges in the 180s, next to
          near-zero ones), which is exactly what pushed this widget to a
          div-based list in an earlier phase: a shared axis's domain gets
          padded/rounded past the real max, so even a correct-looking
          domain still reads a real-but-small college as "basically zero,
          probably broken" next to the big ones. Each row below is its own
          single-bar chart, but ALL of them share the exact same XAxis
          domain={[0, chartMax]} (chartMax = the real max in this dataset,
          computed with plain Math.max — never a rounded/"nice" auto
          domain), so a college's rendered bar length is the exact same
          (value / chartMax) proportion the old div-based bar used — the
          same fix, just expressed as a Recharts axis domain instead of an
          inline width percentage. See renderCollegeBar above for the
          minimum-visible-bar floor that keeps a 0/1-student college a
          small legible pill instead of a blank or sub-pixel row. */}
      {chartData.length > 1 && (
        <Card className="p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-sm font-semibold text-foreground">Students by college</h2>
            <Badge variant="outline" className="gap-1">
              <Layers className="size-3" />
              {chartData.length} colleges
            </Badge>
          </div>
          {chartReady ? (
            <div className="mt-3 space-y-2">
              {/* Defs-only, zero-size SVG: SVG paint-server references
                  (fill="url(#id)") resolve against the whole document, not
                  just the local <svg>, so one gradient definition here is
                  reused by every row's own separate BarChart svg below
                  rather than duplicating (and invalidly re-declaring) the
                  same id once per row. */}
              <svg width={0} height={0} className="absolute" aria-hidden="true">
                <defs>
                  <linearGradient id={BAR_GRADIENT_ID} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={1} />
                  </linearGradient>
                </defs>
              </svg>
              {chartData.map((row, index) => (
                <div key={row.id} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground">
                    {index + 1}
                  </span>
                  <p className="w-36 shrink-0 truncate text-sm text-foreground" title={row.name}>
                    {row.name}
                  </p>
                  <div className="h-5 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[row]}
                        layout="vertical"
                        margin={{ top: 0, right: 26, bottom: 0, left: 0 }}
                      >
                        <XAxis type="number" domain={[0, chartMax]} hide />
                        <YAxis type="category" dataKey="name" hide />
                        <Tooltip content={<CollegeCountTooltip />} cursor={{ fill: 'var(--muted)' }} />
                        <Bar
                          dataKey="students"
                          barSize={BAR_THICKNESS}
                          shape={renderCollegeBar}
                          isAnimationActive={!prefersReducedMotion}
                          animationDuration={600}
                          animationBegin={index * 40}
                        >
                          <LabelList
                            dataKey="students"
                            position="right"
                            className="fill-foreground font-mono text-xs font-semibold tabular-nums"
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="mt-3 h-24 animate-pulse rounded-lg bg-muted"
              role="status"
              aria-label="Loading chart"
            />
          )}
        </Card>
      )}

      <div>
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Colleges
          </h2>
          <div className="relative w-full max-w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Filter colleges…"
              className="w-full pl-8"
              value={collegeSearch}
              onChange={(event) => setCollegeSearch(event.target.value)}
            />
          </div>
        </div>

        {colleges.isPending && (
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            role="status"
            aria-label="Loading colleges"
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        )}

        {colleges.isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
            Failed to load colleges. Please try again.
          </div>
        )}

        {colleges.data && collegeItems.length === 0 && (
          <EmptyState icon={Building2} message="No colleges found." />
        )}

        {colleges.data && collegeItems.length > 0 && filteredCollegeItems.length === 0 && (
          <EmptyState icon={Search} message={`No colleges match "${collegeSearch}".`} />
        )}

        {colleges.data && filteredCollegeItems.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredCollegeItems.map((college) => {
              const isSelected = selectedCollegeId === college.id
              const count = countsByCollegeId.get(college.id)
              const batchCount = batchCountsByCollegeId.get(college.id)
              return (
                <button
                  key={college.id}
                  type="button"
                  aria-expanded={isSelected}
                  onClick={() => handleSelectCollege(college.id)}
                  className={cn(
                    'rounded-2xl bg-card p-3 text-left shadow-sm',
                    CARD_GRADIENT,
                    CARD_HOVER_LIFT,
                    isSelected && 'ring-2 ring-primary shadow-md',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-foreground">{college.name}</p>
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform',
                        isSelected && 'rotate-180',
                      )}
                    />
                  </div>
                  <p className="mt-2 font-mono text-2xl font-semibold text-foreground">
                    {count === undefined ? (
                      <span className="inline-block h-7 w-10 animate-pulse rounded bg-muted align-middle" />
                    ) : (
                      count
                    )}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      student{count === 1 ? '' : 's'}
                    </p>
                    {batchCount === undefined ? (
                      <span className="inline-block h-4 w-14 animate-pulse rounded bg-muted" />
                    ) : (
                      <Badge variant="secondary" className="shrink-0">
                        {batchCount} batch{batchCount === 1 ? '' : 'es'}
                      </Badge>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Reveals below the card grid rather than inline within a card (the
          existing table needs full page width, not a grid cell) — same
          Collapsible primitive AdminLayout's sidebar "Question Bank" nav
          group already uses for its own expand/collapse, the closest real
          expand-caret precedent actually in this codebase (BatchListPage
          has no expand/caret at all — it's a flat grid gated by a college
          Combobox — and PoolListPage's "detail" is a separate route, not an
          inline split panel; neither of those two referenced patterns
          exists yet, so this reuses the one that genuinely does). */}
      <Collapsible open={selectedCollegeId !== null}>
        <CollapsibleContent className="space-y-3">
          {selectedCollege && (
            <>
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                Students at {selectedCollege.name}
              </h2>

              <StudentRosterTable
                studentsQuery={students}
                page={page}
                onPageChange={setPage}
                includeArchived={includeArchived}
                onIncludeArchivedChange={setIncludeArchived}
                emptyMessage="No students found for this college yet."
              />
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
