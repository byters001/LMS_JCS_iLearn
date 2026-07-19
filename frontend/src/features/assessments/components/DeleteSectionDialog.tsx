import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDeleteSection } from '../api'
import type { AssessmentSection } from '../types'

interface DeleteSectionDialogProps {
  assessmentId: string
  section: AssessmentSection
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Unlike questions/pools/assessments in every prior tier, this one really
// is a hard delete (no deleted_at on assessment_sections — confirmed
// against schema.sql and assessments.repository.ts's deleteAssessmentSection,
// a literal DELETE). That means assessment_questions.assessment_section_id
// and assessment_section_pools.assessment_section_id — both
// ON DELETE CASCADE onto assessment_sections(id) — genuinely fire here,
// not defeated the way every other tier's soft-delete-vs-RESTRICT gap was.
// This is intended, correct cleanup, not an orphaning risk: a section's
// attached questions/pool-links have no meaning independent of their
// parent section, so removing them along with it is exactly what should
// happen — same as tier 3a's questions being fine to soft-delete because
// nothing downstream depended on the questions row itself. Only ever
// reachable while the parent assessment is 'draft' (assertAssessmentEditable,
// backend-enforced, mirrored by AssessmentEditPage hiding this button
// outside draft) — so there's never a live attempt depending on this
// section's content either.
export function DeleteSectionDialog({
  assessmentId,
  section,
  open,
  onOpenChange,
}: DeleteSectionDialogProps) {
  const deleteSection = useDeleteSection(assessmentId)

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      deleteSection.reset()
    }
    onOpenChange(nextOpen)
  }

  function handleConfirm() {
    deleteSection.mutate(section.id, { onSuccess: () => handleClose(false) })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {section.title}?</DialogTitle>
          <DialogDescription>
            Removes this section along with every question or pool currently attached to it. This
            action cannot be undone from the UI.
          </DialogDescription>
        </DialogHeader>

        {deleteSection.isError && (
          <p className="text-sm text-destructive">
            {deleteSection.error instanceof ApiError
              ? deleteSection.error.message
              : 'Failed to delete section. Please try again.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteSection.isPending}
            onClick={handleConfirm}
          >
            {deleteSection.isPending ? 'Deleting…' : 'Delete Section'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
