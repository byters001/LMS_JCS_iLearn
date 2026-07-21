import { useEffect, useRef, useState } from 'react'

// Item 1 — a purely local live mirror. NO recording, NO snapshot capture,
// NO upload: the MediaStream opened below is attached directly to a
// <video> element's srcObject and never read, saved, or sent anywhere —
// nothing leaves the browser. Only ever mounted by AttemptPage when
// assessment.proctoringCameraRequired is true (same gating pattern as the
// fullscreen lockdown from the previous phase) — this component itself has
// no opinion on that flag, it just requests the camera unconditionally the
// instant it mounts.
export function CameraPreview() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false

    async function start() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: true })
        if (cancelled) {
          // Unmounted while the permission prompt was still pending — don't
          // leave a live camera light on for a component that no longer
          // exists.
          media.getTracks().forEach((track) => track.stop())
          return
        }
        stream = media
        if (videoRef.current) videoRef.current.srcObject = media
      } catch {
        // Permission denied, no camera present, or the API doesn't exist at
        // all (e.g. a non-HTTPS context) — same "don't strand the student"
        // principle as item 2's fullscreen-rejection handling: a clear
        // inline message in this same corner box, never a blocking error
        // that stops the student from taking the assessment.
        if (!cancelled) setError('Camera unavailable — check your browser permissions.')
      }
    }

    void start()

    return () => {
      cancelled = true
      // Stop every track on unmount — a live camera light staying on after
      // leaving this screen would be a real privacy issue, not just a UI
      // nicety.
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  // Layout phase — positioning only, moved from a fixed bottom-right corner
  // box into a normal in-flow child of AttemptPage's top monitoring bar
  // (rendered right next to AttemptTimer there, per this phase's "timer and
  // camera together" requirement). No `fixed`/corner classes anymore since
  // the CALLER now controls placement by where it's laid out in flex flow,
  // not this component positioning itself. Sized down slightly from the
  // previous 160x120 corner box to sit naturally next to the timer's compact
  // pill rather than towering over it — still clearly a live preview, still
  // "small" per this phase's own instruction. getUserMedia logic above is
  // completely unchanged.
  return (
    <div className="h-[72px] w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-black/80 shadow-sm">
      {error ? (
        <div className="flex h-full w-full items-center justify-center p-1.5 text-center text-[10px] leading-tight text-white/80">
          {error}
        </div>
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      )}
    </div>
  )
}
