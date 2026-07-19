import { Combobox, type ComboboxOption } from '@/components/Combobox'

// Same chip-list multi-select shape as CreateQuestionPage.tsx's
// MultiSelectChips (Combobox to add + removable chips) — reimplemented
// locally rather than imported since that component isn't exported.
// Extracted out of PoolDetailPage.tsx (item 10 tier 3a) once a second call
// site (EditCriterionDialog.tsx) needed it too.
export function TagFilterChips({
  options,
  selectedIds,
  onChange,
  isLoading,
  isError,
}: {
  options: ComboboxOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  isLoading: boolean
  isError: boolean
}) {
  const optionsById = new Map(options.map((o) => [o.value, o.label]))
  const addOptions = options.filter((o) => !selectedIds.includes(o.value))

  return (
    <div className="space-y-1.5">
      {selectedIds.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {selectedIds.map((id) => (
            <li
              key={id}
              className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-brand-primary"
            >
              <span>{optionsById.get(id) ?? id}</span>
              <button
                type="button"
                aria-label={`Remove ${optionsById.get(id) ?? id}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onChange(selectedIds.filter((existing) => existing !== id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <Combobox
        options={addOptions}
        value={null}
        onSelect={(value) => onChange([...selectedIds, value])}
        placeholder="Search tags to add…"
        isLoading={isLoading}
        isError={isError}
        errorMessage="Failed to load tags."
        emptyMessage={isLoading ? 'Loading…' : 'No tags found.'}
      />
    </div>
  )
}
