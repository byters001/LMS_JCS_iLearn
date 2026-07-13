import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import LoginPage from '@/features/auth/pages/LoginPage'

const queryClient = new QueryClient()

// Temporary: routes/ (the real route tree + role guards) isn't built yet
// (next phase). BrowserRouter is mounted here just so useNavigate() works
// inside LoginPage for now.
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
