import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
}

interface ComboboxProps {
  id?: string
  options: ComboboxOption[]
  value: string | null
  onSelect: (value: string) => void
  placeholder?: string
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  emptyMessage?: string
  disabled?: boolean
  className?: string
}

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent disabled:cursor-not-allowed disabled:opacity-50'

// Generic searchable single-select — feature code supplies `options` (already
// fetched/filtered upstream) plus a `value`/`onSelect` pair, same shape as a
// controlled <select>. Filtering happens here, client-side, against
// `option.label` — callers decide what goes into that label (truncated
// question text, a pool name, a batch name) and whether `options` itself
// came from a server-side filtered fetch or a bare page fetched once. No
// Radix/cmdk dependency: nothing in this codebase's package.json provides a
// combobox primitive to scaffold via the shadcn CLI, so this is a small
// hand-built listbox-over-a-text-input rather than pulling in a new
// dependency for three call sites.
export function Combobox({
  id,
  options,
  value,
  onSelect,
  placeholder,
  isLoading,
  isError,
  errorMessage,
  emptyMessage,
  disabled,
  className,
}: ComboboxProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find((option) => option.value === value) ?? null

  const filtered =
    query.trim() === ''
      ? options
      : options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={id ? `${id}-listbox` : undefined}
        autoComplete="off"
        disabled={disabled || isLoading}
        placeholder={isLoading ? 'Loading…' : placeholder}
        className={inputClassName}
        value={isOpen ? query : (selected?.label ?? '')}
        onFocus={() => {
          setIsOpen(true)
          setQuery('')
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setIsOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsOpen(false)
            event.currentTarget.blur()
          } else if (event.key === 'Enter') {
            event.preventDefault()
            if (filtered.length > 0) {
              onSelect(filtered[0].value)
              setIsOpen(false)
              setQuery('')
            }
          }
        }}
      />

      {isOpen && (
        <div
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-input bg-background shadow-md"
        >
          {isError ? (
            <p className="p-2 text-sm text-destructive">
              {errorMessage ?? 'Failed to load options.'}
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">{emptyMessage ?? 'No matches.'}</p>
          ) : (
            filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onSelect(option.value)
                  setIsOpen(false)
                  setQuery('')
                }}
                className={cn(
                  'block w-full truncate px-3 py-2 text-left text-sm hover:bg-muted',
                  option.value === value && 'bg-muted font-medium text-brand-primary',
                )}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
