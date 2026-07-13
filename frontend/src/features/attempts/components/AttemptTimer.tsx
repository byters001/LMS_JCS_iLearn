import { useEffect, useRef, useState } from 'react'

interface AttemptTimerProps {
  timerMinutes: number
  // Part 3: triggers AttemptPage's auto-submit. This component still owns
  // the countdown state itself (starting from the moment it mounts), and
  // guarantees onExpire fires exactly once regardless of parent re-renders
  // (see the hasFiredRef guard below) — the caller doesn't need its own
  // dedup logic to stay safe against a double auto-submit.
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

  // hasFiredRef (not just the remainingSeconds===0 check alone) is what
  // makes "exactly once" hold even if `onExpire`'s function identity
  // changes across AttemptPage re-renders after expiry (each such change
  // would otherwise re-run this effect, since remainingSeconds itself
  // staying at 0 doesn't stop React from re-running an effect whose OTHER
  // dependency changed) — a plain re-render must never re-trigger
  // auto-submit.
  const hasFiredRef = useRef(false)
  useEffect(() => {
    if (remainingSeconds === 0 && !hasFiredRef.current) {
      hasFiredRef.current = true
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
