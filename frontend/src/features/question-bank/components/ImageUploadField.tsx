import { useRef, useState } from 'react'
import { ApiError } from '@/api'
import { useUploadQuestionImage } from '../api'

interface ImageUploadFieldProps {
  label: string
  value: string | undefined
  onChange: (imageUrl: string | undefined) => void
  disabled?: boolean
  className?: string
}

// Must match the backend's own limit/wording exactly (backend/src/
// integrations/supabase/storage.constants.ts's IMAGE_UPLOAD_MAX_SIZE_BYTES /
// IMAGE_UPLOAD_SIZE_ERROR_MESSAGE, enforced in question-bank.controller.ts's
// uploadQuestionImage) — so a user never sees two different limit numbers
// depending on whether the rejection happens client- or server-side.
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024
const IMAGE_SIZE_ERROR_MESSAGE = 'Image exceeds the 2MB limit — please upload a smaller file.'

// Small reusable control backing item 2's per-question and per-option image
// uploads: pick a file -> upload it immediately (POST /questions/images) ->
// store just the resulting imageUrl in the caller's form state -> preview +
// remove/replace. "Remove" only clears the field client-side, it doesn't
// call a delete endpoint — a discarded-before-submit upload becomes an
// orphaned storage object, the same class of cleanup
// jobs/temp-storage-purge.job.ts is reserved for (a stub today) rather than
// this form's job. Value is a bare imageUrl string (not File | string) so
// this slots into react-hook-form's setValue/watch the same way Combobox
// does elsewhere in this codebase — no extra field-level state to thread
// through the parent form.
export function ImageUploadField({
  label,
  value,
  onChange,
  disabled,
  className,
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadQuestionImage()
  // Separate from upload.isError — a size rejection never reaches the
  // mutation at all (caught before upload.mutate is called), so it needs its
  // own local error state rather than piggybacking on the mutation's.
  const [sizeError, setSizeError] = useState<string | null>(null)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setSizeError(IMAGE_SIZE_ERROR_MESSAGE)
      return
    }
    setSizeError(null)

    upload.mutate(file, {
      onSuccess: (result) => onChange(result.imageUrl),
    })
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || upload.isPending}
      />

      {value ? (
        <div className="flex items-center gap-2">
          <img src={value} alt={label} className="size-14 shrink-0 rounded object-cover" />
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="text-xs font-medium text-brand-accent hover:underline"
              disabled={disabled || upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-destructive"
              disabled={disabled || upload.isPending}
              onClick={() => onChange(undefined)}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="rounded-md border border-dashed border-input px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:border-brand-accent hover:text-brand-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? 'Uploading…' : `Add ${label}`}
        </button>
      )}

      {sizeError && <p className="mt-1 text-xs text-destructive">{sizeError}</p>}

      {!sizeError && upload.isError && (
        <p className="mt-1 text-xs text-destructive">
          {upload.error instanceof ApiError ? upload.error.message : 'Failed to upload image.'}
        </p>
      )}
    </div>
  )
}
