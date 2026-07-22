import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Shared HackerRank-style card treatment (CLAUDE1.md brand tokens only) — a
// soft directional tint fading to transparent, layered on TOP of each card's
// own bg-card/bg-background (this sets background-image, which paints over
// background-color, so the opaque base still shows through where the
// gradient ends transparent). One constant so every card in the app uses
// the exact same direction/intensity rather than a hand-tuned value per
// component.
//
// MUST be `bg-linear-to-br`, not the Tailwind v3 name `bg-gradient-to-br`:
// this project is on Tailwind v4 (bg-linear-* is the v4 gradient-direction
// utility), and tailwind-merge@3.6.0 (also v4-aligned) does not recognize
// `bg-gradient-to-*` as the "background-image" class group — it silently
// falls into the same conflict group as `bg-card`/`bg-background` and gets
// merged away, stripping the card's opaque base entirely (confirmed via
// `twMerge('bg-card', 'bg-gradient-to-br')` -> 'bg-gradient-to-br', vs
// `twMerge('bg-card', 'bg-linear-to-br')` -> both kept). Tailwind's own
// compiler still generates CSS for the old name, which is what made this
// so easy to miss — the class "worked" in isolation, just not merged with
// a base background.
export const CARD_GRADIENT = "bg-linear-to-br from-brand-accent/20 to-transparent"
