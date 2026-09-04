import { motion } from 'framer-motion'
import { Building2, ChevronDown, Layers, Search, UserCheck, Users, UserX } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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

// "Students by college" two-panel chart tuning.
//
// Pie panel: 7 categorical hues (blue/aqua/yellow/magenta/green/violet/red —
// the dataviz skill's default 8-hue categorical set with orange dropped per
// this widget's "no orange anywhere in this chart" requirement, kept in its
// original relative order). Re-validated with the skill's validator against
// this app's card surfaces after dropping orange:
//   node scripts/validate_palette.js "#2a78d6,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948" --mode light
//   node scripts/validate_palette.js "#3987e5,#199e70,#c98500,#d55181,#008300,#9085e9,#e66767" --mode dark
// both report ALL CHECKS PASS (light carries a sub-3:1 contrast WARN on 3
// slots, which is why every slice also gets a legend swatch + name + percent
// label below — the "relief rule" mitigation the skill requires for that
// WARN). More than 7 colleges cycles back to slot 0 — an acceptable
// fallback for a named-entity list like colleges, not a filterable series.
const PIE_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']

// Linear interpolation between two hex colors — used to derive each pie
// slice's glossy highlight/shadow stops, and the bar gradients' highlight
// stop, from a single base hex rather than hand-picking every shade.
function mixHex(hex: string, target: string, ratio: number): string {
  const a = Number.parseInt(hex.slice(1), 16)
  const b = Number.parseInt(target.slice(1), 16)
  const channel = (shift: number) => {
    const from = (a >> shift) & 255
    const to = (b >> shift) & 255
    return Math.round(from + (to - from) * ratio)
  }
  return `#${[channel(16), channel(8), channel(0)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

const pieGradientId = (index: number) => `students-by-college-pie-gradient-${index}`

// Bar panel colors — literal hex per this widget's explicit "dark violet"
// students bar / "light grey" batches bar spec, not theme tokens (same
// reasoning BatchPerformancePage's PASS_COLOR/FAIL_COLOR already documents:
// this is a fixed chart-data encoding, not a themed UI surface). Violet base
// matches this app's own --chart-4 brand hex.
const STUDENTS_BAR_GRADIENT_ID = 'students-by-college-students-bar-gradient'
const BATCHES_BAR_GRADIENT_ID = 'students-by-college-batches-bar-gradient'
const STUDENTS_BAR_BASE = '#332cad'
const STUDENTS_BAR_HIGHLIGHT = mixHex(STUDENTS_BAR_BASE, '#ffffff', 0.45)
const BATCHES_BAR_BASE = '#c7cad3'
const BATCHES_BAR_HIGHLIGHT = mixHex(BATCHES_BAR_BASE, '#ffffff', 0.6)

interface CollegeChartRow {
  id: string
  name: string
  students: number | undefined
  batches: number | undefined
}

interface CollegeShareTooltipProps {
  active?: boolean
  payload?: Array<{ payload: CollegeChartRow }>
  total: number
}

// Themed replacement for Recharts' unstyled default tooltip box — same
// bg-popover/border-border/text-popover-foreground tokens as
// TrainersDashboardPage's BatchCountTooltip, the established pattern for
// every themed Recharts tooltip in this codebase.
function CollegeShareTooltip({ active, payload, total }: CollegeShareTooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const count = row.students ?? 0
  const percent = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">{row.name}</p>
      <p className="text-muted-foreground">
        {count} student{count === 1 ? '' : 's'} · {percent}%
      </p>
    </div>
  )
}

interface CollegeCompareTooltipProps {
  active?: boolean
  payload?: Array<{ payload: CollegeChartRow }>
}

function CollegeCompareTooltip({ active, payload }: CollegeCompareTooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const students = row.students ?? 0
  const batches = row.batches ?? 0
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">{row.name}</p>
      <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: STUDENTS_BAR_BASE }}
          aria-hidden="true"
        />
        {students} student{students === 1 ? '' : 's'}
      </p>
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: BATCHES_BAR_BASE }}
          aria-hidden="true"
        />
        {batches} batch{batches === 1 ? '' : 'es'}
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

  // "Students by college" pie + bar comparison — only worth showing once
  // there's more than one college to compare, and only once every college's
  // student AND batch count has actually loaded (rendering zeros while
  // useStudentCountsByCollege/useBatchCountsByCollege's per-college queries
  // are still in flight would flash a misleading all-zero chart before the
  // real numbers pop in). Every college returned here is real (known dev-DB
  // test colleges were deleted from the database, not filtered client-side).
  const chartData = collegeItems
    .map((college) => ({
      id: college.id,
      name: college.name,
      students: countsByCollegeId.get(college.id),
      batches: batchCountsByCollegeId.get(college.id),
    }))
    .sort((a, b) => (b.students ?? 0) - (a.students ?? 0))
  const chartReady = chartData.every((row) => row.students !== undefined && row.batches !== undefined)
  const pieTotal = chartData.reduce((sum, row) => sum + (row.students ?? 0), 0)

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

      {/* Two-panel comparison: a glossy pseudo-3D pie (share of total
          students per college) beside a grouped bar chart (students vs.
          batches per college). Replaces the earlier single-bar ranked list
          — see git history for that version's reasoning, now superseded by
          this two-panel spec. */}
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
            <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* Pie panel */}
              <div>
                {/* Defs-only, zero-size SVG: SVG paint-server references
                    (fill="url(#id)") resolve against the whole document, so
                    one <defs> block here supplies every slice's own
                    per-college radial gradient (light highlight near the
                    top-left fading through the base hue to a darker shade —
                    the glossy-sphere fake-3D look) without redeclaring ids. */}
                <svg width={0} height={0} className="absolute" aria-hidden="true">
                  <defs>
                    {chartData.map((row, index) => {
                      const base = PIE_COLORS[index % PIE_COLORS.length]
                      return (
                        <radialGradient key={row.id} id={pieGradientId(index)} cx="35%" cy="30%" r="75%">
                          <stop offset="0%" stopColor={mixHex(base, '#ffffff', 0.55)} />
                          <stop offset="55%" stopColor={base} />
                          <stop offset="100%" stopColor={mixHex(base, '#000000', 0.3)} />
                        </radialGradient>
                      )
                    })}
                  </defs>
                </svg>

                <div className="relative mx-auto" style={{ maxWidth: 240, perspective: '900px' }}>
                  {/* Blurred ellipse standing in for a drop shadow/base
                      beneath the pie, reinforcing the tilted-disc read. */}
                  <div
                    className="absolute bottom-0 left-1/2 h-6 w-36 -translate-x-1/2 rounded-full bg-foreground/25 blur-md"
                    aria-hidden="true"
                  />
                  {/* Subtle rotateX for a tilted 3D feel — kept small enough
                      (16deg) that the counter-rotated tooltip below stays
                      legible, and the legend/percent labels live entirely
                      outside this transformed subtree so they're never
                      skewed. */}
                  <div style={{ transform: 'rotateX(16deg)', transformOrigin: '50% 65%' }}>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey="students"
                          nameKey="name"
                          outerRadius="78%"
                          paddingAngle={2}
                          isAnimationActive={!prefersReducedMotion}
                          animationDuration={700}
                        >
                          {chartData.map((row, index) => (
                            <Cell
                              key={row.id}
                              fill={`url(#${pieGradientId(index)})`}
                              stroke="var(--card)"
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          content={(props) => (
                            <div style={{ transform: 'rotateX(-16deg)' }}>
                              <CollegeShareTooltip {...props} total={pieTotal} />
                            </div>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Legend doubling as the on-chart label the spec asks for
                    (college name + share %) — deliberately outside the
                    rotateX'd wrapper above so it never inherits the tilt. */}
                <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
                  {chartData.map((row, index) => {
                    const count = row.students ?? 0
                    const percent = pieTotal > 0 ? Math.round((count / pieTotal) * 100) : 0
                    return (
                      <li key={row.id} className="flex max-w-32 items-center gap-1.5 text-xs">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-foreground" title={row.name}>
                          {row.name}
                        </span>
                        <span className="shrink-0 font-mono text-muted-foreground tabular-nums">{percent}%</span>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {/* Bar panel — grouped students-vs-batches per college, each
                  bar a top-lit gradient (never a flat fill) instead of the
                  old single-hue BAR_GRADIENT_ID pill. */}
              <div>
                <svg width={0} height={0} className="absolute" aria-hidden="true">
                  <defs>
                    <linearGradient id={STUDENTS_BAR_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={STUDENTS_BAR_HIGHLIGHT} />
                      <stop offset="100%" stopColor={STUDENTS_BAR_BASE} />
                    </linearGradient>
                    <linearGradient id={BATCHES_BAR_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BATCHES_BAR_HIGHLIGHT} />
                      <stop offset="100%" stopColor={BATCHES_BAR_BASE} />
                    </linearGradient>
                  </defs>
                </svg>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 8, left: 0, bottom: chartData.length > 4 ? 32 : 8 }}
                  >
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      interval={0}
                      angle={chartData.length > 4 ? -25 : 0}
                      textAnchor={chartData.length > 4 ? 'end' : 'middle'}
                      tickFormatter={(value: string) => (value.length > 14 ? `${value.slice(0, 13)}…` : value)}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickLine={false}
                      axisLine={false}
                      width={28}
                    />
                    <Tooltip content={<CollegeCompareTooltip />} cursor={{ fill: 'var(--muted)' }} />
                    <Legend formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
                    <Bar
                      dataKey="students"
                      name="Students"
                      fill={`url(#${STUDENTS_BAR_GRADIENT_ID})`}
                      radius={[6, 6, 0, 0]}
                      isAnimationActive={!prefersReducedMotion}
                      animationDuration={600}
                    />
                    <Bar
                      dataKey="batches"
                      name="Batches"
                      fill={`url(#${BATCHES_BAR_GRADIENT_ID})`}
                      radius={[6, 6, 0, 0]}
                      isAnimationActive={!prefersReducedMotion}
                      animationDuration={600}
                      animationBegin={80}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div
              className="mt-3 h-64 animate-pulse rounded-lg bg-muted"
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
