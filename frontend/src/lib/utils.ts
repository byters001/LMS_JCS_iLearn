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
export const CARD_GRADIENT = "bg-gradient-to-br from-brand-primary/5 to-transparent"
