import { useEffect, useState } from 'react'

interface AttemptTimerProps {
  timerMinutes: number
  // Left as an optional escape hatch for Part 3 (auto-submit on expiry) so
  // that phase can wire in a callback without needing to restructure where
  // this countdown state lives — this component owns it, starting from the
  // moment it mounts (i.e. when AttemptPage first renders the questions).
  // NOT called/wired to anything yet in this phase.
  onExpire?: () => void
}

function formatRemaining(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

export function AttemptTimer({ timerMinutes, onExpire }: AttemptTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(() => Math.max(0, timerMinutes * 60))

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (remainingSeconds === 0) {
      onExpire?.()
    }
  }, [remainingSeconds, onExpire])

  const isLow = remainingSeconds <= 60

  return (
    <div
      className={
        isLow
          ? 'rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-sm font-semibold tabular-nums text-destructive'
          : 'rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold tabular-nums text-brand-primary'
      }
    >
      {formatRemaining(remainingSeconds)}
    </div>
  )
}
