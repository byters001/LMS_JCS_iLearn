import * as React from "react"

import { CARD_GRADIENT, CARD_HOVER_LIFT, cn } from "@/lib/utils"

// Soft & Organic phase (approved direction, 3-mockup review) — shadow-based
// elevation replaces the hard border, and the radius jumps from rounded-lg
// (10px) to rounded-3xl, which resolves to 24-32px under `.app-shell`'s new
// --radius scoping (globals.css) while staying byte-identical everywhere
// `.app-shell` isn't applied (the exam screen never uses this component at
// all, so that's moot for Card specifically, but the same token is shared
// with Button/Input which DO render there — see globals.css's own comment).
// shadow-md (not shadow-sm) is deliberate: with the border gone, elevation
// is the ONLY thing separating a card from its background now, so it needs
// to actually read at a glance, not just be technically present.
// `interactive` is opt-in, NOT the default — Card is also the base for page-
// section containers (forms, table wrappers, detail panels) that aren't
// discrete clickable/actionable tiles at all, and those should never lift on
// hover just because they happen to use <Card>. Pass `interactive` only on
// genuine entity/action tiles (a batch/college card, a stat tile meant to
// read as one, etc.) — see CARD_HOVER_LIFT's own comment in lib/utils.ts.
function Card({
  className,
  interactive,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-3 rounded-3xl bg-card text-card-foreground shadow-md",
        CARD_GRADIENT,
        interactive && CARD_HOVER_LIFT,
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 px-4 pt-4", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-heading text-base font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("ml-auto self-start", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-4", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-4 pb-4", className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter }
