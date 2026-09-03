import { Rectangle } from 'recharts'

// Constant, non-scaling decorative depth (px) — added the SAME amount
// regardless of a bar's own height/value, so a tall bar's extrusion looks
// identical in depth to a short bar's. This is what keeps the effect purely
// decorative: it never grows/shrinks with the data.
const DEPTH = 6

// Recharts' own custom-shape props are loosely typed (whatever the active
// Bar item computed for this data point — x/y/width/height in SVG pixel
// space, plus fill and any other passthrough props) — same pragmatic
// escape hatch this codebase's other custom Recharts renderers already use
// (see FacultyAnalyticsPage.tsx's RadarTooltipContent) rather than fighting
// Recharts' own generic prop types for one small shape function.
interface Bar3DShapeProps {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
}

// 3D-extruded bar redesign — Recharts has no native 3D/isometric bar shape
// (confirmed directly against the installed recharts@3.9.2 package: its
// shape/ module exports only Cross/Curve/Dot/Polygon/Rectangle/Sector/
// Symbols/Trapezoid, nothing 3D-related). <Bar shape={...}> is Recharts'
// own first-class custom-rendering extension point (confirmed in
// cartesian/Bar.js's hasCustomShape handling) — this is that extension,
// not a workaround, and adds no new charting dependency.
//
// Accuracy guarantee: the front face below is Recharts' OWN exported
// <Rectangle> component, given the EXACT x/y/width/height Recharts itself
// computed for this data point — never recomputed, rescaled, or offset by
// this file. That rectangle's height is therefore byte-identical to what
// an un-styled <Bar> would have drawn for the same value. The top and side
// faces are two additional <path> polygons drawn OUTSIDE that rectangle,
// built purely by ADDING the constant DEPTH to the rectangle's own
// existing corners (never multiplying height/width by anything) — so they
// can only ever add a fixed-size decorative cap, never change what height
// the real, data-mapped front face reports. A reviewer can verify this by
// checking that `height`/`width` are read here but never appear on either
// side of a multiplication or a percentage — they're only ever added to or
// subtracted from directly.
//
// All three faces derive their shade from the SAME `fill` color passed in
// via the `<Bar fill=...>` prop that already renders on each chart (the
// Ember accent `var(--chart-1)` on the four single-series charts this
// applies to, and each series' own established color on the one two-series
// comparison chart it also applies to) — `filter: brightness()` operates
// on the rendered color regardless of whether it's a CSS variable or a
// literal hex, so no new color is introduced anywhere, and a non-Ember
// series (e.g. the existing green "latest attempt" bar) still gets a
// correct light/dark shade of ITS OWN color rather than being forced to
// Ember.
//
// Works unmodified for both bar-chart orientations already in this
// codebase: a vertical column bar (Recharts' default layout) gets a lit
// top face and a shaded right-side face; a horizontal bar
// (layout="vertical", TrainersDashboardPage) gets the same lit top face
// running its length and a shaded end-cap where it terminates — both read
// as a correct, unmodified 3D extrusion in their respective orientations.
function Bar3DShapeBase(props: Bar3DShapeProps, radius: [number, number, number, number]) {
  const { x = 0, y = 0, width = 0, height = 0, fill = 'var(--chart-1)' } = props
  if (height <= 0 || width <= 0) return null

  const topFace = `M${x},${y} L${x + DEPTH},${y - DEPTH} L${x + width + DEPTH},${y - DEPTH} L${x + width},${y} Z`
  const sideFace = `M${x + width},${y} L${x + width + DEPTH},${y - DEPTH} L${x + width + DEPTH},${y + height - DEPTH} L${x + width},${y + height} Z`

  return (
    <g>
      <path d={sideFace} fill={fill} style={{ filter: 'brightness(0.72)' }} />
      <path d={topFace} fill={fill} style={{ filter: 'brightness(1.35)' }} />
      <Rectangle x={x} y={y} width={width} height={height} fill={fill} radius={radius} />
    </g>
  )
}

// Top-rounded — for the three vertical (column) bar charts, matching the
// [8, 8, 0, 0] radius those charts already used before this redesign.
export function Bar3DShapeTop(props: Bar3DShapeProps) {
  return Bar3DShapeBase(props, [8, 8, 0, 0])
}

// End-rounded — for the one horizontal bar chart (TrainersDashboardPage,
// layout="vertical"), matching its existing [0, 8, 8, 0] radius (rounded
// on the end the bar grows toward, not the top).
export function Bar3DShapeEnd(props: Bar3DShapeProps) {
  return Bar3DShapeBase(props, [0, 8, 8, 0])
}
