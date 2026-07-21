import { Outlet } from 'react-router-dom'
import logo from '@/assets/brand/logo.jpeg'

// Exam-mode shell for the live attempt-taking screen (routes/index.tsx nests
// AttemptPage under THIS layout, not StudentLayout — see that file's own
// comment for why a separate layout wrapper, not conditional hiding inside
// StudentLayout, is the right mechanism). No sidebar, no nav links, no user
// menu, no notification bell, no logout — none of StudentLayout's persistent
// chrome exists here at all, matching the distraction-free exam-mode
// convention of platforms like NEOPAT/FacePrep/HackerRank rather than a page
// embedded in the normal app shell.
//
// The logo is deliberately NON-interactive (plain <img>, not a <Link>) —
// this codebase has no existing native `window.confirm()` precedent (every
// other confirmation flow here, including SubmitAttemptButton's own, is a
// custom modal), and a real exam-mode surface shouldn't offer a casual exit
// affordance mid-attempt at all. A static brand mark, not a nav element,
// matches HackerRank/CodeSignal's own exam-chrome convention (CLAUDE1.md's
// design references) better than either a full nav menu OR an easy way out.
//
// Density phase — header shrunk slightly (h-12 -> h-11) and AttemptPage's
// own root no longer carries top padding (see that file's own comment), so
// this bar's bottom border sits directly against AttemptPage's title row
// with no dead band between them. This does NOT merge the two into one
// component/DOM band — AttemptLayout still has no access to AttemptPage's
// assessment-title/section data (that would need an outlet-context or
// shared-store mechanism to flow child data UP into a parent layout, a
// real architectural change), so the fix here is spacing/removing the gap,
// not a structural merge. See AttemptPage.tsx's own comment for the other
// half of this.
export default function AttemptLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center border-b border-border px-4">
        <img src={logo} alt="JCS iLearn" className="h-6 w-28 object-cover" />
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
