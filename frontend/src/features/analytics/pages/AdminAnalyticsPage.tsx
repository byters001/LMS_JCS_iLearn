import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import BatchPerformancePage from './BatchPerformancePage'
import SuperAdminAnalyticsPage from './SuperAdminAnalyticsPage'

// /admin/analytics used to render BatchPerformancePage directly (shared,
// unmodified, with /trainer/analytics — see routes/index.tsx). Super Admin
// now gets a real platform-wide landing page instead (SuperAdminAnalyticsPage),
// but the existing per-batch drill-down capability isn't removed — it moves
// to a second tab, same Tabs pattern CollegeListPage.tsx's Colleges/
// Departments split already established, rather than forking a new
// composition shape. Faculty's /trainer/analytics is untouched — still
// literally <BatchPerformancePage />, no wrapper, per this phase's explicit
// "no faculty-differentiated work yet" scope.
//
// Default tab: "Batch Drill-down" whenever the URL carries batchId/
// assessmentId (StaffAttemptDetailPage's own relative `Link to=".."` back
// button rides these query params to land back on the batch it came from —
// confirmed by reading that file's own comment). Defaulting to "Overview"
// in that case would silently strand the return trip. "Overview" otherwise
// (nav-link entry, no params).
export default function AdminAnalyticsPage() {
  const [searchParams] = useSearchParams()
  const hasBatchDrillDownParams = searchParams.has('batchId') || searchParams.has('assessmentId')
  const [tab, setTab] = useState(hasBatchDrillDownParams ? 'batch-drilldown' : 'overview')

  // No shared outer padding here — SuperAdminAnalyticsPage self-pads (p-5,
  // added to match) and BatchPerformancePage already self-pads (unchanged,
  // still needs its own p-5 for its OTHER mount point, /trainer/analytics,
  // which has no wrapper at all). Wrapping both in a second p-5 here would
  // double-pad whichever tab is active — the TabsList itself gets its own
  // margin instead of sharing a padded container with either page.
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="m-5 mb-0">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="batch-drilldown">Batch Drill-down</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <SuperAdminAnalyticsPage />
      </TabsContent>

      <TabsContent value="batch-drilldown">
        <BatchPerformancePage />
      </TabsContent>
    </Tabs>
  )
}
