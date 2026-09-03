import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Shared HackerRank-style card treatment — a soft directional tint fading to
// transparent, layered on TOP of each card's own bg-card/bg-background (this
// sets background-image, which paints over background-color, so the opaque
// base still shows through where the gradient ends transparent). One
// constant so every card in the app uses the exact same direction/intensity
// rather than a hand-tuned value per component.
//
// Bug fix (reported "blue gradient on cards" after Obsidian & Ember) — this
// used to read `from-brand-accent/20`. `brand-accent` (tailwind.config.js)
// is a STATIC hex (#4A44C4, the old pre-Obsidian&Ember indigo brand color),
// not a CSS-variable-backed token, so it never picked up the Obsidian &
// Ember recolor (or dark mode) at all: every <Card> in the app — this
// constant is baked into card.tsx's own base className — was silently
// painting a translucent indigo/blue wash in every phase since, regardless
// of theme. `primary` is the correct token here instead: it already
// resolves to the ember accent inside `.app-shell` (light AND dark) and
// isn't used anywhere the exam screen (features/attempts, never wrapped in
// `.app-shell`) would see it, since Card itself is never rendered there.
// `/8` (not the old `/20`) matches the exact value StudentDashboardPage.tsx
// and StudentAssessmentsPage.tsx were already hand-overriding to per-
// instance before this fix — those overrides are now redundant no-ops, not
// touched here to keep this a minimal, single-source fix.
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
export const CARD_GRADIENT = "bg-linear-to-br from-primary/8 to-transparent"
