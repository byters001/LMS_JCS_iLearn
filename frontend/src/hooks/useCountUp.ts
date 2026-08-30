import { useEffect, useRef, useState } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

// Animates from 0 up to `target` once `target` becomes a real number (e.g.
// StatCard's value resolving after a loading placeholder) — that arrival is
// effectively "on mount" from the animation's point of view. Skips straight
// to the final value when the user has prefers-reduced-motion set.
export function useCountUp(target: number | null | undefined, durationMs = 600) {
  const [display, setDisplay] = useState(target ?? 0)
  const frameRef = useRef<number>(undefined)

  useEffect(() => {
    if (target === null || target === undefined) return

    if (typeof window !== 'undefined' && window.matchMedia?.(REDUCED_MOTION_QUERY).matches) {
      setDisplay(target)
      return
    }

    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(target * eased))
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
    }
  }, [target, durationMs])

  return display
}
