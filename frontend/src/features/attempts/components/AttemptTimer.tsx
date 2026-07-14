import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

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

  // Three tiers, not two: a plain countdown reads as alarming the moment it
  // turns red, so the color only escalates in the final stretch — neutral
  // and prominent for almost the entire attempt, amber once genuinely
  // "wrap up soon" (5 min), red only once truly urgent (60s) — matching the
  // task's ask for "prominent but not alarming until near-expiry."
  const isCritical = remainingSeconds <= 60
  const isWarning = !isCritical && remainingSeconds <= 300

  return (
    <div
      role="timer"
      aria-live={isCritical ? 'assertive' : 'off'}
      className={cn(
        'flex items-center gap-2 rounded-lg border px-4 py-2 text-base font-semibold tabular-nums transition-colors',
        isCritical &&
          'animate-pulse border-destructive/40 bg-destructive/10 text-destructive',
        isWarning && 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        !isCritical && !isWarning && 'border-border bg-muted/40 text-brand-primary',
      )}
    >
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          isCritical ? 'bg-destructive' : isWarning ? 'bg-amber-500' : 'bg-brand-accent',
        )}
      />
      {formatRemaining(remainingSeconds)}
    </div>
  )
}
