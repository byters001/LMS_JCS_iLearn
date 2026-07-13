import { useParams } from 'react-router-dom'

// Placeholder only — Part 2 builds the real question rendering, timer, and
// submission flow here. This phase ends at "attempt successfully created."
export default function AttemptPage() {
  const { attemptId } = useParams<{ attemptId: string }>()

  return (
    <div className="p-6">
      <p className="text-brand-primary">Attempt started, ID: {attemptId}</p>
    </div>
  )
}
