import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Pill-shaped tag badges — font-mono (JetBrains Mono) matches the
// labels/metadata/tags pairing used on cards app-wide.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 font-mono text-[11px] font-medium whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        accent: "bg-accent text-accent-foreground",
        outline: "border-border text-foreground",
        destructive: "bg-destructive/10 text-destructive",
        success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        // Semantic status variants — status/accent tokens, never color alone
        // (each pairs with a dot indicator by default, see DOT_CLASS below).
        live: "bg-status-success-bg text-status-success-fg",
        scheduled: "bg-accent-indigo-bg text-accent-indigo-fg",
        closed: "bg-status-neutral-bg text-status-neutral-fg",
        warning: "bg-status-warning-bg text-status-warning-fg",
        danger: "bg-status-danger-bg text-status-danger-fg",
        neutral: "bg-status-neutral-bg text-status-neutral-fg",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// Dot color per semantic variant — variants not listed here (default/
// secondary/accent/outline/destructive) keep their existing plain-pill look
// unless the caller explicitly opts in via the `dot` prop.
const DOT_CLASS: Partial<Record<NonNullable<VariantProps<typeof badgeVariants>["variant"]>, string>> = {
  live: "bg-status-success-fg",
  scheduled: "bg-accent-indigo-fg",
  closed: "bg-status-neutral-fg",
  success: "bg-status-success-fg",
  warning: "bg-status-warning-fg",
  danger: "bg-status-danger-fg",
  neutral: "bg-status-neutral-fg",
}

function Badge({
  className,
  variant,
  dot,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean; dot?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"
  const dotClass = variant ? DOT_CLASS[variant] : undefined
  const showDot = !asChild && (dot ?? Boolean(dotClass))

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {showDot && <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", dotClass ?? "bg-current")} />}
      {children}
    </Comp>
  )
}

export { Badge, badgeVariants }
