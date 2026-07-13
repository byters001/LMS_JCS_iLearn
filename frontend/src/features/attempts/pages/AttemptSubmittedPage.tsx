import { Link } from 'react-router-dom'

// Landing point after a successful submit (manual or timer-triggered auto-
// submit) — a plain confirmation only. Real results/score display is a
// future reports-integration phase, not this one.
export default function AttemptSubmittedPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-brand-primary">Attempt submitted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your answers have been recorded. Your results will be available once they&apos;ve been
          reviewed.
        </p>
        <Link
          to="/student"
          className="mt-6 inline-block rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:bg-brand-accent/90"
        >
          Back to your assessments
        </Link>
      </div>
    </div>
  )
}
