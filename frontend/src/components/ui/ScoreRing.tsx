import { cn } from '@/lib/utils'

interface ScoreRingProps {
  // null = loaded, genuinely no score yet (e.g. zero submitted attempts) —
  // renders an empty (0%) ring, NOT a bare dash: the caller is responsible
  // for what's drawn in the ring's center, and the ring itself never
  // collapses to a filled block the way a lone "—" at display scale does
  // (see this component's own history — that bug is exactly why this got
  // extracted into one shared place instead of staying copy-pasted per
  // page).
  percent: number | null
  size?: number
  strokeWidth?: number
  // Token-driven, not hardcoded — defaults suit a light card (border/
  // primary read fine there); a caller placing this on a dark/gradient
  // surface (e.g. StudentDashboardPage's hero) overrides both so the ring
  // stays visible against its own background instead of vanishing.
  trackClassName?: string
  progressClassName?: string
  className?: string
}

// Bespoke SVG progress ring — no lucide icon-in-a-circle. Semantic tokens
// only (stroke-border/stroke-primary by default), so the SAME component
// re-colors correctly under any role's color scope (Student's
// .theme-parchment, Faculty/Admin's plain :root) with zero props needed
// beyond the dark-surface override above. Rotated -90deg so the arc starts
// at 12 o'clock, the standard radial-progress convention.
export function ScoreRing({
  percent,
  size = 108,
  strokeWidth = 10,
  trackClassName = 'stroke-border',
  progressClassName = 'stroke-primary',
  className,
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const pct = percent ?? 0
  const offset = circumference * (1 - pct / 100)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('-rotate-90', className)}
      role="img"
      aria-label={percent !== null ? `${Math.round(percent)}% average score` : 'No score yet'}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} className={cn('fill-none', trackClassName)} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={cn('fill-none transition-[stroke-dashoffset] duration-700 ease-out', progressClassName)}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  )
}
