import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isFullscreenSupported } from '@/lib/fullscreen'
import { checkCameraAccess, checkMicrophoneAccess } from '@/lib/mediaPermissions'
import { checkNetworkStability } from '@/lib/networkCheck'
import { cn } from '@/lib/utils'

type CheckId = 'camera' | 'microphone' | 'network' | 'fullscreen'
type CheckStatus = 'checking' | 'success' | 'failure'
interface CheckItemState {
  status: CheckStatus
  reason?: string
}

const CHECK_ORDER: CheckId[] = ['camera', 'microphone', 'network', 'fullscreen']

// Only camera/microphone ever show a retry button. Network and fullscreen
// are automatic checks, not permission prompts — there is nothing for the
// student to "allow," so no button is invented for either: a failed network
// check means the backend was genuinely unreachable just now (retrying
// immediately wouldn't be more informative than the reason text already
// given), and a failed fullscreen check means this browser doesn't support
// the API at all (no action the student can take fixes that from this
// screen). Camera/microphone are different — permission denial is something
// the student can reconsider (browser permission UI, OS-level toggle), so
// retrying the actual getUserMedia call is a real, useful action.
const CHECK_META: Record<CheckId, { label: string; description: string; retryable: boolean }> = {
  camera: {
    label: 'Camera',
    description: 'Some assessments monitor you via camera during your attempt.',
    retryable: true,
  },
  microphone: {
    label: 'Microphone',
    description: 'Some assessments may require audio monitoring during your attempt.',
    retryable: true,
  },
  network: {
    label: 'Network Stability',
    description: 'Confirms we can reach our servers before you begin.',
    retryable: false,
  },
  fullscreen: {
    label: 'Fullscreen',
    description: 'Confirms your browser supports fullscreen mode, required by some assessments.',
    retryable: false,
  },
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'checking') {
    return <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
  }
  if (status === 'success') {
    return <CheckCircle2 className="size-4 shrink-0 text-green-600 dark:text-green-500" aria-hidden="true" />
  }
  return <XCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
}

interface SystemCheckCardProps {
  // AssessmentInstructionsPage gates its "I understand, start assessment"
  // button on this — see that file's own comment on why all four checks are
  // unconditional (not skipped for assessments that don't require camera/
  // fullscreen), the same CodeSignal-style "confirm the environment is
  // ready" pass CLAUDE1.md's design references call out, run identically
  // regardless of this specific assessment's proctoring flags.
  onAllChecksPassedChange: (allPassed: boolean) => void
}

// Pre-attempt "System Check" card, second column next to the instructions
// card on AssessmentInstructionsPage (CodeSignal's pre-assessment
// environment-check flow, per CLAUDE1.md's design references). All four
// checks fire automatically on mount — no click gate for the FIRST attempt
// at any of them, matching the exact precedent CameraPreview.tsx already
// set for requesting camera access unprompted the instant it mounts, not
// gated behind a button the student has to find first.
export function SystemCheckCard({ onAllChecksPassedChange }: SystemCheckCardProps) {
  const [checks, setChecks] = useState<Record<CheckId, CheckItemState>>({
    camera: { status: 'checking' },
    microphone: { status: 'checking' },
    network: { status: 'checking' },
    fullscreen: { status: 'checking' },
  })

  function runCameraCheck() {
    setChecks((prev) => ({ ...prev, camera: { status: 'checking' } }))
    void checkCameraAccess().then((result) => {
      setChecks((prev) => ({
        ...prev,
        camera: result.ok ? { status: 'success' } : { status: 'failure', reason: result.reason },
      }))
    })
  }

  function runMicrophoneCheck() {
    setChecks((prev) => ({ ...prev, microphone: { status: 'checking' } }))
    void checkMicrophoneAccess().then((result) => {
      setChecks((prev) => ({
        ...prev,
        microphone: result.ok ? { status: 'success' } : { status: 'failure', reason: result.reason },
      }))
    })
  }

  useEffect(() => {
    runCameraCheck()
    runMicrophoneCheck()

    void checkNetworkStability().then((result) => {
      setChecks((prev) => ({
        ...prev,
        network: result.ok ? { status: 'success' } : { status: 'failure', reason: result.reason },
      }))
    })

    // Synchronous — but still modeled as checking -> settled (not rendered
    // as an instant special case) so this row shows the same brief spinner
    // every other row does, rather than looking like it was skipped.
    // isFullscreenSupported() is a SUPPORT check only (lib/fullscreen.ts's
    // own comment) — it confirms the browser CAN enter fullscreen, not that
    // it currently is. Actual entry still requires a live click, which only
    // happens later at handleStart on this same page; this card never
    // claims otherwise.
    setChecks((prev) => ({
      ...prev,
      fullscreen: isFullscreenSupported()
        ? { status: 'success' }
        : { status: 'failure', reason: 'Fullscreen mode is not supported in this browser.' },
    }))
    // Deliberately empty — every check here is a one-shot browser/network
    // probe with no reactive dependency; re-running on some other value
    // changing would just re-trigger real permission prompts/network calls
    // for no reason. runCameraCheck/runMicrophoneCheck are stable function
    // references for this component's lifetime (not recreated per render in
    // a way that would matter here).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allPassed = CHECK_ORDER.every((id) => checks[id].status === 'success')

  useEffect(() => {
    onAllChecksPassedChange(allPassed)
  }, [allPassed, onAllChecksPassedChange])

  return (
    <div className="rounded-lg border border-border bg-background p-6 shadow-sm">
      <h2 className="font-heading text-xl font-semibold text-brand-primary">System Check</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        We check your camera, microphone, connection, and browser before you begin.
      </p>

      <ul className="mt-4 space-y-2.5">
        {CHECK_ORDER.map((id) => {
          const meta = CHECK_META[id]
          const state = checks[id]
          return (
            <li
              key={id}
              className={cn(
                'flex items-start justify-between gap-3 rounded-md border p-3',
                state.status === 'failure' ? 'border-destructive/30 bg-destructive/5' : 'border-border',
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusIcon status={state.status} />
                  <span className="text-sm font-medium text-brand-primary">{meta.label}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
                {state.status === 'failure' && (
                  <p className="mt-1 text-xs text-destructive">{state.reason}</p>
                )}
              </div>
              {meta.retryable && state.status === 'failure' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={id === 'camera' ? runCameraCheck : runMicrophoneCheck}
                >
                  Allow access
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
