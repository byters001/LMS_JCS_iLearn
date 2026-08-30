import type { Variants } from 'framer-motion'

// Shared stat-row entrance — 300ms fade+rise per card, 40ms stagger between
// them, first-mount only (a plain `initial`/`animate` pair only re-fires if
// the animate target itself changes, which it never does here, so a data
// refetch after mount doesn't replay it). Used identically across all three
// portal dashboards (student/faculty/admin) rather than three ad-hoc
// variant objects. Reduced-motion handling is the caller's job (see
// STATIC_VARIANTS below) — this module has no way to know which page is
// rendering it.
export const STAT_CONTAINER_VARIANTS: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}

export const STAT_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

// Rendered when usePrefersReducedMotion() is true — same end state (opacity
// 1, y 0) with no transition, so a reduced-motion viewer sees the finished
// layout immediately rather than a skipped-but-still-animated version.
export const STATIC_VARIANTS: Variants = {
  hidden: { opacity: 1, y: 0 },
  show: { opacity: 1, y: 0 },
}
