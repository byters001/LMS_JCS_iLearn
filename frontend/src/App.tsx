import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ApiError } from '@/api'
import { AppRoutes } from '@/routes'

const MAX_QUERY_RETRIES = 3

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
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
