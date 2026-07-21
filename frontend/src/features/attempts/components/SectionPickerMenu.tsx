import { List, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface SectionPickerSection {
  sectionId: string
  title: string
}

interface SectionPickerMenuProps {
  sections: SectionPickerSection[]
  activeSectionId: string
  onSelectSection: (sectionId: string) => void
}

// Header-title phase — REPLACES the prior phase's horizontal SectionTabs
// strip entirely (that file is deleted, not kept alongside this one).
// Reasoning: real exam portals (NEOPAT/FacePrep/HackerRank) collapse section
// navigation into exactly this menu pattern rather than a persistent tab
// strip permanently eating header width — especially relevant now that the
// header also carries the assessment title + current section title (see
// AttemptPage.tsx's new header row). Only ever rendered by AttemptPage when
// there is more than one section, same gate the old tab strip used.
// onSelectSection is the SAME callback AttemptPage already built for the old
// tab strip (jump to that section's first question) — reused as-is, not
// duplicated.
//
// Click-outside-to-dismiss follows NotificationBell.tsx's existing pattern
// exactly (a containerRef + a mousedown listener on document), not a new
// mechanism. This additionally gets an explicit X button inside the panel —
// this phase's own "dismissible via clicking outside or an X" requirement is
// more than NotificationBell's dropdown offers (click-outside only).
export function SectionPickerMenu({
  sections,
  activeSectionId,
  onSelectSection,
}: SectionPickerMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  function handleSelect(sectionId: string) {
    onSelectSection(sectionId)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Jump to section"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-brand-primary"
      >
        <List className="size-4" />
      </button>

      {/* Bounded popup anchored to the button, NOT a full-screen overlay —
          same "similar width to a typical dropdown menu" shape as
          NotificationBell's own panel, just narrower (this only ever lists
          short section titles, no rich content). */}
      {isOpen && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold text-brand-primary">Sections</p>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setIsOpen(false)}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-brand-primary"
            >
              <X className="size-4" />
            </button>
          </div>

          <ul className="max-h-80 overflow-y-auto p-1.5">
            {sections.map((section) => {
              const isActive = section.sectionId === activeSectionId
              return (
                <li key={section.sectionId}>
                  <button
                    type="button"
                    onClick={() => handleSelect(section.sectionId)}
                    aria-current={isActive}
                    className={cn(
                      'block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      isActive
                        ? 'bg-brand-accent/10 font-medium text-brand-accent'
                        : 'text-muted-foreground hover:bg-muted hover:text-brand-primary',
                    )}
                  >
                    {section.title}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
