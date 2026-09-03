import { Area, AreaChart, ResponsiveContainer } from 'recharts'

interface SparklineProps {
  // A short series of raw values (e.g. last N days' attempt counts / average
  // scores) — no labels, no axes: this is a glanceable trend shape for a
  // stat card, not a readable chart. Rendered blank (nothing painted) below
  // two points, since a trend needs at least two points to show direction.
  data: number[]
  className?: string
  // Token name, not a raw hex — resolves against the accent-*/status-*
  // ramps already defined in globals.css so this repaints correctly in both
  // light and dark app-shell scopes with zero props needed per caller.
  colorVar?: string
  height?: number
}

export function Sparkline({ data, className, colorVar = 'var(--chart-1)', height = 32 }: SparklineProps) {
  if (data.length < 2) return null

  const points = data.map((value, index) => ({ index, value }))
  const gradientId = `sparkline-fill-${colorVar.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <div className={className} style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorVar} stopOpacity={0.35} />
              <stop offset="100%" stopColor={colorVar} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={colorVar}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
