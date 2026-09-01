import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import BatchPerformancePage from './BatchPerformancePage'
import FacultyAnalyticsPage from './FacultyAnalyticsPage'

// /trainer/analytics used to render BatchPerformancePage directly (shared,
// unmodified, with /admin/analytics — see routes/index.tsx). Faculty now
// gets a real batch_trainers-scoped overview instead (FacultyAnalyticsPage),
// but the existing per-batch drill-down capability isn't removed — it
// moves to a second tab, the exact same Tabs wrapper shape
// AdminAnalyticsPage.tsx already established for Super Admin (this file is
// its Faculty-side sibling, not a fork of a different pattern).
//
// Default tab: "Batch Drill-down" whenever the URL carries batchId/
// assessmentId — same StaffAttemptDetailPage back-link reasoning
// AdminAnalyticsPage.tsx's own comment states (that page is reached from
// both /admin and /trainer trees, so the fix applies identically here).
export default function TrainerAnalyticsPage() {
  const [searchParams] = useSearchParams()
  const hasBatchDrillDownParams = searchParams.has('batchId') || searchParams.has('assessmentId')
  const [tab, setTab] = useState(hasBatchDrillDownParams ? 'batch-drilldown' : 'overview')

  // No shared outer padding — same reasoning as AdminAnalyticsPage.tsx:
  // FacultyAnalyticsPage self-pads (p-4, the density pass's tightened root
  // padding) and BatchPerformancePage already self-pads (its own p-5, still
  // pending the same pass), so wrapping both in a second padded container
  // here would double-pad whichever tab is active.
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="m-4 mb-0">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="batch-drilldown">Batch Drill-down</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <FacultyAnalyticsPage />
      </TabsContent>

      <TabsContent value="batch-drilldown">
        <BatchPerformancePage />
      </TabsContent>
    </Tabs>
  )
}
