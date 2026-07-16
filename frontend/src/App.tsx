import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ApiError } from '@/api'
import { AppRoutes } from '@/routes'

const MAX_QUERY_RETRIES = 3

// TanStack Query's own default (staleTime: 0, refetchOnWindowFocus: true)
// treats every mounted query as needing a fresh refetch the instant the
// browser tab regains focus — confirmed root cause (live server logs): an
// admin dashboard page can have a dozen+ widgets mounted at once, so every
// tab-switch back to the app fired all of them simultaneously, and that
// burst was what was actually exhausting the global rate limit (rate-
// limit.plugin.ts), not any single heavy request. Disabling
// refetchOnWindowFocus outright (rather than tuning it down) because
// there's no partial dial for it — it's on or off — and a training-
// assessment admin dashboard's data (student rosters, question banks,
// batch config) doesn't change fast enough for "I switched tabs and back"
// to be a meaningful staleness signal; a explicit refetch button or a
// mutation's own invalidateQueries call is the right way for this data to
// update, not an implicit background poll.
// staleTime: 60s is the matching other half of that call — without it,
// every remount (route navigation back to an already-visited page) would
// still refetch instantly regardless of the flag above, since default
// staleTime is 0. One minute is short enough that admin users won't
// perceive it as stale data, long enough to absorb repeat navigation
// between the app's own pages within a single work session.
const DEFAULT_QUERY_STALE_TIME_MS = 60_000

// TanStack Query's own default (retry: true, i.e. always retry 3 times with
// backoff) treats every failure as transient — including a 404/400/403/409,
// which is a deterministic answer, not a blip. That cost ~7s of pointless
// backoff on every legitimate "not found"/empty-state response app-wide
// (surfaced by BatchPerformancePage's zero-attempts case, but this default
// is shared by every query hook in the app — there's only one QueryClient,
// instantiated here). A 4xx is never retried (retrying an unchanged request
// against a deterministic rejection can't produce a different answer);
// network errors (ApiError.status undefined — no response was ever
// received) and 5xx are exactly the cases retrying can actually help with,
// so those still get up to 3 attempts.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (failureCount >= MAX_QUERY_RETRIES) return false
        if (error instanceof ApiError && error.status !== undefined) {
          return error.status < 400 || error.status >= 500
        }
        return true
      },
      refetchOnWindowFocus: false,
      staleTime: DEFAULT_QUERY_STALE_TIME_MS,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        {/* Mount point for api/index.ts's 429 retry-with-backoff toast
            ("Too many requests, retrying…") — no Toaster existed anywhere
            in the tree yet even though sonner has been a listed dependency
            since scaffold (CLAUDE1.md). */}
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
