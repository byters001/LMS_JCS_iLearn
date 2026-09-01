import { PageHeader } from '@/components/ui/PageHeader'
import LeaderboardSection from '../components/LeaderboardSection'

// New dedicated route (/student/leaderboard) — LeaderboardSection itself is
// reused entirely as-is (its own card chrome, heading, table). Previously
// this same component was embedded directly inside StudentAssessmentsPage.tsx
// ("Your Assessments") below the assessment grid; it's been MOVED here, not
// duplicated — removed from that page in the same change that added this
// one, since showing the same leaderboard in two places once it has its own
// nav link would just be redundant clutter on the assessments dashboard.
//
// Phase 3a — swapped the raw h1/p header block for the shared PageHeader
// (same shape it was already hand-copying).
//
// Structural rollout — LeaderboardSection now carries its own "Your
// Standing" hero strip (ring + rank + tier) above its table; this wrapper
// stays a thin shell around it, no separate hero here, so page-level
// entrance animation still doesn't apply (that strip animates in via
// LeaderboardSection's own render, not a StatCard grid this page owns).
export default function LeaderboardPage() {
  return (
    <div className="p-4">
      <PageHeader title="Leaderboard" description="See how you rank against your batch." />
      <div className="mt-3">
        <LeaderboardSection />
      </div>
    </div>
  )
}
